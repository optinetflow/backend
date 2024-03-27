import { Package, Server, UserPackage as UserPackagePrisma } from '@prisma/client';

export interface AuthenticatedReq {
  serverId: string;
  url: (domain: string) => string;
  method: 'post' | 'get' | 'patch' | 'put';
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string;
}

export interface InboundSetting {
  clients: Array<{
    id: string;
    email: string;
    limitIp: number;
    totalGB: number;
    expiryTime: number;
    enable: boolean;
    flow: string;
    subId: string;
    tgId: string;
  }>;
}

interface InboundStreamSettings {
  network: string;
  security: string;
  tlsSettings: {
    serverName: string;
    minVersion: string;
    maxVersion: string;
    certificates: Array<{
      certificateFile: string;
      keyFile: string;
    }>;
  };
}

interface InboundClientStat {
  id: number;
  inboundId: number;
  enable: boolean;
  email: string;
  up: number;
  down: number;
  total: number;
  expiryTime: number;
}

export interface InboundListRes {
  obj: Array<{
    id: number;
    up: number;
    down: number;
    total: number;
    remark: string;
    enable: boolean;
    expiryTime: number;
    port: number;
    protocol: string;
    settings: string;
    streamSettings: string;
    tag: string;
    sniffing: string;
    clientStats: InboundClientStat[];
  }>;
}

export interface OnlineInboundRes {
  obj: string[];
}

export interface Stat {
  id: string;
  port: number;
  inboundId: number;
  enable: boolean;
  email: string;
  up: number;
  down: number;
  total: number;
  expiryTime: number;
  flow: string;
  subId: string;
  tgId: string;
  limitIp: number;
}
export interface AddClientInput {
  id?: string;
  subId?: string;
  email?: string;
  serverId: string;
  name: string;
  package: Package;
  order?: string;
}

export interface CreatePackageInput {
  id: string;
  subId: string;
  email: string;
  server: Server;
  paymentId: string;
  name: string;
  package: Package;
  order: string;
}

export interface UpdateClientReqInput {
  id: string;
  limitIp?: number;
  totalGB?: number;
  expiryTime?: number;
  enable?: boolean;
}

export interface UpdateClientInput {
  id: string;
  subId: string;
  email: string;
  name: string;
  server: Server;
  package: Package;
  enable?: boolean;
  order: string;
}

export interface SendBuyPackMessageInput {
  receiptBuffer?: Buffer;
  userPack: UserPackagePrisma;
  pack: Package;
  parentProfit?: number;
  profitAmount?: number;
  inRenew: boolean;
}

export interface ServerStat {
  cpu: number;
  mem: {
    current: number;
    total: number;
  };
  tcpCount: number;
  udpCount: number;
  netIO: { up: number; down: number };
}
