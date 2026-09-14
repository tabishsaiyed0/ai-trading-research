"use client";
import { useState } from "react";
import type { Strategy } from "@/lib/strategy/schema";
import type { BacktestResult } from "@/lib/backtest/types";

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
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100">
      <header className="sticky top-0 z-10 border-b bg-white/80 dark:bg-zinc-900/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-bold">◈</div>
            <div>
              <h1 className="font-semibold leading-none">AI Trading Research</h1>
              <p className="text-xs text-zinc-500">NL → Strategy → Backtest</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: NL Input */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border shadow-sm p-6">
            <h2 className="font-semibold mb-1">Natural Language Strategy</h2>
            <p className="text-sm text-zinc-500 mb-4">Describe your idea in plain English. Example: RSI mean-reversion, SMA crossover, breakout...</p>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              placeholder="e.g. Buy when RSI(14) < 30 and sell when RSI > 70"
              className="w-full rounded-xl border bg-zinc-50 dark:bg-zinc-800 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
            />
            <div className="flex gap-2 flex-wrap mt-3">
              {examples.map(ex => (
                <button key={ex} onClick={() => setPrompt(ex)} className="text-xs px-2.5 py-1 rounded-full border bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700">
                  {ex.slice(0, 42)}…
                </button>
              ))}
            </div>
            <button
              onClick={handleParse}
              disabled={loading === "parse" || !prompt.trim()}
              className="mt-4 w-full rounded-xl bg-black dark:bg-white text-white dark:text-black py-2.5 text-sm font-medium disabled:opacity-50 hover:opacity-90"
            >
              {loading === "parse" ? "Parsing with AI..." : "Generate Strategy →"}
            </button>
            {error && <p className="mt-3 text-sm text-red-600 bg-red-50 dark:bg-red-950 p-2 rounded-lg">{error}</p>}
          </div>

          {strategy && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 border shadow-sm p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Compiled Strategy</h3>
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">{strategy.universe.symbols.join(", ")} • {strategy.universe.timeframe}</span>
              </div>
              <div className="space-y-3 text-sm">
                <div><span className="font-medium">{strategy.name}</span><p className="text-zinc-500">{strategy.description}</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                    <div className="text-xs text-zinc-500">ENTRY ({strategy.entry.logic})</div>
                    <ul className="mt-1 space-y-1 font-mono text-xs">
                      {strategy.entry.conditions.map((c, i) => <li key={i}>{c.left} {c.operator} {c.right}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                    <div className="text-xs text-zinc-500">EXIT ({strategy.exit.logic})</div>
                    <ul className="mt-1 space-y-1 font-mono text-xs">
                      {strategy.exit.conditions.map((c, i) => <li key={i}>{c.left} {c.operator} {c.right}</li>)}
                    </ul>
                    {(strategy.exit.stopLossPct || strategy.exit.takeProfitPct) && (
                      <div className="text-xs mt-2 text-zinc-600">SL: {strategy.exit.stopLossPct ?? "-"}% • TP: {strategy.exit.takeProfitPct ?? "-"}%</div>
                    )}
                  </div>
                </div>
                <details className="rounded-xl bg-zinc-950 text-zinc-100 p-3">
                  <summary className="cursor-pointer text-xs">View JSON</summary>
                  <pre className="mt-2 text-xs overflow-auto max-h-64">{JSON.stringify(strategy, null, 2)}</pre>
                </details>
              </div>
              <button
                onClick={handleBacktest}
                disabled={loading === "backtest"}
                className="mt-4 w-full rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-emerald-700"
              >
                {loading === "backtest" ? "Running Backtest..." : "▶ Run Backtest (500 bars mock)"}
              </button>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="space-y-6">
          {!result ? (
            <div className="rounded-2xl border border-dashed bg-white dark:bg-zinc-900 p-12 text-center">
              <div className="text-3xl mb-3">📈</div>
              <h3 className="font-medium">No backtest yet</h3>
              <p className="text-sm text-zinc-500 mt-1">Parse a strategy then run backtest. Results: equity curve, Sharpe, drawdown, trades, cached in Redis & persisted to S3.</p>
              <div className="mt-6 grid grid-cols-3 gap-2 text-xs text-left">
                {[
                  ["Redis", "OHLCV + results cached"],
                  ["S3", "Backtests persisted"],
                  ["Bedrock", "NL → JSON compiler"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                    <div className="font-medium">{k}</div><div className="text-zinc-500">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border shadow-sm p-6">
                <h3 className="font-semibold mb-4">Performance — {result.strategyName}</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ["Return", `${result.totalReturnPct.toFixed(2)}%`],
                    ["CAGR", `${result.cagrPct.toFixed(2)}%`],
                    ["Sharpe", result.sharpe.toFixed(2)],
                    ["Max DD", `${result.maxDrawdownPct.toFixed(2)}%`],
                    ["Win Rate", `${result.winRate.toFixed(1)}%`],
                    ["Profit Factor", result.profitFactor.toFixed(2)],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                      <div className="text-xs text-zinc-500">{l}</div><div className="font-semibold">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between border-t pt-3"><span className="text-zinc-500">Trades</span><span className="font-mono">{result.totalTrades}</span></div>
                  <div className="flex justify-between border-t pt-3"><span className="text-zinc-500">W/L</span><span className="font-mono">{result.winningTrades}/{result.losingTrades}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Final Equity</span><span className="font-mono">${result.finalEquity.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Bars</span><span className="font-mono">{result.bars}</span></div>
                </div>

                {/* Simple equity curve bars */}
                <div className="mt-6">
                  <div className="text-xs text-zinc-500 mb-2">Equity Curve (sampled)</div>
                  <div className="h-24 flex items-end gap-px overflow-hidden rounded bg-zinc-50 dark:bg-zinc-800 p-2">
                    {result.equityCurve.filter((_, i) => i % Math.ceil(result.equityCurve.length / 80) === 0).map((p, i) => {
                      const min = Math.min(...result.equityCurve.map(x => x.equity));
                      const max = Math.max(...result.equityCurve.map(x => x.equity));
                      const h = max === min ? 50 : ((p.equity - min) / (max - min)) * 80 + 10;
                      return <div key={i} className="flex-1 bg-emerald-500 rounded-t" style={{ height: `${h}%` }} />;
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-white dark:bg-zinc-900 border shadow-sm p-6">
                <h3 className="font-semibold mb-3">Trades <span className="text-xs font-normal text-zinc-500">({result.trades.length} total)</span></h3>
                <div className="max-h-64 overflow-auto text-xs">
                  <table className="w-full">
                    <thead className="text-zinc-500 sticky top-0 bg-white dark:bg-zinc-900"><tr><th className="text-left py-1">Entry</th><th className="text-left">Exit</th><th className="text-right">PnL</th><th className="text-right">Reason</th></tr></thead>
                    <tbody className="font-mono">
                      {result.trades.slice(0, 20).map((t, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-1">{t.entryTime} @ {t.entryPrice.toFixed(2)}</td>
                          <td>{t.exitTime} @ {t.exitPrice.toFixed(2)}</td>
                          <td className={`text-right ${t.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>{t.pnl.toFixed(2)} ({t.pnlPct.toFixed(1)}%)</td>
                          <td className="text-right text-zinc-500">{t.exitReason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.trades.length > 20 && <div className="text-center text-zinc-500 mt-2">+ {result.trades.length - 20} more</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
