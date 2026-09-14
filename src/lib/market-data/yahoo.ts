import type { OHLCV } from "@/lib/backtest/types";
import type { FetchParams } from "./types";
import {
  timeframeToYahooInterval,
  toYahooUnix,
  resolveDateWindow,
  aggregateTo4h,
  normalizeSymbol,
} from "./utils";

type YahooChartResponse = {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose: (number | null)[] }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
};

function toISODateOnly(tsSec: number, tf: string): string {
  // For daily keep YYYY-MM-DD, for intraday keep full ISO
  if (tf === "1d") return new Date(tsSec * 1000).toISOString().slice(0, 10);
  return new Date(tsSec * 1000).toISOString();
}

export async function fetchYahooOHLCV(params: FetchParams): Promise<OHLCV[]> {
  const symbol = normalizeSymbol(params.symbol);
  const tf = params.timeframe;
  const { start, end } = resolveDateWindow(tf, params.startDate, params.endDate);

  const interval = timeframeToYahooInterval(tf);
  const period1 = toYahooUnix(start);
  const period2 = toYahooUnix(end);

  // For 4h we fetch 60m and aggregate afterwards
  const effectiveInterval = interval;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${encodeURIComponent(effectiveInterval)}&includePrePost=false&events=div%7Csplit`;

  const res = await fetch(url, {
    headers: {
      // Yahoo blocks without UA
      "User-Agent": "Mozilla/5.0 (compatible; ai-trading-research/1.0)",
      Accept: "application/json",
    },
    // 10s timeout via abort signal if available
    signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Yahoo fetch failed ${res.status} ${res.statusText} for ${symbol} ${tf}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as YahooChartResponse;

  if (json.chart.error) {
    throw new Error(`Yahoo error for ${symbol}: ${json.chart.error.code} - ${json.chart.error.description}`);
  }

  const result = json.chart.result?.[0];
  if (!result || !result.timestamp || result.timestamp.length === 0) {
    throw new Error(`Yahoo returned no data for ${symbol} ${tf} ${start.toISOString()} -> ${end.toISOString()}`);
  }

  const quote = result.indicators.quote?.[0];
  if (!quote) throw new Error(`Yahoo missing quote for ${symbol}`);

  const out: OHLCV[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    const volume = quote.volume[i];
    if (open == null || high == null || low == null || close == null) continue;
    // filter 0 volume / null bars (holidays)
    out.push({
      timestamp: toISODateOnly(result.timestamp[i], tf),
      open,
      high,
      low,
      close,
      volume: volume ?? 0,
    });
  }

  if (out.length === 0) {
    throw new Error(`Yahoo returned empty bars for ${symbol} ${tf}`);
  }

  // aggregate 1h -> 4h if requested
  if (tf === "4h") {
    return aggregateTo4h(out);
  }

  return out;
}
