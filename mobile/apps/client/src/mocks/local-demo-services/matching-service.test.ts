import { describe, expect, it } from "vitest";
import { computeCompatibility } from "@/services/matching-service";
import { SEED_PEERS } from "@/data/seed-peers";

describe("computeCompatibility", () => {
  it("returns scores between 0 and 100", () => {
    const me = SEED_PEERS.find((p) => p.id === "peer_yusuf")!.answers;
    const peer = SEED_PEERS.find((p) => p.id === "peer_aisha")!.answers;
    const score = computeCompatibility(me, peer);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.religion).toBeGreaterThan(0);
  });
});
