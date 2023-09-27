import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { XuiResolver } from './xui.resolver';
import { XuiService } from './xui.service';

@Module({
  imports: [HttpModule],
  providers: [XuiResolver, XuiService],
})
export class XuiModule {}
