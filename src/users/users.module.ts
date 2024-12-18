import { Module } from '@nestjs/common';

import { PasswordService } from '../auth/password.service';
import { BrandModule } from '../brand/brand.module';
import { TelegramModule } from '../telegram/telegram.module';
import { XuiModule } from '../xui/xui.module';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

@Module({
  imports: [XuiModule, TelegramModule, BrandModule],
  providers: [UsersResolver, UsersService, PasswordService],
  exports: [UsersService],
})
export class UsersModule {}
