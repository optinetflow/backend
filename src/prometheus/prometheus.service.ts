import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from 'nestjs-prisma';
import { firstValueFrom } from 'rxjs';

import type { Prometheus } from '../common/configs/config.interface';

interface PrometheusResponse {
  data: {
    result: Array<{
      metric: { label: string };
      values: Array<[number, string]>;
    }>;
  };
}

function calculateAverages(resp: PrometheusResponse): Record<string, number> {
  return resp.data.result.reduce((acc, { metric: { label }, values }) => {
    // Sum up all numeric values
    const sum = values.reduce((running, [, strVal]) => running + Number.parseFloat(strVal), 0);
    // Compute the average (guard against division by zero)
    acc[label] = values.length > 0 ? sum / values.length : Number.NaN;

    return acc;
  }, {} as Record<string, number>);
}

function calculateMaxValues(resp: PrometheusResponse): Record<string, number> {
  return resp.data.result.reduce((acc, { metric: { label }, values }) => {
    // If there are no samples, record NaN
    if (values.length === 0) {
      acc[label] = Number.NaN;

      return acc;
    }

    // Fold over all values, tracking the highest numeric parse so far
    const maxVal = values.reduce((currentMax, [, strVal]) => {
      const num = Number.parseFloat(strVal);

      // If parsing fails, ignore (keep currentMax)
      return Number.isNaN(num) ? currentMax : Math.max(currentMax, num);
    }, Number.NEGATIVE_INFINITY);

    acc[label] = maxVal;

    return acc;
  }, {} as Record<string, number>);
}

@Injectable()
export class PrometheusService {
  constructor(
    private prisma: PrismaService,
    private httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(PrometheusService.name);

  async authenticatedQuery(query: string): Promise<PrometheusResponse> {
    const prometheusConfig = this.configService?.get<Prometheus>('prometheus');

    if (!prometheusConfig || !prometheusConfig.host) {
      throw new Error('Prometheus host is not configured');
    }

    const url = `http://${prometheusConfig.host}:${prometheusConfig.port}/api/v1/query_range`;

    try {
      const auth = Buffer.from(`${prometheusConfig.username}:${prometheusConfig.password}`).toString('base64');
      const response = await firstValueFrom(
        this.httpService.get<PrometheusResponse>(url, {
          params: {
            query,
            step: 345,
            start: Math.floor(Date.now() / 1000) - 86_400, // 1 day ago
            end: Math.floor(Date.now() / 1000),
          },
          headers: {
            Authorization: `Basic ${auth}`,
          },
        }),
      );

      if (response.status !== 200) {
        throw new Error(`Prometheus query failed: ${response.statusText}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error('Prometheus query failed', error);

      throw new BadRequestException(error);
    }
  }

  @Interval('get95thBandwidth', 1000 * 60 * 0.5)
  async get95thBandwidth() {
    this.logger.debug('get95thBandwidth call every 1 min');
    const query = `
      quantile_over_time(0.95, 
        sum by (label) (
          rate(node_network_receive_bytes_total{device!~"^(lo|docker.*|veth.*)$", label=~"^(DE_1|DE_2|DE_3|DE_4)$"}[2m]) + 
          rate(node_network_transmit_bytes_total{device!~"^(lo|docker.*|veth.*)$", label=~"^(DE_1|DE_2|DE_3|DE_4)$"}[2m])
        )[1d:1m]
      ) * 8 / 1000000
    `;

    const result = await this.authenticatedQuery(query);
    const averages = calculateMaxValues(result);
    this.logger.debug('95th bandwidth', averages);
  }
}
