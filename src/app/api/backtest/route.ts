import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { strategySchema, Strategy } from "@/lib/strategy/schema";
import { runBacktest } from "@/lib/backtest/engine";
import { generateMockOHLCV } from "@/lib/backtest/mock";
import { cacheSet } from "@/lib/redis";
import { putJsonToS3, isS3Configured } from "@/lib/aws/s3";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOHLCV } from "@/lib/market-data";
import { resolveDateWindow, isoDateOnly } from "@/lib/market-data/utils";
import type { OHLCV } from "@/lib/backtest/types";

const MAX_SYMBOLS = 5;
const FANOUT_TIMEOUT_MS = 30000;

const bodySchema = z.object({
  strategy: z.unknown(),
  initialCapital: z.number().positive().max(1_000_000_000).optional(),
  useMock: z.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function sanitizeForKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
}

function strategyHash(strategy: Strategy): string {
  return createHash("sha256").update(JSON.stringify(strategy)).digest("hex").slice(0, 16);
}

function backtestCacheKey(symbol: string, strategy: Strategy, timeframe: string): string {
  return `backtest:${sanitizeForKey(symbol)}:${strategyHash(strategy)}:${timeframe}`;
}

function s3KeyFor(symbol: string, strategyName: string): string {
  return `backtests/${Date.now()}-${sanitizeForKey(symbol)}-${sanitizeForKey(strategyName)}.json`;
}

async function processSymbol(
  strategy: Strategy,
  symbol: string,
  timeframe: Strategy["universe"]["timeframe"],
  requestedStart: string | undefined,
  requestedEnd: string | undefined,
  initialCapital: number,
  useMock: boolean
) {
  let ohlcv: OHLCV[] | null = null;
  let source = "unknown";
  let startIso: string | undefined;
  let endIso: string | undefined;

  if (useMock) {
    const seed = `${symbol}:${timeframe}:${requestedStart ?? "2023-01-01"}`;
    const { start, end } = resolveDateWindow(timeframe, requestedStart, requestedEnd);
    const ms = end.getTime() - start.getTime();
    const days = Math.max(30, Math.min(2000, Math.ceil(ms / (24 * 60 * 60 * 1000))));
    ohlcv = generateMockOHLCV(days, 100, isoDateOnly(start), seed);
    if (requestedEnd) {
      ohlcv = ohlcv.filter((b) => b.timestamp <= requestedEnd!);
    }
    source = "mock";
    startIso = isoDateOnly(start);
    endIso = isoDateOnly(end);
  } else {
    const result = await getOHLCV({
      symbol,
      timeframe,
      startDate: requestedStart,
      endDate: requestedEnd,
    });
    ohlcv = result.ohlcv;
    source = result.source;
    startIso = result.startDate;
    endIso = result.endDate;
  }

  if (!ohlcv || ohlcv.length === 0) {
    throw new Error(`No OHLCV for ${symbol}/${timeframe}`);
  }

  const result = runBacktest(strategy, ohlcv, initialCapital);

  const enriched = {
    ...result,
    symbol,
    timeframe,
    dataSource: source,
    startDate: startIso,
    endDate: endIso,
  };

  if (isS3Configured()) {
    const key = s3KeyFor(symbol, strategy.name);
    void putJsonToS3(key, {
      strategy,
      result: enriched,
      ohlcvMeta: { symbol, timeframe, source, startDate: startIso, endDate: endIso },
    }).catch(() => {});
  }

  void cacheSet(backtestCacheKey(symbol, strategy, timeframe), enriched, 300).catch(() => {});

  return enriched;
}

export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(req, "backtest");
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } }
      );
    }

    const rawBody = await req.json();
    const parsedBody = bodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "invalid request", details: parsedBody.error.flatten() }, { status: 400 });
    }
    const { initialCapital: rawCapital, useMock: rawUseMock, startDate: bodyStart, endDate: bodyEnd } = parsedBody.data;
    const initialCapital = rawCapital ?? 10000;
    const useMock = rawUseMock ?? false;

    const stratParsed = strategySchema.safeParse(parsedBody.data.strategy);
    if (!stratParsed.success) {
      return NextResponse.json({ error: "invalid strategy", details: stratParsed.error.flatten() }, { status: 400 });
    }
    const strategy = stratParsed.data;

    const requestedStart = strategy.startDate ?? bodyStart;
    const requestedEnd = strategy.endDate ?? bodyEnd;
    if (requestedStart && isNaN(Date.parse(requestedStart))) {
      return NextResponse.json({ error: "startDate must be a valid date" }, { status: 400 });
    }
    if (requestedEnd && isNaN(Date.parse(requestedEnd))) {
      return NextResponse.json({ error: "endDate must be a valid date" }, { status: 400 });
    }

    const symbols = strategy.universe.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) {
      return NextResponse.json({ error: "strategy.universe.symbols must contain at least one symbol" }, { status: 400 });
    }
    if (symbols.length > MAX_SYMBOLS) {
      return NextResponse.json(
        { error: `too many symbols: ${symbols.length} > ${MAX_SYMBOLS}`, maxSymbols: MAX_SYMBOLS },
        { status: 400 }
      );
    }
    const tf = strategy.universe.timeframe;

    if (symbols.length === 1) {
      const symbol = symbols[0];
      try {
        const enriched = await processSymbol(strategy, symbol, tf, requestedStart, requestedEnd, initialCapital, useMock);
        return NextResponse.json(enriched, {
          headers: {
            "X-Data-Source": String(enriched.dataSource),
            "X-Symbol": symbol,
          },
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "backtest failed";
        const isUserError = msg.includes("not yet supported") || msg.includes("Unsupported indicator");
        console.error(`[backtest] ${symbol} failed`, e);
        return NextResponse.json({ error: msg, symbol }, { status: isUserError ? 400 : 500 });
      }
    }

    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    const metas: Record<string, { source: string; startDate?: string; endDate?: string }> = {};

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FANOUT_TIMEOUT_MS);

    try {
      await Promise.all(
        symbols.map(async (symbol) => {
          if (controller.signal.aborted) {
            errors[symbol] = "fanout timed out";
            return;
          }
          try {
            const enriched = await processSymbol(strategy, symbol, tf, requestedStart, requestedEnd, initialCapital, useMock);
            results[symbol] = enriched;
            metas[symbol] = {
              source: String((enriched as { dataSource: string }).dataSource),
              startDate: (enriched as { startDate?: string }).startDate,
              endDate: (enriched as { endDate?: string }).endDate,
            };
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            errors[symbol] = msg;
            console.error(`[backtest] ${symbol} failed`, e);
          }
        })
      );
    } finally {
      clearTimeout(timeout);
    }

    if (Object.keys(results).length === 0) {
      return NextResponse.json({ error: "All symbols failed", errors, symbols }, { status: 500 });
    }
    const status = Object.keys(errors).length > 0 ? 207 : 200;
    return NextResponse.json(
      {
        results,
        errors: Object.keys(errors).length ? errors : undefined,
        meta: {
          symbols,
          timeframe: tf,
          sources: metas,
          initialCapital,
        },
      },
      { status }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "backtest failed";
    console.error("[backtest] unhandled", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
