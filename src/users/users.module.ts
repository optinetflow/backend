import { Module } from '@nestjs/common';

import { PasswordService } from '../auth/password.service';
import { XuiModule } from '../xui/xui.module';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

@Module({
  imports: [XuiModule],
  providers: [UsersResolver, UsersService, PasswordService],
  exports: [UsersService],
})
export class UsersModule {}
