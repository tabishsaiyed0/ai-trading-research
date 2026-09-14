import type { OHLCV } from "@/lib/backtest/types";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type FetchParams = {
  symbol: string;
  timeframe: Timeframe;
  startDate?: string; // ISO YYYY-MM-DD or ISO datetime
  endDate?: string;
  limit?: number; // soft cap
};

export type ProviderName = "redis" | "s3" | "yahoo" | "alpaca" | "mock";

export type FetchResult = {
  ohlcv: OHLCV[];
  source: ProviderName;
  startDate: string;
  endDate: string;
};

export type DataProvider = {
  name: ProviderName;
  fetch(params: FetchParams): Promise<OHLCV[] | null>;
};
