import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PrometheusService } from './prometheus.service';

@Module({
  imports: [HttpModule],
  providers: [PrometheusService],
  exports: [PrometheusService],
})
export class PrometheusModule {}
