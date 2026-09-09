import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

function getRedis(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis;

  const url = process.env.REDIS_URL || "redis://localhost:6379";

  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: () => null, // don't retry forever during build
  });

  client.on("error", (err) => console.error("[redis] error", err));

  if (process.env.NODE_ENV !== "production") {
    globalForRedis.redis = client;
  }

  return client;
}

export const redis = getRedis();

// Helpers for trading domain - best-effort, never throw during build
export async function cacheSet(key: string, value: unknown, ttlSeconds = 3600) {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (e) {
    console.warn("[redis] cacheSet failed", e);
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const v = await redis.get(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheOHLCV(symbol: string, timeframe: string) {
  return `ohlcv:${symbol}:${timeframe}`;
}
