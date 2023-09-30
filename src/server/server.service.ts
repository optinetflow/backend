/* eslint-disable max-len */
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from 'nestjs-prisma';
import { firstValueFrom } from 'rxjs';

import { Domain } from '../arvan/models/domain.model';
import { errors } from '../common/errors';
import { asyncShellExec } from '../common/helpers';
import { MinioClientService } from '../minio/minio.service';
import { XuiService } from '../xui/xui.service';
import { CreateServerInput } from './dto/createServer.input';
import { IssueCertInput } from './dto/issueCert.input';
import { Server } from './models/server.model';

@Injectable()
export class ServerService {
  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly minioService: MinioClientService,
    private readonly xuiService: XuiService,
  ) {}

  private readonly logger = new Logger(ServerService.name);

  async issueCert(data: IssueCertInput): Promise<Domain> {
    const domain = data.domain;

    const domainInfo = await this.prisma.domain.findFirst({
      where: {
        domain,
        nsState: 'APPLIED',
      },
      include: {
        server: true,
      },
    });

    if (!domainInfo) {
      throw new BadRequestException('Domain not found!');
    }

    const updatedDomain = await this.getLetEncryptSsl(domain, domainInfo.server.ip);
    await this.syncCertFiles();

    return updatedDomain;
  }

  async getLetEncryptSsl(domain: string, ip: string): Promise<Domain> {
    try {
      await asyncShellExec(
        `ssh -o StrictHostKeyChecking=no root@${ip} -p 2211 '
          ~/.acme.sh/acme.sh --issue --force -d ${domain} --standalone &&
          mkdir -p /v/${domain} && 
          ~/.acme.sh/acme.sh --installcert -d ${domain} --key-file /v/${domain}/private.key --fullchain-file /v/${domain}/cert.crt
        '`,
      );
    } catch {
      console.error(`Cert is already issued on ${ip} server.`);

      throw new BadRequestException(`Cert is already issued on ${ip} server.`);
    }

    try {
      await this.copyFromServer(ip, `/v/${domain}`, '/v');
      await this.minioService.uploadDir(`/v/${domain}`, `/certs/${domain}`);

      return await this.prisma.domain.update({
        where: {
          domain,
        },
        data: {
          letsEncryptSsl: 'APPLIED',
        },
      });
    } catch (error) {
      console.error('Error in copping LetEncrypt from server.', error);

      throw new BadRequestException('Error in issuing cert.');
    }
  }

  async copyFromServer(ip: string, sourcePath: string, localPath: string) {
    try {
      await asyncShellExec(
        `
          mkdir -p ${localPath} &&
          rsync -e 'ssh -p 2211 -o StrictHostKeyChecking=no' -avz root@${ip}:${sourcePath} ${localPath}
        `,
      );
    } catch (error) {
      console.error('Error in copping from server.', error);

      throw new BadRequestException('Error in copping from server.');
    }
  }

  async createServer(input: CreateServerInput): Promise<Server> {
    try {
      await asyncShellExec(`ssh -o StrictHostKeyChecking=no root@${input.ip} -p 2211 'ls'`);
    } catch {
      throw new BadRequestException(errors.server.addingServerFailed);
    }

    const token = await this.xuiService.login(input.domain);

    try {
      return await this.prisma.server.create({
        data: {
          ip: input.ip,
          domain: input.domain,
          type: input.type,
          token,
        },
      });
    } catch {
      throw new BadRequestException(errors.server.serverAlreadyExist);
    }
  }

  async uploadCertsToMinio() {
    const servers = (await this.prisma.server.findMany()).filter((s) => s.domain !== 'akbari51.sbs');

    for (const server of servers) {
      try {
        await this.copyFromServer(server.ip, '/v', '/');
        await this.minioService.uploadDir('/v', '/certs');
      } catch (error) {
        console.error('Error in copping cert files from the server to minio', error);
      }
    }
  }

  async syncCertFiles() {
    await this.uploadCertsToMinio();
    const servers = (await this.prisma.server.findMany()).filter((s) => s.domain !== 'akbari51.sbs');
    await this.minioService.downloadDir('certs', '/v');

    for (const server of servers) {
      try {
        await asyncShellExec(
          `
            rsync -e 'ssh -p 2211 -o StrictHostKeyChecking=no' -avz /v/* root@${server.ip}:/v
          `,
        );
      } catch (error) {
        console.error('Error in syncing cert files to the server by scp', error);
      }
    }

    const certObjects = await this.minioService.getDir('cert');
    const issuedDomains = certObjects.map((i) => i.name.split('/')[1]);

    await this.prisma.domain.updateMany({
      where: {
        domain: {
          in: issuedDomains,
        },
      },
      data: {
        letsEncryptSsl: 'APPLIED',
      },
    });
  }

  // @Interval('notifications', 2 * 60 * 1000)
  async getXuiDatabases() {
    this.logger.debug('GetXuiDatabases called every 2 minutes');
    const servers = await this.prisma.server.findMany();

    for (const server of servers) {
      try {
        await asyncShellExec(
          `
            mkdir -p /x-ui/${server.id} &&
            scp -o StrictHostKeyChecking=no -P 2211 -r root@${server.ip}:/etc/x-ui/x-ui.db /x-ui/${server.id}/
          `,
        );
        await this.minioService.uploadByPath({
          filePath: `/x-ui/${server.id}/x-ui.db`,
          toMinioDir: 'x-ui',
          fileName: `${server.id}.db`,
        });
      } catch {
        throw new BadRequestException(errors.server.addingServerFailed);
      }
    }
  }

  @Interval('updateLetsEncryptSslStates', 60 * 60 * 1000)
  async updateLetsEncryptSslStates() {
    this.logger.debug('UpdateLetsEncryptSslStates called every 1 hours');
    const appliedDomains: string[] = [];
    const pendingDomains = await this.prisma.domain.findMany({
      where: {
        nsState: 'APPLIED',
        letsEncryptSsl: 'PENDING',
      },
      include: {
        server: true,
      },
    });

    for (const pendingDomain of pendingDomains) {
      try {
        await this.getLetEncryptSsl(pendingDomain.domain, pendingDomain.server.ip);
        console.info('Let CERT created.', pendingDomain.domain);
        appliedDomains.push(pendingDomain.id);
      } catch {
        console.error(`We couldn't get LetEncryptSsl for ${pendingDomain.domain}`);
      }
    }

    if (appliedDomains.length > 0) {
      await this.prisma.domain.updateMany({
        where: {
          id: {
            in: appliedDomains,
          },
        },
        data: {
          letsEncryptSsl: 'APPLIED',
        },
      });
      await this.syncCertFiles();
    }
  }
}
