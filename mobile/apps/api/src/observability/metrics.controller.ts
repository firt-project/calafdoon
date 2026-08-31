import { Controller, Get } from "@nestjs/common";
import { Public, Roles } from "../auth/auth.guards";
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

  /** Lightweight public counters for local staging smoke (no PII). */
  @Public()
  @Get("health-summary")
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
