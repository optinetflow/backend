import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ScheduleModule } from '@nestjs/schedule';
import { loggingMiddleware, PrismaModule } from 'nestjs-prisma';

import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppResolver } from './app.resolver';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BrandModule } from './brand/brand.module';
import config from './common/configs/config';
import { GqlConfigService } from './gql-config.service';
import { MinioClientModule } from './minio/minio.module';
import { PackageModule } from './package/package.module';
import { PaymentModule } from './payment/payment.module';
import { ServerModule } from './server/server.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { XuiModule } from './xui/xui.module';
import { SmsModule } from './sms/sms.module';
import { I18Module } from './common/i18/i18.module';

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
    I18Module,
    ScheduleModule.forRoot(),
    MinioClientModule,
    AuthModule,
    UsersModule,
    ServerModule,
    XuiModule,
    TelegramModule,
    PaymentModule,
    AiModule,
    BrandModule,
    PackageModule,
    SmsModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver],
})
export class AppModule {}
