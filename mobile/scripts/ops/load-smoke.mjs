/**
 * Minimal concurrent HTTP load smoke for /health/live.
 * Not a substitute for k6/Locust against authenticated APIs.
 *
 * Usage:
 *   node scripts/ops/load-smoke.mjs https://api.example.com 100 10
 *   (url, totalRequests, concurrency)
 */
const base = (process.argv[2] || "").replace(/\/$/, "");
const total = Number(process.argv[3] || 100);
const concurrency = Number(process.argv[4] || 10);

if (!base.startsWith("https://") && !base.startsWith("http://127.0.0.1")) {
  console.error("Refuse non-HTTPS remote targets (allow http://127.0.0.1 for local only)");
  process.exit(1);
}

const url = `${base}/health/live`;
const latencies = [];
let errors = 0;

async function one() {
  const t0 = performance.now();
  try {
    const res = await fetch(url);
    if (!res.ok) errors += 1;
  } catch {
    errors += 1;
  } finally {
    latencies.push(performance.now() - t0);
  }
}

async function pool() {
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < total) {
      const n = i++;
      if (n >= total) return;
      await one();
    }
  });
  await Promise.all(workers);
}

await pool();
latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];

console.log(
  JSON.stringify(
    {
      url,
      total,
      concurrency,
      errors,
      p50_ms: Number(pct(50).toFixed(2)),
      p95_ms: Number(pct(95).toFixed(2)),
      p99_ms: Number(pct(99).toFixed(2)),
      max_ms: Number(latencies[latencies.length - 1].toFixed(2)),
    },
    null,
    2
  )
);

if (errors > 0) process.exit(2);
