import type { BacktestResult } from "@/lib/backtest/types";
import type { Strategy } from "@/lib/strategy/schema";
import { EmptyResultsCard } from "@/components/backtest/empty-results-card";
import { PerformanceCard } from "@/components/backtest/performance-card";
import { TradesCard } from "@/components/backtest/trades-card";

type ResultsPanelProps = {
  result: BacktestResult | null;
  strategy?: Strategy | null;
};

export function ResultsPanel({ result, strategy }: ResultsPanelProps) {
  if (!result) return <EmptyResultsCard />;

  return (
    <>
      <PerformanceCard result={result} strategy={strategy} />
      <TradesCard trades={result.trades} />
    </>
  );
}
