/* eslint-disable @typescript-eslint/naming-convention */
//---------------------------------------------
// Types
//---------------------------------------------
export type Period = '12h' | '24h' | '2d' | '3d' | '7d';

interface NetTraffic {
  recv: number;
  sent: number;
}

export interface NetStatSample {
  timestamp: string; // ISO8601
  netTraffic: NetTraffic; // cumulative bytes since boot
}

//---------------------------------------------
// Constants
//---------------------------------------------
const HOURS = 3_600_000;
const PERIODS_MS: Record<Period, number> = {
  '12h': 12 * HOURS,
  '24h': 24 * HOURS,
  '2d': 2 * 24 * HOURS,
  '3d': 3 * 24 * HOURS,
  '7d': 7 * 24 * HOURS,
};

//---------------------------------------------
// 1) Estimate traffic for ONE server
//---------------------------------------------
/**
 * Returns estimated bytes (recv + sent) during `periodLabel`.
 * Uses scaling if we observed ≥60 % of the window; otherwise
 * falls back to average-rate-projection across available gaps.
 *
 * @param samples – unsorted, may have gaps
 * @param periodLabel – one of PERIODS_MS keys
 */
export function estimateTraffic(
  samples: NetStatSample[],
  periodLabel: keyof typeof PERIODS_MS,
  coverageThreshold = 0.6,
): number {
  if (samples.length === 0) {
    return 0;
  }

  const now = Date.now();
  const periodMs = PERIODS_MS[periodLabel];

  // 1. keep only samples inside the look-back window
  const windowStart = now - periodMs;
  const inWindow = samples
    .filter((s) => new Date(s.timestamp).getTime() >= windowStart)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (inWindow.length < 2) {
    return 0;
  } // not enough data to say anything

  // 2. Raw delta between first & last counters
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];

  const byteFirst = first.netTraffic.recv + first.netTraffic.sent;
  const byteLast = last.netTraffic.recv + last.netTraffic.sent;
  const rawDelta = Math.max(byteLast - byteFirst, 0); // guard against counter reset

  const observedMs = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();

  // 3. If we saw enough of the period, scale the raw delta
  if (observedMs / periodMs >= coverageThreshold) {
    return rawDelta * (periodMs / observedMs);
  }

  // 4. Else: average-rate approach across all gaps
  let sumRate = 0; // bytes per ms
  let cnt = 0;

  for (let i = 1; i < inWindow.length; i++) {
    const prev = inWindow[i - 1];
    const curr = inWindow[i];
    const dt = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
    const dB = curr.netTraffic.recv + curr.netTraffic.sent - (prev.netTraffic.recv + prev.netTraffic.sent);

    if (dt > 0 && dB >= 0) {
      sumRate += dB / dt;
      cnt++;
    }
  }

  const avgRate = cnt ? sumRate / cnt : 0;

  return avgRate * periodMs; // project to full window
}

//---------------------------------------------
// 2) Balance load across MANY servers
//---------------------------------------------
export interface ServerData {
  id: string;
  samples: NetStatSample[];
}

/**
 * Returns a weight per server ∈ [0,1].  Higher traffic ⇒ lower weight.
 * You can feed these weights into a LB that supports per-backend weighting.
 */
export function suggestWeights(
  servers: ServerData[],
  periodLabel: keyof typeof PERIODS_MS = '24h',
): Array<{ id: string; weight: number; usage: number }> {
  const usages = servers.map((s) => ({
    id: s.id,
    bytes: estimateTraffic(s.samples, periodLabel),
  }));

  // avoid divide-by-zero when every server reported 0 bytes
  const maxUsage = Math.max(...usages.map((u) => u.bytes), 1);

  // compute weights (inverse of usage)
  const withWeights = usages.map((u) => ({
    id: u.id,
    usage: u.bytes,
    weight: 1 - u.bytes / maxUsage, // 1 = lightest, 0 = heaviest
  }));

  // **sort so the lightest server comes first**
  return withWeights.sort((a, b) => b.weight - a.weight);
}
