/* eslint-disable max-len */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import fs from 'fs';
import { PrismaService } from 'nestjs-prisma';

import { PostgresConfig } from '../common/configs/config.interface';
import { asyncShellExec } from '../common/helpers';
import { I18nService } from '../common/i18/i18.service';
import { BrandService } from './../brand/brand.service';
import { TelegramService } from './../telegram/telegram.service';

@Injectable()
export class ServerService {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly brandService: BrandService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly i18: I18nService,
  ) {}

  private readonly logger = new Logger(ServerService.name);

  // async issueCert(data: IssueCertInput): Promise<Domain> {
  //   const domain = data.domain;

  //   const domainInfo = await this.prisma.domain.findFirst({
  //     where: {
  //       domain,
  //       nsState: 'APPLIED',
  //     },
  //     include: {
  //       server: true,
  //     },
  //   });

  //   if (!domainInfo) {
  //     throw new BadRequestException('Domain not found!');
  //   }

  //   const updatedDomain = await this.getLetEncryptSsl(domain, domainInfo.server.ip);
  //   await this.syncCertFiles();

  //   return updatedDomain;
  // }

  // async getLetEncryptSsl(domain: string, ip: string): Promise<Domain> {
  //   try {
  //     await asyncShellExec(
  //       `ssh -o StrictHostKeyChecking=no root@${ip} -p 2211 '
  //         ~/.acme.sh/acme.sh --issue --force -d ${domain} --standalone &&
  //         mkdir -p /v/${domain} &&
  //         ~/.acme.sh/acme.sh --installcert -d ${domain} --key-file /v/${domain}/private.key --fullchain-file /v/${domain}/cert.crt
  //       '`,
  //     );
  //   } catch {
  //     console.error(`Cert is already issued on ${ip} server.`);

  //     throw new BadRequestException(`Cert is already issued on ${ip} server.`);
  //   }

  //   try {
  //     await this.copyFromServer(ip, `/v/${domain}`, '/v');
  //     await this.minioService.uploadDir(`/v/${domain}`, `/certs/${domain}`);

  //     return await this.prisma.domain.update({
  //       where: {
  //         domain,
  //       },
  //       data: {
  //         letsEncryptSsl: 'APPLIED',
  //       },
  //     });
  //   } catch (error) {
  //     console.error('Error in copping LetEncrypt from server.', error);

  //     throw new BadRequestException('Error in issuing cert.');
  //   }
  // }

  // async copyFromServer(ip: string, sourcePath: string, localPath: string) {
  //   try {
  //     await asyncShellExec(
  //       `
  //         mkdir -p ${localPath} &&
  //         rsync -e 'ssh -p 2211 -o StrictHostKeyChecking=no' -avz root@${ip}:${sourcePath} ${localPath}
  //       `,
  //     );
  //   } catch (error) {
  //     console.error('Error in copping from server.', error);

  //     throw new BadRequestException('Error in copping from server.');
  //   }
  // }

  // async createServer(user: User, input: CreateServerInput): Promise<Server> {
  //   try {
  //     await asyncShellExec(`ssh -o StrictHostKeyChecking=no root@${input.ip} -p 2211 'ls'`);
  //   } catch {
  //     throw new BadRequestException(errors.server.addingServerFailed);
  //   }

  //   const token = await this.xuiService.login(input.domain);

  //   try {
  //     return await this.prisma.server.create({
  //       data: {
  //         ip: input.ip,
  //         domain: input.domain,
  //         type: input.type,
  //         token,
  //         inboundId: input.inboundId,
  //         brandId: user.brandId
  //       },
  //     });
  //   } catch {
  //     throw new BadRequestException(errors.server.serverAlreadyExist);
  //   }
  // }

  // async uploadCertsToMinio() {
  //   const servers = await this.prisma.server.findMany({ where: { deletedAt: null } });

  //   for (const server of servers) {
  //     try {
  //       await this.copyFromServer(server.ip, '/v', '/');
  //       await this.minioService.uploadDir('/v', '/certs');
  //     } catch (error) {
  //       console.error('Error in copping cert files from the server to minio', error);
  //     }
  //   }
  // }

  // async syncCertFiles() {
  //   await this.uploadCertsToMinio();
  //   const servers = await this.prisma.server.findMany({ where: { deletedAt: null } });
  //   await this.minioService.downloadDir('certs', '/v');

  //   for (const server of servers) {
  //     try {
  //       await asyncShellExec(
  //         `
  //           rsync -e 'ssh -p 2211 -o StrictHostKeyChecking=no' -avz /v/* root@${server.ip}:/v
  //         `,
  //       );
  //     } catch (error) {
  //       console.error('Error in syncing cert files to the server by scp', error);
  //     }
  //   }

  //   const certObjects = await this.minioService.getDir('cert');
  //   const issuedDomains = certObjects.map((i) => i.name.split('/')[1]);

  //   await this.prisma.domain.updateMany({
  //     where: {
  //       domain: {
  //         in: issuedDomains,
  //       },
  //     },
  //     data: {
  //       letsEncryptSsl: 'APPLIED',
  //     },
  //   });
  // }

  // @Interval('notifications', 2 * 60 * 1000)
  // async getXuiDatabases() {
  //   this.logger.debug('GetXuiDatabases called every 2 minutes');
  //   const servers = await this.prisma.server.findMany({ where: { deletedAt: null } });

  //   for (const server of servers) {
  //     try {
  //       await asyncShellExec(
  //         `
  //           mkdir -p /x-ui/${server.id} &&
  //           scp -o StrictHostKeyChecking=no -P 2211 -r root@${server.ip}:/etc/x-ui/x-ui.db /x-ui/${server.id}/
  //         `,
  //       );
  //       await this.minioService.uploadByPath({
  //         filePath: `/x-ui/${server.id}/x-ui.db`,
  //         toMinioDir: 'x-ui',
  //         fileName: `${server.id}.db`,
  //       });
  //     } catch {
  //       throw new BadRequestException(errors.server.addingServerFailed);
  //     }
  //   }
  // }

  // @Interval('updateLetsEncryptSslStates', 60 * 60 * 1000)
  // async updateLetsEncryptSslStates() {
  //   this.logger.debug('UpdateLetsEncryptSslStates called every 1 hours');
  //   const appliedDomains: string[] = [];
  //   const pendingDomains = await this.prisma.domain.findMany({
  //     where: {
  //       nsState: 'APPLIED',
  //       letsEncryptSsl: 'PENDING',
  //     },
  //     include: {
  //       server: true,
  //     },
  //   });

  //   for (const pendingDomain of pendingDomains) {
  //     try {
  //       await this.getLetEncryptSsl(pendingDomain.domain, pendingDomain.server.ip);
  //       console.info('Let CERT created.', pendingDomain.domain);
  //       appliedDomains.push(pendingDomain.id);
  //     } catch {
  //       console.error(`We couldn't get LetEncryptSsl for ${pendingDomain.domain}`);
  //     }
  //   }

  //   if (appliedDomains.length > 0) {
  //     await this.prisma.domain.updateMany({
  //       where: {
  //         id: {
  //           in: appliedDomains,
  //         },
  //       },
  //       data: {
  //         letsEncryptSsl: 'APPLIED',
  //       },
  //     });
  //   }

  //   await this.syncCertFiles();
  // }

  @Interval('getPGBackup', 15 * 60 * 1000)
  async getPGBackup() {
    const isDev = this.configService.get('env') === 'development';

    if (isDev) {
      return;
    }

    this.logger.debug('getPGBackup called every 1 min');
    const postgresConfig = this.configService.get<PostgresConfig>('postgres');

    if (!postgresConfig) {
      return;
    }

    let postgresLogs = '';
    const outputFile = (
      await asyncShellExec(
        `
          FILE=\`date +"%Y-%m-%d-%H_%M"\`-pg-backup.sql \
          && OUTPUT_FILE=/app/\${FILE} \
          && echo $OUTPUT_FILE
        `,
      )
    ).replaceAll('\n', '');

    try {
      postgresLogs = await asyncShellExec(
        `
          cd /app \
          && echo "Getting Backup Postgres..." \
          && PGPASSWORD=${postgresConfig.password} pg_dump -c -h ${postgresConfig.dataBaseHost} --port ${postgresConfig.dataBasePort} -U ${postgresConfig.user} ${postgresConfig.databaseName} -F p -f ${outputFile} \
          && gzip ${outputFile} \
          && echo "Postgres backup has been done successfully."
        `,
        (output) => (postgresLogs += output),
      );

      const buffer = fs.readFileSync(`${outputFile}.gz`);
      const firstBrand = await this.brandService.getFirstBrand();
      const bot = this.telegramService.getBot(firstBrand?.id as string);
      await bot.telegram.sendDocument(firstBrand?.backupGroupId as string, {
        source: buffer,
        filename: `${outputFile}.gz`,
      });

      await asyncShellExec(`rm -rf ${outputFile}.gz`);
    } catch (error_) {
      const error = error_ as { message?: string };

      if (error?.message) {
        postgresLogs += `\n${error?.message}`;
      }

      postgresLogs += '\nPostgres backup finished with some errors.';
    }

    return postgresLogs;
  }

  @Interval('changeActiveServer', 1 * 60 * 1000)
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async changeActiveServer() {
    this.logger.debug('changeActiveServer called every 1 min');

    const activeServers = await this.prisma.activeServer.findMany({ include: { brand: true, server: true } });

    for (const activeServer of activeServers) {
      const servers = await this.prisma.server.findMany({
        where: { brandId: activeServer.brandId, category: activeServer.category },
      });
      let highestAverageScore = 0;
      let updatedActiveServerId: string | null = null;

      for (const server of servers) {
        const stats = server.stats;

        if (Array.isArray(stats)) {
          const validStats = stats.filter(
            (stat): stat is { score: number } =>
              typeof stat === 'object' && stat !== null && 'score' in stat && typeof stat.score === 'number',
          );

          if (validStats.length > 0) {
            const score = validStats.reduce((acc, stat) => acc + stat.score, 0) / validStats.length;
            console.log('average score for server', server.domain, score);
            console.log({ score, highestAverageScore });

            if (highestAverageScore === 0) {
              highestAverageScore = score;
              updatedActiveServerId = server.id;
            }

            if (score < highestAverageScore) {
              console.log('score is less than highestAverageScore');
              highestAverageScore = Math.max(highestAverageScore, score);
              updatedActiveServerId = server.id;
            }
          }

          await this.prisma.server.update({ where: { id: server.id }, data: { stats: [] } });
        }
      }

      if (updatedActiveServerId && activeServer.activeServerId !== updatedActiveServerId) {
        await this.prisma.activeServer.update({
          where: { id: activeServer.id },
          data: { activeServerId: updatedActiveServerId },
        });
        const bot = this.telegramService.getBot(activeServer.brandId);
        const newAciveServer = await this.prisma.server.findUnique({ where: { id: updatedActiveServerId } });
        // eslint-disable-next-line sonarjs/no-nested-template-literals
        const message = `سرور ${this.i18.__(`package.category.${activeServer.category}`)} فعال از سرور ${
          activeServer.server.domain
        } به سرور ${newAciveServer?.domain} تغییر یافت.`;
        await bot.telegram.sendMessage(activeServer.brand.reportGroupId as string, message);
      }
    }
  }
}
