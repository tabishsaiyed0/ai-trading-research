import type { Timeframe } from "./types";

export function normalizeSymbol(s: string): string {
  return s.trim().toUpperCase();
}

export function timeframeToYahooInterval(tf: Timeframe): string {
  // Yahoo supports: 1m,2m,5m,15m,30m,60m,90m,1h,1d,5d,1wk,1mo,3mo
  const map: Record<Timeframe, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "60m",
    "4h": "60m", // fetch 1h then aggregate
    "1d": "1d",
  };
  return map[tf];
}

export function timeframeToAlpaca(tf: Timeframe): string {
  const map: Record<Timeframe, string> = {
    "1m": "1Min",
    "5m": "5Min",
    "15m": "15Min",
    "1h": "1Hour",
    "4h": "4Hour",
    "1d": "1Day",
  };
  return map[tf];
}

export function timeframeMs(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    "1m": 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
  };
  return map[tf];
}

export function resolveDateWindow(
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): { start: Date; end: Date } {
  const now = new Date();
  // default: last 1y
  let end = endDate ? new Date(endDate) : now;
  let start = startDate ? new Date(startDate) : new Date(end);

  if (!startDate) {
    start = new Date(end);
    start.setFullYear(start.getFullYear() - 1);
  }

  // sanity, if start invalid
  if (isNaN(start.getTime())) {
    start = new Date(end);
    start.setFullYear(start.getFullYear() - 1);
  }
  if (isNaN(end.getTime())) end = now;

  // ensure start < end
  if (start >= end) {
    const tmp = new Date(end);
    tmp.setFullYear(tmp.getFullYear() - 1);
    start = tmp;
  }

  // Yahoo intraday limits: 1m ~ 7d, 5m/15m/1h ~ 60d max via query1
  // Clamp start for intraday so we don't request > allowed range => still request but Yahoo may truncate.
  // We keep 1y window for daily, but for minute we could warn. Keep as is, provider handles truncation.
  return { start, end };
}

export function toYahooUnix(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

export function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function cacheTtlForTimeframe(tf: Timeframe): number {
  switch (tf) {
    case "1m":
    case "5m":
      return 60; // 1 min
    case "15m":
      return 120;
    case "1h":
    case "4h":
      return 300; // 5 min
    case "1d":
    default:
      return 3600; // 1h
  }
}

export function aggregateTo4h(bars: import("@/lib/backtest/types").OHLCV[]): import("@/lib/backtest/types").OHLCV[] {
  if (bars.length === 0) return bars;
  const out: import("@/lib/backtest/types").OHLCV[] = [];
  for (let i = 0; i < bars.length; i += 4) {
    const slice = bars.slice(i, i + 4);
    if (slice.length === 0) continue;
    out.push({
      timestamp: slice[0].timestamp,
      open: slice[0].open,
      high: Math.max(...slice.map((b) => b.high)),
      low: Math.min(...slice.map((b) => b.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((a, b) => a + b.volume, 0),
    });
  }
  return out;
}

export function dedupeSort(bars: import("@/lib/backtest/types").OHLCV[]): import("@/lib/backtest/types").OHLCV[] {
  const m = new Map<string, import("@/lib/backtest/types").OHLCV>();
  for (const b of bars) m.set(b.timestamp, b);
  return [...m.values()].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
}
