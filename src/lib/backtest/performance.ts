import type { BacktestResult, EquityPoint, Trade } from "@/lib/backtest/types";

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

export type DrawdownPoint = { timestamp: string; drawdownPct: number };
export type ReturnPoint = { timestamp: string; returnPct: number };
export type TradePnlPoint = { index: number; pnl: number; label: string };
export type MonthlyReturnPoint = { month: string; returnPct: number };

export function getDrawdownSeries(points: EquityPoint[]): DrawdownPoint[] {
  let peak = -Infinity;
  return points.map((p) => {
    if (p.equity > peak) peak = p.equity;
    const dd = peak <= 0 ? 0 : ((peak - p.equity) / peak) * 100;
    return { timestamp: p.timestamp, drawdownPct: dd };
  });
}

export function getCumulativeReturnSeries(
  points: EquityPoint[],
  initialCapital: number
): ReturnPoint[] {
  if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
    return points.map((p) => ({ timestamp: p.timestamp, returnPct: 0 }));
  }
  return points.map((p) => ({
    timestamp: p.timestamp,
    returnPct: ((p.equity - initialCapital) / initialCapital) * 100,
  }));
}

export function getTradePnlSeries(trades: Trade[]): TradePnlPoint[] {
  return trades.map((t, i) => ({
    index: i + 1,
    pnl: t.pnl,
    label: `#${i + 1}`,
  }));
}

export function getMonthlyReturns(points: EquityPoint[]): MonthlyReturnPoint[] {
  const buckets = new Map<string, { first: number; last: number }>();
  for (const p of points) {
    const month = p.timestamp.slice(0, 7);
    if (!month) continue;
    const b = buckets.get(month);
    if (!b) buckets.set(month, { first: p.equity, last: p.equity });
    else b.last = p.equity;
  }
  const out: MonthlyReturnPoint[] = [];
  for (const [month, { first, last }] of buckets) {
    if (first <= 0) continue;
    out.push({ month, returnPct: ((last - first) / first) * 100 });
  }
  return out.sort((a, b) => (a.month < b.month ? -1 : 1));
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tradesToCsv(trades: Trade[]): string {
  const header = [
    "index",
    "entryTime",
    "exitTime",
    "entryPrice",
    "exitPrice",
    "qty",
    "pnl",
    "pnlPct",
    "exitReason",
    "barsHeld",
  ];
  const rows = trades.map((t, i) =>
    [
      i + 1,
      t.entryTime,
      t.exitTime,
      t.entryPrice,
      t.exitPrice,
      t.qty,
      t.pnl,
      t.pnlPct,
      t.exitReason,
      t.barsHeld,
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

export function equityCurveToCsv(points: EquityPoint[]): string {
  const rows = points.map((p) => [p.timestamp, p.equity].map(csvCell).join(","));
  return [["timestamp", "equity"].join(","), ...rows].join("\n");
}
