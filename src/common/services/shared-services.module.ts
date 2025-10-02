import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ClientManagementService } from './client-management.service';
import { ServerManagementService } from './server-management.service';
import { XuiClientService } from './xui-client.service';

@Module({
  imports: [HttpModule],
  providers: [XuiClientService, ServerManagementService, ClientManagementService],
  exports: [XuiClientService, ServerManagementService, ClientManagementService],
})
export class SharedServicesModule {}
