import type { OHLCV } from "@/lib/backtest/types";
import type { FetchParams, FetchResult, ProviderName } from "./types";
import { cacheGet, cacheSet } from "@/lib/redis";
import { fetchYahooOHLCV } from "./yahoo";
import { fetchAlpacaOHLCV } from "./alpaca";
import { fetchS3OHLCV, putS3OHLCV } from "./s3";
import { resolveDateWindow, cacheTtlForTimeframe, isoDateOnly, dedupeSort, normalizeSymbol } from "./utils";

export type GetOHLCVOptions = FetchParams & {
  // if true, never throw on fetch error — caller decides. Orchestrator throws by default.
  useMockFallback?: boolean;
};

function redisKeyFor(params: FetchParams, sourceTag: string): string {
  const symbol = normalizeSymbol(params.symbol);
  const { start, end } = resolveDateWindow(params.timeframe, params.startDate, params.endDate);
  return `ohlcv:${symbol}:${params.timeframe}:${isoDateOnly(start)}_${isoDateOnly(end)}:${sourceTag}`;
}

function redisKeyGeneric(params: FetchParams): string {
  const symbol = normalizeSymbol(params.symbol);
  const { start, end } = resolveDateWindow(params.timeframe, params.startDate, params.endDate);
  return `ohlcv:${symbol}:${params.timeframe}:${isoDateOnly(start)}_${isoDateOnly(end)}`;
}

/*
 * Primary orchestrator: Redis -> S3 -> Yahoo (primary) -> Alpaca (secondary) -> error.
 * Caches successful fetches in Redis (TTL per timeframe) and S3 best-effort.
 * Respects `startDate/endDate` with default last 1y window.
 */
export async function getOHLCV(params: FetchParams): Promise<FetchResult> {
  const symbol = normalizeSymbol(params.symbol);
  if (!symbol) throw new Error("symbol required");
  const timeframe = params.timeframe;
  const { start, end } = resolveDateWindow(timeframe, params.startDate, params.endDate);

  const genericKey = redisKeyGeneric({ ...params, symbol, timeframe, startDate: start.toISOString(), endDate: end.toISOString() });

 
  try {
    const cached = (await cacheGet(genericKey)) as OHLCV[] | null;
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return { ohlcv: dedupeSort(cached), source: "redis", startDate: isoDateOnly(start), endDate: isoDateOnly(end) };
    }
  } catch {}

  try {
    const s3Bars = await fetchS3OHLCV({ symbol, timeframe, startDate: start.toISOString(), endDate: end.toISOString() });
    if (s3Bars && s3Bars.length > 0) {
      const sorted = dedupeSort(s3Bars);
      try {
        await cacheSet(genericKey, sorted, cacheTtlForTimeframe(timeframe));
      } catch {}
      return { ohlcv: sorted, source: "s3", startDate: isoDateOnly(start), endDate: isoDateOnly(end) };
    }
  } catch {
    // ! silent
  }

  let lastError: unknown = null;
  const providers: Array<{ name: ProviderName; fn: (p: FetchParams) => Promise<OHLCV[]> }> = [
    { name: "yahoo", fn: fetchYahooOHLCV },
    { name: "alpaca", fn: fetchAlpacaOHLCV },
  ];

  // Allow disabling Alpaca via env if not wanted
  const enableAlpaca = !!(process.env.ALPACA_API_KEY || process.env.APCA_API_KEY_ID);
  const toTry = enableAlpaca ? providers : providers.filter((p) => p.name !== "alpaca");

  for (const prov of toTry) {
    try {
      const bars = await prov.fn({ symbol, timeframe, startDate: start.toISOString(), endDate: end.toISOString() });
      const sorted = dedupeSort(bars);

      if (sorted.length < 10) {
        throw new Error(`${prov.name} returned too few bars (${sorted.length}) for ${symbol} ${timeframe}`);
      }

      try {
        await cacheSet(genericKey, sorted, cacheTtlForTimeframe(timeframe));
        await cacheSet(redisKeyFor(params, prov.name), sorted, cacheTtlForTimeframe(timeframe));
      } catch {}
   
      putS3OHLCV({ symbol, timeframe, startDate: start.toISOString(), endDate: end.toISOString() }, sorted).catch(() => {});

      return { ohlcv: sorted, source: prov.name, startDate: isoDateOnly(start), endDate: isoDateOnly(end) };
    } catch (e) {
      lastError = e;
      console.warn(`[market-data] ${prov.name} failed for ${symbol} ${timeframe}:`, e instanceof Error ? e.message : e);
      // continue to next provider
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`All OHLCV providers failed for ${symbol} ${timeframe} ${isoDateOnly(start)}→${isoDateOnly(end)}: ${msg}`);
}

export async function getOHLCVMulti(
  symbols: string[],
  timeframe: FetchParams["timeframe"],
  startDate?: string,
  endDate?: string
): Promise<Record<string, FetchResult | { error: string }>> {
  const unique = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (symbol) => {
      try {
        const res = await getOHLCV({ symbol, timeframe, startDate, endDate });
        return [symbol, res] as const;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return [symbol, { error: msg }] as const;
      }
    })
  );
  return Object.fromEntries(entries) as Record<string, FetchResult | { error: string }>;
}
