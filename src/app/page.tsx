"use client";
import { useState } from "react";
import type { Strategy } from "@/lib/strategy/schema";
import type { BacktestResult } from "@/lib/backtest/types";
import { DEFAULT_PROMPT, EXAMPLE_PROMPTS } from "@/lib/strategy/examples";
import { AppHeader } from "@/components/layout/app-header";
import { StrategyPromptCard } from "@/components/strategy/strategy-prompt-card";
import { CompiledStrategyCard } from "@/components/strategy/compiled-strategy-card";
import { ResultsPanel } from "@/components/backtest/results-panel";

export default function Home() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState<"parse" | "backtest" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <AppHeader />

      <main className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <StrategyPromptCard
            prompt={prompt}
            examples={EXAMPLE_PROMPTS}
            isParsing={loading === "parse"}
            error={error}
            onPromptChange={setPrompt}
            onGenerate={handleParse}
          />

          {strategy && (
            <CompiledStrategyCard
              strategy={strategy}
              isBacktesting={loading === "backtest"}
              onRunBacktest={handleBacktest}
            />
          )}
        </div>

        <div className="space-y-6">
          <ResultsPanel result={result} />
        </div>
      </main>
    </div>
  );
}
