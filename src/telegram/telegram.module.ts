import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { BrandModule } from '../brand/brand.module';
import { AggregatorService } from './aggregator.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [HttpModule, BrandModule],
  providers: [TelegramService, AggregatorService],
  exports: [TelegramService],
})
export class TelegramModule {}
