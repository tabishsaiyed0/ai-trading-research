import { NextRequest, NextResponse } from "next/server";
import { strategySchema } from "@/lib/strategy/schema";
import { runBacktest, generateMockOHLCV } from "@/lib/backtest/engine";
import { cacheSet } from "@/lib/redis";
import { putJsonToS3, isS3Configured } from "@/lib/aws/s3";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOHLCV } from "@/lib/market-data";
import { resolveDateWindow, isoDateOnly } from "@/lib/market-data/utils";

export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(req, "backtest");
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } }
      );
    }

    const body = await req.json();
    const strategy = strategySchema.parse(body.strategy);
    const initialCapital = body.initialCapital ?? 10000;
    const useMock = body.useMock ?? false;

    const symbols = strategy.universe.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) {
      return NextResponse.json({ error: "strategy.universe.symbols must contain at least one symbol" }, { status: 400 });
    }
    const tf = strategy.universe.timeframe;

    const requestedStart = strategy.startDate ?? body.startDate ?? undefined;
    const requestedEnd = strategy.endDate ?? body.endDate ?? undefined;

    async function processSymbol(symbol: string) {
      let ohlcv: import("@/lib/backtest/types").OHLCV[] | null = null;
      let source: string = "unknown";
      let startIso: string | undefined;
      let endIso: string | undefined;

      if (useMock) {
        const seed = `${symbol}:${tf}:${requestedStart ?? "2023-01-01"}`;
        const { start, end } = resolveDateWindow(tf, requestedStart, requestedEnd);
        // approximate days from window for mock length
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
          timeframe: tf,
          startDate: requestedStart,
          endDate: requestedEnd,
        });
        ohlcv = result.ohlcv;
        source = result.source;
        startIso = result.startDate;
        endIso = result.endDate;
      }

      if (!ohlcv || ohlcv.length === 0) {
        throw new Error(`No OHLCV for ${symbol}/${tf}`);
      }

      const result = runBacktest(strategy, ohlcv, initialCapital);

      const enriched = {
        ...result,
        symbol,
        timeframe: tf,
        dataSource: source,
        startDate: startIso,
        endDate: endIso,
      };

      if (isS3Configured()) {
        const key = `backtests/${Date.now()}-${symbol}-${strategy.name.replace(/\s+/g, "-")}.json`;
        await putJsonToS3(key, { strategy, result: enriched, ohlcvMeta: { symbol, timeframe: tf, source, startDate: startIso, endDate: endIso } });
      }

      try {
        await cacheSet(`backtest:${symbol}:${strategy.name}:${tf}`, enriched, 300);
      } catch {}

      return enriched;
    }

    if (symbols.length === 1) {
      const symbol = symbols[0];
      try {
        const enriched = await processSymbol(symbol);
        return NextResponse.json(enriched, {
          headers: {
            "X-Data-Source": String(enriched.dataSource),
            "X-Symbol": symbol,
          },
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "backtest failed";
        console.error(`[backtest] ${symbol} failed`, e);
        return NextResponse.json({ error: msg, symbol }, { status: 500 });
      }
    }

    const results: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    const metas: Record<string, { source: string; startDate?: string; endDate?: string }> = {};

    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const enriched = await processSymbol(symbol);
          results[symbol] = enriched;
          metas[symbol] = { source: String((enriched as { dataSource: string }).dataSource), startDate: (enriched as { startDate?: string }).startDate, endDate: (enriched as { endDate?: string }).endDate };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          errors[symbol] = msg;
          console.error(`[backtest] ${symbol} failed`, e);
        }
      })
    );

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
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
