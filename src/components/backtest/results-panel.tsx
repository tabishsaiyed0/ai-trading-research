import type { BacktestResult } from "@/lib/backtest/types";
import { EmptyResultsCard } from "@/components/backtest/empty-results-card";
import { PerformanceCard } from "@/components/backtest/performance-card";
import { TradesCard } from "@/components/backtest/trades-card";

type ResultsPanelProps = {
  result: BacktestResult | null;
};

export function ResultsPanel({ result }: ResultsPanelProps) {
  if (!result) return <EmptyResultsCard />;

  return (
    <>
      <PerformanceCard result={result} />
      <TradesCard trades={result.trades} />
    </>
  );
}
