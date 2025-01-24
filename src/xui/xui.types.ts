import { Package, Server, UserPackage as UserPackagePrisma } from '@prisma/client';

export interface AuthenticatedReq {
  serverId: string;
  url: (domain: string) => string;
  method: 'post' | 'get' | 'patch' | 'put';
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string;
  isBuffer?: boolean;
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
  orderN?: number;
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
  orderN: number;
}
export interface ServerStat {
  cpu: number;
  cpuCores: number;
  logicalPro: number;
  cpuSpeedMhz: number;
  mem: { current: number; total: number };
  swap: { current: number; total: number };
  disk: { current: number; total: number };
  xray: { state: string; errorMsg?: string; version: string };
  uptime: number;
  loads: number[];
  tcpCount: number;
  udpCount: number;
  netIO: { up: number; down: number };
  netTraffic: { sent: number; recv: number };
  publicIP: { ipv4: string; ipv6: string };
  appStats: { threads: number; mem: number; uptime: number };
}
