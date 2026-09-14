"use client";
import { useState } from "react";
import {
  ArrowRight,
  Database,
  FlaskConical,
  Loader2,
  Play,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { Strategy } from "@/lib/strategy/schema";
import type { BacktestResult } from "@/lib/backtest/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Home() {
  const [prompt, setPrompt] = useState("Buy SPY when SMA 20 crosses above SMA 50, sell when SMA 20 crosses below SMA 50 with 5% stop loss");
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState<"parse" | "backtest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const examples = [
    "Buy SPY when SMA 20 crosses above SMA 50, exit when SMA 20 crosses below SMA 50",
    "Buy AAPL when RSI 14 drops below 30, sell when RSI 14 goes above 70 with 5% stop loss",
    "Long SPY when EMA 12 crosses above EMA 26, exit on opposite cross with 8% take profit",
  ];

  async function handleParse() {
    setLoading("parse"); setError(null); setResult(null);
    try {
      const res = await fetch("/api/parse-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "parse failed");
      setStrategy(data.strategy);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "parse failed");
    } finally { setLoading(null); }
  }

  async function handleBacktest() {
    if (!strategy) return;
    setLoading("backtest"); setError(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, initialCapital: 10000 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "backtest failed");
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "backtest failed");
    } finally { setLoading(null); }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">◈</div>
            <div>
              <h1 className="font-semibold leading-none">AI Trading Research</h1>
              <p className="text-xs text-muted-foreground">NL → Strategy → Backtest</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: NL Input */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Natural Language Strategy</CardTitle>
              <CardDescription>Describe your idea in plain English. Example: RSI mean-reversion, SMA crossover, breakout...</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
                placeholder="e.g. Buy when RSI(14) < 30 and sell when RSI > 70"
              />
              <TooltipProvider>
                <div className="flex gap-2 flex-wrap">
                  {examples.map(ex => (
                    <Tooltip key={ex}>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-full font-normal" onClick={() => setPrompt(ex)}>
                          {ex.slice(0, 42)}…
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{ex}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
              <Button
                onClick={handleParse}
                disabled={loading === "parse" || !prompt.trim()}
                className="w-full"
              >
                {loading === "parse" ? (
                  <><Loader2 className="animate-spin" /> Parsing with AI...</>
                ) : (
                  <><Sparkles /> Generate Strategy <ArrowRight /></>
                )}
              </Button>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {strategy && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Compiled Strategy</CardTitle>
                  <Badge variant="secondary">{strategy.universe.symbols.join(", ")} • {strategy.universe.timeframe}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><span className="font-medium">{strategy.name}</span><p className="text-muted-foreground">{strategy.description}</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted p-3">
                    <div className="text-xs text-muted-foreground">ENTRY ({strategy.entry.logic})</div>
                    <ul className="mt-1 space-y-1 font-mono text-xs">
                      {strategy.entry.conditions.map((c, i) => <li key={i}>{c.left} {c.operator} {c.right}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <div className="text-xs text-muted-foreground">EXIT ({strategy.exit.logic})</div>
                    <ul className="mt-1 space-y-1 font-mono text-xs">
                      {strategy.exit.conditions.map((c, i) => <li key={i}>{c.left} {c.operator} {c.right}</li>)}
                    </ul>
                    {(strategy.exit.stopLossPct || strategy.exit.takeProfitPct) && (
                      <div className="text-xs mt-2 text-muted-foreground">SL: {strategy.exit.stopLossPct ?? "-"}% • TP: {strategy.exit.takeProfitPct ?? "-"}%</div>
                    )}
                  </div>
                </div>
                <details className="rounded-lg bg-zinc-950 text-zinc-100 p-3 dark:bg-zinc-900">
                  <summary className="cursor-pointer text-xs">View JSON</summary>
                  <pre className="mt-2 text-xs overflow-auto max-h-64">{JSON.stringify(strategy, null, 2)}</pre>
                </details>
                <Button
                  onClick={handleBacktest}
                  disabled={loading === "backtest"}
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700"
                >
                  {loading === "backtest" ? (
                    <><Loader2 className="animate-spin" /> Running Backtest...</>
                  ) : (
                    <><Play /> Run Backtest (500 bars mock)</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Results */}
        <div className="space-y-6">
          {!result ? (
            <Card className="border-dashed p-12 text-center">
              <div className="text-3xl mb-3 flex justify-center"><TrendingUp className="size-8 text-muted-foreground" /></div>
              <h3 className="font-medium">No backtest yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Parse a strategy then run backtest. Results: equity curve, Sharpe, drawdown, trades, cached in Redis & persisted to S3.</p>
              <div className="mt-6 grid grid-cols-3 gap-2 text-xs text-left">
                {[
                  ["Redis", "OHLCV + results cached", Database],
                  ["S3", "Backtests persisted", Database],
                  ["Bedrock", "NL → JSON compiler", FlaskConical],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg bg-muted p-3">
                    <div className="font-medium">{k as string}</div><div className="text-muted-foreground">{v as string}</div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Performance — {result.strategyName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      ["Return", `${result.totalReturnPct.toFixed(2)}%`],
                      ["CAGR", `${result.cagrPct.toFixed(2)}%`],
                      ["Sharpe", result.sharpe.toFixed(2)],
                      ["Max DD", `${result.maxDrawdownPct.toFixed(2)}%`],
                      ["Win Rate", `${result.winRate.toFixed(1)}%`],
                      ["Profit Factor", result.profitFactor.toFixed(2)],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-lg bg-muted p-3">
                        <div className="text-xs text-muted-foreground">{l}</div><div className="font-semibold">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between border-t pt-3"><span className="text-muted-foreground">Trades</span><span className="font-mono">{result.totalTrades}</span></div>
                    <div className="flex justify-between border-t pt-3"><span className="text-muted-foreground">W/L</span><span className="font-mono">{result.winningTrades}/{result.losingTrades}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Final Equity</span><span className="font-mono">${result.finalEquity.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Bars</span><span className="font-mono">{result.bars}</span></div>
                  </div>

                  {/* Simple equity curve bars */}
                  <div className="mt-6">
                    <div className="text-xs text-muted-foreground mb-2">Equity Curve (sampled)</div>
                    <div className="h-24 flex items-end gap-px overflow-hidden rounded bg-muted p-2">
                      {result.equityCurve.filter((_, i) => i % Math.ceil(result.equityCurve.length / 80) === 0).map((p, i) => {
                        const min = Math.min(...result.equityCurve.map(x => x.equity));
                        const max = Math.max(...result.equityCurve.map(x => x.equity));
                        const h = max === min ? 50 : ((p.equity - min) / (max - min)) * 80 + 10;
                        return <div key={i} className="flex-1 bg-emerald-500 rounded-t" style={{ height: `${h}%` }} />;
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Trades <span className="text-xs font-normal text-muted-foreground">({result.trades.length} total)</span></CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-64 overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card"><TableRow><TableHead>Entry</TableHead><TableHead>Exit</TableHead><TableHead className="text-right">PnL</TableHead><TableHead className="text-right">Reason</TableHead></TableRow></TableHeader>
                      <TableBody className="font-mono">
                        {result.trades.slice(0, 20).map((t, i) => (
                          <TableRow key={i}>
                            <TableCell>{t.entryTime} @ {t.entryPrice.toFixed(2)}</TableCell>
                            <TableCell>{t.exitTime} @ {t.exitPrice.toFixed(2)}</TableCell>
                            <TableCell className={`text-right ${t.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>{t.pnl.toFixed(2)} ({t.pnlPct.toFixed(1)}%)</TableCell>
                            <TableCell className="text-right text-muted-foreground">{t.exitReason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {result.trades.length > 20 && <div className="text-center text-muted-foreground text-xs mt-2">+ {result.trades.length - 20} more</div>}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
