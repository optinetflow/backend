import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { PrometheusService } from './prometheus.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 15_000, // 15 seconds for Prometheus queries
      maxRedirects: 5,
    }),
  ],
  providers: [PrometheusService],
  exports: [PrometheusService],
})
export class PrometheusModule {}
