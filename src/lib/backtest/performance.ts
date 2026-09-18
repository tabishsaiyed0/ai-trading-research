import type { BacktestResult, EquityPoint } from "@/lib/backtest/types";

export type PerformanceMetric = {
  key: string;
  label: string;
  value: string;
};

export type SecondaryStat = {
  key: string;
  label: string;
  value: string;
};

const fmtPct = (v: number, digits = 2) => `${Number.isFinite(v) ? v.toFixed(digits) : "—"}%`;
const fmtNum = (v: number, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "—");
const fmtProfitFactor = (v: number) => {
  if (!Number.isFinite(v)) return "∞";
  return v.toFixed(2);
};

export function getPrimaryMetrics(result: BacktestResult): PerformanceMetric[] {
  return [
    { key: "return", label: "Return", value: fmtPct(result.totalReturnPct) },
    { key: "cagr", label: "CAGR", value: fmtPct(result.cagrPct) },
    { key: "sharpe", label: "Sharpe", value: fmtNum(result.sharpe) },
    { key: "maxDd", label: "Max DD", value: fmtPct(result.maxDrawdownPct) },
    { key: "winRate", label: "Win Rate", value: fmtPct(result.winRate, 1) },
    { key: "profitFactor", label: "Profit Factor", value: fmtProfitFactor(result.profitFactor) },
  ];
}

export function getSecondaryStats(result: BacktestResult): SecondaryStat[] {
  return [
    { key: "trades", label: "Trades", value: String(result.totalTrades) },
    { key: "wl", label: "W/L", value: `${result.winningTrades}/${result.losingTrades}` },
    { key: "equity", label: "Final Equity", value: `$${result.finalEquity.toFixed(2)}` },
    { key: "bars", label: "Bars", value: String(result.bars) },
  ];
}

export function sampleEquityCurve(
  points: EquityPoint[],
  maxSamples = 80
): EquityPoint[] {
  if (points.length === 0) return points;
  if (points.length <= maxSamples) return points;
  const stride = Math.ceil(points.length / maxSamples);
  const sampled = points.filter((_, i) => i % stride === 0);
  // always include last point so chart doesn't truncate
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

export function getEquityRange(points: EquityPoint[]) {
  if (points.length === 0) return { min: 0, max: 0 };
  let min = points[0].equity;
  let max = points[0].equity;
  for (let i = 1; i < points.length; i++) {
    const v = points[i].equity;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}
