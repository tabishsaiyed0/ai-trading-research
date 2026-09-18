import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BacktestResult } from "@/lib/backtest/types";
import { getPrimaryMetrics, getSecondaryStats } from "@/lib/backtest/performance";
import { StatTile } from "@/components/backtest/stat-tile";
import { EquityCurve } from "@/components/backtest/equity-curve";

type PerformanceCardProps = {
  result: BacktestResult;
};

export function PerformanceCard({ result }: PerformanceCardProps) {
  const primaryMetrics = getPrimaryMetrics(result);
  const secondaryStats = getSecondaryStats(result);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance — {result.strategyName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {primaryMetrics.map((m) => (
            <StatTile key={m.key} label={m.label} value={m.value} />
          ))}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {secondaryStats.map((s, i) => (
            <div
              key={s.key}
              className={`flex justify-between ${i < 2 ? "border-t pt-3" : ""}`}
            >
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd className="font-mono">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <EquityCurve points={result.equityCurve} />
        </div>
      </CardContent>
    </Card>
  );
}
