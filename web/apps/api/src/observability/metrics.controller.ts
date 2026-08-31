import { Controller, Get } from "@nestjs/common";
import { Roles } from "../auth/auth.guards";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Aggregate-only metrics — no PII. Staff-visible. */
  @Get()
  @Roles("admin")
  snapshot() {
    return this.metrics.snapshot();
  }

  /** Aggregate latency/error counters — staff only (L1: was public). */
  @Get("health-summary")
  @Roles("admin")
  summary() {
    const snap = this.metrics.snapshot();
    return {
      httpRequests: snap.counters.httpRequests,
      httpErrors: snap.counters.httpErrors,
      p50Ms: snap.httpLatencyMs.p50,
      p95Ms: snap.httpLatencyMs.p95,
    };
  }
}
