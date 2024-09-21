import { Module } from '@nestjs/common';

import { PasswordService } from '../auth/password.service';
import { TelegramModule } from '../telegram/telegram.module';
import { XuiModule } from '../xui/xui.module';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

@Module({
  imports: [XuiModule, TelegramModule],
  providers: [UsersResolver, UsersService, PasswordService],
})
export class UsersModule {}
