import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { BrandModule } from '../brand/brand.module';
import { SecurityConfig } from '../common/configs/config.interface';
import { SmsModule } from '../sms/sms.module';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { XuiModule } from '../xui/xui.module';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { GqlAuthGuard } from './gql-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { PasswordService } from './password.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => {
        const securityConfig = configService.get<SecurityConfig>('security');

        return {
          secret: configService.get<SecurityConfig>('security')?.jwtAccessSecret,
          signOptions: {
            expiresIn: securityConfig?.expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
    XuiModule,
    UsersModule,
    TelegramModule,
    BrandModule,
    SmsModule,
  ],
  providers: [AuthService, AuthResolver, JwtStrategy, GqlAuthGuard, PasswordService, UsersService],
  exports: [GqlAuthGuard],
})
export class AuthModule {}
