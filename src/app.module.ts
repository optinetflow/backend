import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ScheduleModule } from '@nestjs/schedule';
import { loggingMiddleware, PrismaModule } from 'nestjs-prisma';
import { TelegrafModule } from 'nestjs-telegraf';

import { AppController } from './app.controller';
import { AppResolver } from './app.resolver';
import { AppService } from './app.service';
import { ArvanModule } from './arvan/arvan.module';
import { AuthModule } from './auth/auth.module';
import config from './common/configs/config';
import type { Telegraf } from './common/configs/config.interface';
import { sessionMiddleware } from './common/middleware/session.middleware';
import { GqlConfigService } from './gql-config.service';
import { MinioClientModule } from './minio/minio.module';
import { PaymentModule } from './payment/payment.module';
import { ServerModule } from './server/server.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { XuiModule } from './xui/xui.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [config] }),
    PrismaModule.forRoot({
      isGlobal: true,
      prismaServiceOptions: {
        middlewares: [
          // configure your prisma middleware
          loggingMiddleware({
            logger: new Logger('PrismaMiddleware'),
            logLevel: 'log',
          }),
        ],
      },
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      useClass: GqlConfigService,
    }),
    ScheduleModule.forRoot(),
    MinioClientModule,
    AuthModule,
    UsersModule,
    ArvanModule,
    ServerModule,
    XuiModule,
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<Telegraf>('telegraf')!.token,
        middlewares: [sessionMiddleware],
        include: [TelegramModule],
      }),
    }),
    TelegramModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver],
})
export class AppModule {}
