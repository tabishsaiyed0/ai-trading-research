import type { OHLCV } from "@/lib/backtest/types";
import type { FetchParams } from "./types";
import { timeframeToAlpaca, resolveDateWindow, normalizeSymbol } from "./utils";

type AlpacaBar = {
  t: string; // RFC3339
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n?: number;
  vw?: number;
};

type AlpacaResponse = {
  bars?: Record<string, AlpacaBar[]>;
  next_page_token?: string | null;
};

function isoForAlpaca(d: Date): string {
  return d.toISOString();
}

export async function fetchAlpacaOHLCV(params: FetchParams): Promise<OHLCV[]> {
  const key = process.env.ALPACA_API_KEY || process.env.APCA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET || process.env.APCA_API_SECRET_KEY;
  if (!key || !secret) {
    throw new Error("Alpaca credentials missing (ALPACA_API_KEY / ALPACA_API_SECRET)");
  }

  const symbol = normalizeSymbol(params.symbol);
  const tf = params.timeframe;
  const { start, end } = resolveDateWindow(tf, params.startDate, params.endDate);
  const timeframe = timeframeToAlpaca(tf);

  const feed = process.env.ALPACA_DATA_FEED || "iex"; // iex free, sip paid
  const base = process.env.ALPACA_DATA_URL || "https://data.alpaca.markets";
  const limit = params.limit ?? 10000;

  const url = `${base}/v2/stocks/bars?symbols=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&start=${encodeURIComponent(isoForAlpaca(start))}&end=${encodeURIComponent(isoForAlpaca(end))}&limit=${limit}&adjustment=raw&feed=${encodeURIComponent(feed)}&sort=asc`;

  const out: OHLCV[] = [];
  let pageToken: string | null | undefined = undefined;
  let pages = 0;

  do {
    const fetchUrl = pageToken ? `${url}&page_token=${encodeURIComponent(pageToken)}` : url;
    const res = await fetch(fetchUrl, {
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Alpaca fetch failed ${res.status} ${res.statusText} for ${symbol} ${tf}: ${text.slice(0, 400)}`);
    }

    const json = (await res.json()) as AlpacaResponse;
    const bars = json.bars?.[symbol] ?? [];

    for (const b of bars) {
      out.push({
        timestamp: tf === "1d" ? b.t.slice(0, 10) : b.t,
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      });
    }

    pageToken = json.next_page_token;
    pages++;
    if (pages > 10) break; // safety cap
  } while (pageToken);

  if (out.length === 0) {
    throw new Error(`Alpaca returned no bars for ${symbol} ${tf} ${start.toISOString()} -> ${end.toISOString()}`);
  }

  return out;
}
