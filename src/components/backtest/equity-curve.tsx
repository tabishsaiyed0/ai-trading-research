import { useMemo } from "react";
import type { EquityPoint } from "@/lib/backtest/types";
import { getEquityRange, sampleEquityCurve } from "@/lib/backtest/performance";

type EquityCurveProps = {
  points: EquityPoint[];
  maxSamples?: number;
};

export function EquityCurve({ points, maxSamples = 80 }: EquityCurveProps) {
  const bars = useMemo(() => {
    const sampled = sampleEquityCurve(points, maxSamples);
    if (sampled.length === 0) return [];
    const { min, max } = getEquityRange(points);
    return sampled.map((p, i) => ({
      key: `${p.timestamp}-${i}`,
      heightPct: max === min ? 50 : ((p.equity - min) / (max - min)) * 80 + 10,
    }));
  }, [points, maxSamples]);

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">Equity Curve (sampled)</div>
      <div className="h-24 flex items-end gap-px overflow-hidden rounded bg-muted p-2">
        {bars.map((b) => (
          <div
            key={b.key}
            className="flex-1 bg-emerald-500 rounded-t"
            style={{ height: `${b.heightPct}%` }}
          />
        ))}
      </div>
    </div>
  );
}
