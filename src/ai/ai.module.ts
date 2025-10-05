import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AiResolver } from './ai.resolver';
import { AiService } from './ai.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 60_000, // 60 seconds for AI service calls
      maxRedirects: 5,
    }),
  ],
  providers: [AiResolver, AiService],
})
export class AiModule {}
