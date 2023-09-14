import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ArvanResolver } from './arvan.resolver';
import { ArvanService } from './arvan.service';

@Module({
  imports: [HttpModule],
  providers: [ArvanResolver, ArvanService],
})
export class ArvanModule {}
