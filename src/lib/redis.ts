import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

function getRedis(): Redis {
  if (globalForRedis.redis) return globalForRedis.redis;

  const url = process.env.REDIS_URL || "redis://localhost:6379";

  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: () => null, // don't retry forever during build
  });

  let loggedOnce = false;
  client.on("error", () => {
    if (!loggedOnce && process.env.REDIS_VERBOSE === "1") {
      loggedOnce = true;
      console.warn("[redis] unavailable, caching disabled");
    }
  });

  if (process.env.NODE_ENV !== "production") {
    globalForRedis.redis = client;
  }

  return client;
}

export const redis = getRedis();

export async function cacheSet(key: string, value: unknown, ttlSeconds = 3600) {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // silently ignore, caching disabled
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

export function ohlcvCacheKey(symbol: string, timeframe: string, variant = "mock"): string {
  return `ohlcv:${symbol}:${timeframe}:${variant}`;
}

export async function cacheGetOHLCV<T>(symbol: string, timeframe: string, variant = "mock"): Promise<T | null> {
  return cacheGet<T>(ohlcvCacheKey(symbol, timeframe, variant));
}

export async function cacheSetOHLCV(symbol: string, timeframe: string, value: unknown, ttlSeconds = 600, variant = "mock") {
  return cacheSet(ohlcvCacheKey(symbol, timeframe, variant), value, ttlSeconds);
}


