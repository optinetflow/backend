export type ENV = 'production' | 'staging' | 'development';
export interface Config {
  env: ENV;
  webPanelUrl: string;
  backdoorPass: string;
  publicIP: string;
  version: string;
  serviceName: string;
  nest: NestConfig;
  cors: CorsConfig;
  postgres: PostgresConfig;
  swagger: SwaggerConfig;
  graphql: GraphqlConfig;
  security: SecurityConfig;
  minio: MinioConfig;
  telegraf: Telegraf;
  xui: XUI;
  telGroup: TelGroup;
  gcp: GCP;
}

export interface NestConfig {
  port: number;
}

export interface CorsConfig {
  enabled: boolean;
}

export interface PostgresConfig {
  dataBaseHost: string;
  dataBasePort: string;
  databaseUrl: string;
  databaseName: string;
  user: string;
  password: string;
}

export interface SwaggerConfig {
  enabled: boolean;
  title: string;
  description: string;
  version: string;
  path: string;
}

export interface GraphqlConfig {
  playgroundEnabled: boolean;
  debug: boolean;
  schemaDestination: string;
  introspection: boolean;
  sortSchema: boolean;
}

export interface SecurityConfig {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  expiresIn: string;
  refreshIn: string;
  bcryptSaltOrRound: string | number;
}

export interface MinioConfig {
  endpoint: string;
  port: number;
  rootUser: string;
  rootPassword: string;
  bucket: string;
  region: string;
}

export interface Telegraf {
  token: string;
}

export interface XUI {
  password: string;
}

export interface TelGroup {
  report: string;
  backup: string;
  server: string;
}

export interface GCP {
  credential: string;
}
