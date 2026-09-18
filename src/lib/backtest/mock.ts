import type { OHLCV } from "./types";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: string | number): () => number {
  let t = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic GBM mock for offline dev/testing
export function generateMockOHLCV(
  days = 500,
  startPrice = 100,
  startDate = "2024-01-01",
  seed?: string | number
): OHLCV[] {
  const effectiveSeed = seed ?? process.env.MOCK_SEED ?? `mock:${startDate}:${startPrice}:${days}`;
  const rand = seededRandom(effectiveSeed);
  const out: OHLCV[] = [];
  let p = startPrice;
  const d = new Date(startDate);
  for (let i = 0; i < days; i++) {
    const drift = 0.0002;
    const vol = 0.015;
    const shock = (rand() * 2 - 1) * vol;
    const change = drift + shock;
    const open = p;
    p = p * (1 + change);
    const high = Math.max(open, p) * (1 + rand() * 0.005);
    const low = Math.min(open, p) * (1 - rand() * 0.005);
    const close = p;
    out.push({
      timestamp: new Date(d).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: 1_000_000 + rand() * 500_000,
    });
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  }
  return out;
}
