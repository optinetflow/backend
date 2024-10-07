import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { BrandModule } from '../brand/brand.module';
import { TelegramModule } from '../telegram/telegram.module';
import { XuiResolver } from './xui.resolver';
import { XuiService } from './xui.service';

@Module({
  imports: [HttpModule, BrandModule, TelegramModule],
  providers: [XuiResolver, XuiService],
  exports: [XuiService],
})
export class XuiModule {}
