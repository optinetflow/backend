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
        `ssh -o StrictHostKeyChecking=no ubuntu@${ip} -p 2211 'sudo su -c "
          ~/.acme.sh/acme.sh --issue -d ${domain} --standalone && 
          mkdir -p /v/${domain} && 
          ~/.acme.sh/acme.sh --installcert -d ${domain} --key-file /v/${domain}/private.key --fullchain-file /v/${domain}/cert.crt
        "'`,
      );
    } catch {
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
      console.error('Error in getting LetEncrypt Ssl.', error);

      throw new BadRequestException('Error in issuing cert.');
    }
  }

  async copyFromServer(ip: string, sourcePath: string, localPath: string) {
    try {
      await asyncShellExec(
        `mkdir -p ${localPath} &&
        ssh -o StrictHostKeyChecking=no ubuntu@${ip} -p 2211 'sudo su -c "chown -R ubuntu ${sourcePath}"' &&
        scp -o StrictHostKeyChecking=no -P 2211 -r ubuntu@${ip}:${sourcePath} ${localPath}`,
      );
    } catch (error) {
      console.error('Error in copping from server.', error);

      throw new BadRequestException('Error in copping from server.');
    }
  }

  async createServer(input: CreateServerInput): Promise<Server> {
    try {
      await asyncShellExec(`ssh -o StrictHostKeyChecking=no ubuntu@${input.ip} -p 2211 'sudo su -c "ls"'`);
    } catch {
      throw new BadRequestException(errors.server.addingServerFailed);
    }

    try {
      return await this.prisma.server.create({
        data: {
          ip: input.ip,
          domain: input.domain,
          type: input.type,
        },
      });
    } catch {
      throw new BadRequestException(errors.server.serverAlreadyExist);
    }
  }

  async syncCertFiles() {
    const servers = await this.prisma.server.findMany();
    await this.minioService.downloadDir('certs', '/v');

    for (const server of servers) {
      try {
        await asyncShellExec(
          `
          ssh -o StrictHostKeyChecking=no ubuntu@${server.ip} -p 2211 'sudo su -c "mkdir -p /v && chown -R ubuntu /v"' &&
          scp -o StrictHostKeyChecking=no -P 2211 -r /v/* ubuntu@${server.ip}:/v
          `,
          (data) => console.info('data', data),
        );
      } catch (error) {
        console.error('Error in syncing cert files.', error);
      }
    }
  }

  @Interval('notifications', 60 * 60 * 1000)
  async updateLetsEncryptSslStates() {
    this.logger.debug('Called every 1 hours');
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
