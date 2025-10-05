import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

import { BrandModule } from '../brand/brand.module';
import { SharedServicesModule } from '../common/services/shared-services.module';
import { TelegramModule } from '../telegram/telegram.module';
import { XuiResolver } from './xui.resolver';
import { XuiService } from './xui.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15_000, // 15 seconds for regular XUI API calls
      maxRedirects: 5,
    }),
    BrandModule,
    forwardRef(() => TelegramModule),
    SharedServicesModule,
  ],
  providers: [XuiResolver, XuiService],
  exports: [XuiService],
})
export class XuiModule {}
