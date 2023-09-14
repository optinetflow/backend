import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ServerResolver } from './server.resolver';
import { ServerService } from './server.service';

@Module({
  imports: [HttpModule],
  providers: [ServerResolver, ServerService],
})
export class ServerModule {}
