import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from 'nestjs-prisma';
import { firstValueFrom } from 'rxjs';

import { errors } from '../common/errors';
import { getNsRecords, isEqual, randomStr } from '../common/helpers';
import { CreateArvanAccountInput } from './dto/createArvanAccount.input';
import { CreateDomainInput } from './dto/createDomain.input';
import { Arvan } from './models/arvan.model';
import { Domain } from './models/domain.model';

const DEJBAN_URL = 'https://dejban.arvancloud.ir/v1';
const DOMAINS_URL = 'https://napi.arvancloud.ir/cdn/4.0/domains';

const ENDPOINTS = {
  login: `${DEJBAN_URL}/auth/login`,
  // myAccounts: `${DEJBAN_URL}/users/my-accounts`,
  domain: (domain: string) => `${DOMAINS_URL}/${domain}`,
  addDomain: `${DOMAINS_URL}/dns-service`,
  addDnsRecord: (domain: string) => `${DOMAINS_URL}/${domain}/dns-records`,
  issueSSL: (domain: string) => `${DOMAINS_URL}/${domain}/ssl`,
  caching: (domain: string) => `${DOMAINS_URL}/${domain}/caching`,
};

interface LoginResponse {
  expiresAt: string;
  accessToken: string;
  refreshToken: string;
  defaultAccount: string;
}

interface AddDomainResponse {
  id: string;
  domain: string;
  dns_cloud: boolean;
  ns_keys: string[];
}

interface MyAccounts {
  data: Array<{
    accountId: string;
    accountName: string;
    owner: boolean;
  }>;
}

interface AddDnsRecord {
  id: string;
  type: string;
  name: string;
  value: {
    ip: string;
    port: string;
    weight: number;
    country: string;
  };
  ttl: number;
  cloud: boolean;
}

interface AuthenticatedReq {
  arvanId: string;
  url: string;
  method: 'post' | 'get' | 'patch' | 'put';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

interface IssueSSLResponse {
  ssl_status: boolean;
  certificate_mode: string;
  certificate_key_type: string;
  certificates: Array<{
    id: string;
    active: string;
    domain_names: string[];
  }>;
}

interface DomainInfoRes {
  id: string;
  domain: string;
  ns_keys: string[];
  dns_cloud: boolean;
  current_ns: string[];
}

interface AddDnsRecordInput {
  arvanId: string;
  domain: string;
  type?: string;
  name: string;
  ip: string;
  cloud: boolean;
  port?: string;
}

@Injectable()
export class ArvanService {
  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(ArvanService.name);

  // createDomain(data: CreateDomainInput) {
  //   return this.prisma.domain.create({ data });
  // }

  async createArvanAccount(data: CreateArvanAccountInput): Promise<Arvan> {
    const isAlreadyExist = await this.prisma.arvan.findFirst({
      where: {
        email: data.email,
        password: data.password,
      },
    });

    if (isAlreadyExist) {
      throw new BadRequestException('Account is already exist.');
    }

    const login = await this.loginToArvan(data.email, data.password);
    const id = login.defaultAccount;
    const accessToken = login.accessToken;

    try {
      const fakeDomain = await firstValueFrom(
        this.httpService.post<{ data: AddDomainResponse }>(
          ENDPOINTS.addDomain,
          {
            domain: `${randomStr(15)}-fake.com`,
            domain_type: 'full',
          },
          {
            headers: {
              // eslint-disable-next-line @typescript-eslint/naming-convention
              'content-type': 'application/json',
              Authorization: `Bearer ${accessToken}.${id}`,
            },
          },
        ),
      );

      if (!fakeDomain?.data?.data?.ns_keys) {
        throw new BadRequestException(errors.arvan.failAddingFakeDomain);
      }

      return this.prisma.arvan.create({
        data: {
          id,
          nsKeys: fakeDomain.data.data.ns_keys,
          email: data.email,
          password: data.password,
          token: login.accessToken,
          tokenExpiredAt: login.expiresAt,
        },
      });
    } catch {
      throw new BadRequestException(errors.arvan.failAddingFakeDomain);
    }
  }

  async loginToArvan(email: string, password: string): Promise<LoginResponse> {
    const login = await firstValueFrom(
      this.httpService.post<{ data: LoginResponse }>(
        ENDPOINTS.login,
        {
          email,
          password,
          captcha: 'v3.undefined',
        },
        {
          headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'X-Redirect-Uri': 'https://panel.arvancloud.ir',
          },
        },
      ),
    );

    if (!login?.data?.data?.accessToken) {
      throw new NotFoundException(errors.arvan.accountNotFound);
    }

    return login.data.data;
  }

  async getAuthorization(arvanId: string): Promise<string> {
    const arvan = await this.prisma.arvan.findUnique({ where: { id: arvanId } });

    if (!arvan?.id) {
      throw new NotFoundException();
    }

    if (arvan.tokenExpiredAt && new Date() < arvan.tokenExpiredAt) {
      return `Bearer ${arvan.token}.${arvan.id}`;
    }

    const login = await this.loginToArvan(arvan.email, arvan.password);

    await this.prisma.arvan.update({
      where: {
        id: arvan.id,
      },
      data: {
        token: login.accessToken,
        tokenExpiredAt: login.expiresAt,
      },
    });

    return `Bearer ${login.accessToken}.${login.defaultAccount}`;
  }

  async authenticatedReq<T>({ arvanId, url, method, body, headers }: AuthenticatedReq) {
    const auth = await this.getAuthorization(arvanId);

    const config = { headers: { ...(headers || {}), Authorization: auth } };

    return firstValueFrom(
      method === 'get' ? this.httpService.get<T>(url, config) : this.httpService[method]<T>(url, body, config),
    );
  }

  async addDomain(domain: string, expiredAt: Date, arvanId: string, ignoreAlreadyExist = false): Promise<Domain> {
    const server = await this.prisma.server.findFirstOrThrow();
    const [addDomain, isAlreadyExist] = await this.addDomainToArvan(arvanId, domain, ignoreAlreadyExist);

    if (!isAlreadyExist) {
      await this.addDnsRecord({
        name: 'www',
        ip: server.ip,
        cloud: true,
        arvanId,
        domain,
      });

      await this.addDnsRecord({
        name: '@',
        ip: server.ip,
        cloud: false,
        arvanId,
        domain,
      });

      await this.setDeveloperModeCaching(arvanId, domain);
    }

    const issuedSsl = await this.issueSsl(arvanId, domain);
    const currentNs = await getNsRecords(domain);
    const isNsApplied = isEqual(currentNs, addDomain.ns_keys);

    try {
      return await this.prisma.domain.create({
        data: {
          domain,
          expiredAt,
          arvanId,
          nsState: isNsApplied ? 'APPLIED' : 'PENDING',
          arvanSslState: issuedSsl.certificates.length > 0 ? 'APPLIED' : 'PENDING',
          serverId: server.id,
        },
      });
    } catch {
      throw new BadRequestException('Domain is already registered on system.');
    }
  }

  async addDomainToArvan(
    arvanId: string,
    domain: string,
    ignoreAlreadyExist: boolean,
  ): Promise<[AddDomainResponse, boolean]> {
    let result: AddDomainResponse;
    let isAlreadyExist = false;

    try {
      const addDomainReq = await this.authenticatedReq<{ data: AddDomainResponse }>({
        arvanId,
        url: ENDPOINTS.addDomain,
        body: { domain, domain_type: 'full' },
        method: 'post',
      });

      if (!addDomainReq.data.data.id) {
        throw new BadRequestException('Add domain req failed.');
      }

      result = addDomainReq.data.data;
    } catch (error_) {
      const error = error_ as { response: { status: number } };

      if (error?.response?.status === 422) {
        isAlreadyExist = true;
      }

      if (ignoreAlreadyExist) {
        const domainInfo = await this.authenticatedReq<{ data: DomainInfoRes }>({
          arvanId,
          url: ENDPOINTS.domain(domain),
          method: 'get',
        });

        if (!domainInfo.data.data.id) {
          throw new BadRequestException('Get domain req failed.');
        }

        result = domainInfo.data.data;
      } else {
        if (error?.response?.status === 422) {
          throw new BadRequestException(errors.arvan.domainAlreadyRegistered);
        }

        throw new BadRequestException('Domain is invalid.');
      }
    }

    return [result, isAlreadyExist];
  }

  async issueSsl(arvanId: string, domain: string): Promise<IssueSSLResponse> {
    const issueSSL = await this.authenticatedReq<{ data: IssueSSLResponse }>({
      arvanId,
      method: 'patch',
      url: ENDPOINTS.issueSSL(domain),
      body: {
        ssl_status: true,
        certificate: 'managed',
      },
    });

    if (!issueSSL.data.data.certificate_mode) {
      throw new BadRequestException('Issue in getting  SSL failed.');
    }

    return issueSSL.data.data;
  }

  async addDnsRecord(data: AddDnsRecordInput): Promise<AddDnsRecord> {
    const addDnsRecord = await this.authenticatedReq<{ data: AddDnsRecord }>({
      arvanId: data.arvanId,
      url: ENDPOINTS.addDnsRecord(data.domain),
      body: {
        type: data?.type || 'A',
        name: data.name,
        cloud: data.cloud,
        value: [
          {
            country: '',
            ip: data.type,
            port: data.cloud ? data?.port || '443' : null,
            weight: null,
          },
        ],
        upstream_https: data.cloud ? 'https' : 'default',
        ip_filter_mode: {
          count: 'single',
          geo_filter: 'none',
          order: 'none',
        },
        ttl: 120,
      },
      method: 'post',
    });

    if (!addDnsRecord.data.data.id) {
      throw new BadRequestException('DNS record setting failed.');
    }

    return addDnsRecord.data.data;
  }

  async setDeveloperModeCaching(arvanId: string, domain: string): Promise<void> {
    const setDeveloperModeCaching = await this.authenticatedReq<{ message: string }>({
      arvanId,
      method: 'patch',
      url: ENDPOINTS.caching(domain),
      body: {
        cache_developer_mode: true,
      },
    });

    if (!setDeveloperModeCaching.data.message) {
      throw new BadRequestException('Issue in setting developer mode for caching failed.');
    }
  }

  @Interval('notifications', 60 * 60 * 1000)
  async updateNsStates() {
    this.logger.debug('Called every 1 hours');
    const appliedNsDomains: string[] = [];
    const pendingDomains = await this.prisma.domain.findMany({
      where: {
        nsState: 'PENDING',
      },
      include: {
        arvan: true,
      },
    });

    for (const pendingDomain of pendingDomains) {
      const currentNs = await getNsRecords(pendingDomain.domain);
      const isNsApplied = isEqual(currentNs, pendingDomain.arvan.nsKeys);

      if (isNsApplied) {
        appliedNsDomains.push(pendingDomain.id);
      }
    }

    if (appliedNsDomains.length > 0) {
      await this.prisma.domain.updateMany({
        where: {
          id: {
            in: appliedNsDomains,
          },
        },
        data: {
          nsState: 'APPLIED',
        },
      });
    }
  }

  @Interval('notifications', 60 * 60 * 1000)
  async updateArvanSslStates() {
    this.logger.debug('Called every 1 hours');
    const appliedSslDomains: string[] = [];
    const pendingDomains = await this.prisma.domain.findMany({
      where: {
        arvanSslState: 'PENDING',
      },
      include: {
        arvan: true,
      },
    });

    for (const pendingDomain of pendingDomains) {
      const sslInfo = await this.authenticatedReq<{ data: IssueSSLResponse }>({
        arvanId: pendingDomain.arvan.id,
        method: 'get',
        url: ENDPOINTS.issueSSL(pendingDomain.domain),
      });

      if (sslInfo?.data?.data?.certificates?.length > 0) {
        appliedSslDomains.push(pendingDomain.id);
      }
    }

    if (appliedSslDomains.length > 0) {
      await this.prisma.domain.updateMany({
        where: {
          id: {
            in: appliedSslDomains,
          },
        },
        data: {
          arvanSslState: 'APPLIED',
        },
      });
    }
  }
}
