import { Injectable } from "@nestjs/common";

export type MetricCounters = {
  httpRequests: number;
  httpErrors: number;
  loginFailures: number;
  paymentWebhookEvents: number;
  mediaUploadFailures: number;
  shadowMismatches: number;
  shadowTimeouts: number;
  shadowSamples: number;
};

/**
 * Minimal in-process counters for Phase 12 observability.
 * Aggregates only — never stores PII.
 */
@Injectable()
export class MetricsService {
  private readonly counters: MetricCounters = {
    httpRequests: 0,
    httpErrors: 0,
    loginFailures: 0,
    paymentWebhookEvents: 0,
    mediaUploadFailures: 0,
    shadowMismatches: 0,
    shadowTimeouts: 0,
    shadowSamples: 0,
  };

  private readonly latenciesMs: number[] = [];
  private readonly maxLatencySamples = 500;

  inc(key: keyof MetricCounters, by = 1) {
    this.counters[key] += by;
  }

  observeHttpLatency(ms: number) {
    this.latenciesMs.push(ms);
    if (this.latenciesMs.length > this.maxLatencySamples) {
      this.latenciesMs.shift();
    }
  }

  snapshot() {
    const sorted = [...this.latenciesMs].sort((a, b) => a - b);
    const p = (q: number) =>
      sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
        : 0;
    return {
      counters: { ...this.counters },
      httpLatencyMs: {
        samples: sorted.length,
        p50: p(0.5),
        p95: p(0.95),
      },
    };
  }
}
