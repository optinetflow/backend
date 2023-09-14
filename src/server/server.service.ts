import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'nestjs-prisma';
import { firstValueFrom } from 'rxjs';

import { asyncShellExec } from '../common/helpers';

@Injectable()
export class ServerService {
  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // this.issueCert('xyz52.ir', '51.158.233.247');
  }

  async issueCert(domain: string, ip: string) {
    try {
      // const issueCert = await asyncShellExec(
      //   `ssh -o StrictHostKeyChecking=no ubuntu@${ip} -p 2211 'sudo su -c 
      //   "~/.acme.sh/acme.sh --issue -d ${domain} --standalone && 
      //   mkdir -p /v/${domain} && 
      //   ~/.acme.sh/acme.sh --installcert -d ${domain} --key-file /v/${domain}/private.key --fullchain-file /v/${domain}/cert.crt"'`,
      // );
      
      const issueCert = await asyncShellExec(
        `ssh -o StrictHostKeyChecking=no ubuntu@${ip} -p 2211 'sudo su -c 
        "~/.acme.sh/acme.sh --issue -d ${domain} --standalone && 
        mkdir -p /v/${domain} && 
        ~/.acme.sh/acme.sh --installcert -d ${domain} --key-file /v/${domain}/private.key --fullchain-file /v/${domain}/cert.crt"'`,
      );

    } catch (error) {
      console.log('e======>', error);
    }
  }
}
