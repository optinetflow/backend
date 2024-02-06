import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AiResolver } from './ai.resolver';
import { AiService } from './ai.service';

@Module({
  imports: [HttpModule],
  providers: [AiResolver, AiService],
})
export class AiModule {}
