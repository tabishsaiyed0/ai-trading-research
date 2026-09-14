import { NextRequest } from "next/server";
import { redis } from "./redis";

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

type Bucket = "parse" | "backtest";

const LIMITS: Record<Bucket, { max: number; windowMs: number }> = {
  parse: { max: 30, windowMs: 60_000 },
  backtest: { max: 20, windowMs: 60_000 },
};

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    (req as unknown as { ip?: string }).ip ||
    "anon"
  );
}

export async function checkRateLimit(req: NextRequest, bucket: Bucket): Promise<{ ok: boolean; retryAfterSec?: number }> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return { ok: true };
  const { max, windowMs } = LIMITS[bucket];
  const ip = getClientIp(req);
  const key = `rl:${bucket}:${ip}`;

  try {
    const ttl = Math.ceil(windowMs / 1000);
    // Use pipeline: INCR + EXPIRE only if first hit
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ttl);
    if (count > max) {
      const ttlRem = await redis.ttl(key);
      return { ok: false, retryAfterSec: ttlRem > 0 ? ttlRem : ttl };
    }
    return { ok: true };
  } catch {
    // Fallback to memory
    const now = Date.now();
    const entry = memoryBuckets.get(key);
    if (!entry || now > entry.resetAt) {
      memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true };
    }
    entry.count += 1;
    if (entry.count > max) {
      return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
    }
    return { ok: true };
  }
}
