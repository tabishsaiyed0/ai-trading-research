"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BacktestResult } from "@/lib/backtest/types";
import {
  getCumulativeReturnSeries,
  getDrawdownSeries,
  getMonthlyReturns,
  getTradePnlSeries,
  sampleEquityCurve,
} from "@/lib/backtest/performance";

type ChartKey = "equity" | "drawdown" | "returns" | "pnl" | "monthly";

const CHART_TABS: { key: ChartKey; label: string }[] = [
  { key: "equity", label: "Equity" },
  { key: "drawdown", label: "Drawdown" },
  { key: "returns", label: "Return %" },
  { key: "pnl", label: "Trade PnL" },
  { key: "monthly", label: "Monthly" },
];

const shortDate = (iso: string) => iso.slice(5, 10);

type PerformanceChartsProps = {
  result: BacktestResult;
};

export function PerformanceCharts({ result }: PerformanceChartsProps) {
  const [tab, setTab] = useState<ChartKey>("equity");

  const equityData = useMemo(
    () =>
      sampleEquityCurve(result.equityCurve, 300).map((p) => ({
        t: shortDate(p.timestamp),
        full: p.timestamp,
        equity: Math.round(p.equity * 100) / 100,
      })),
    [result.equityCurve]
  );

  const ddData = useMemo(() => {
    const sampled = sampleEquityCurve(result.equityCurve, 300);
    const dd = getDrawdownSeries(sampled);
    return dd.map((d) => ({
      t: shortDate(d.timestamp),
      full: d.timestamp,
      drawdown: Math.round(d.drawdownPct * 100) / 100,
    }));
  }, [result.equityCurve]);

  const returnData = useMemo(() => {
    const sampled = sampleEquityCurve(result.equityCurve, 300);
    return getCumulativeReturnSeries(sampled, result.initialCapital).map((r) => ({
      t: shortDate(r.timestamp),
      full: r.timestamp,
      ret: Math.round(r.returnPct * 100) / 100,
    }));
  }, [result.equityCurve, result.initialCapital]);

  const pnlData = useMemo(() => getTradePnlSeries(result.trades), [result.trades]);
  const monthlyData = useMemo(
    () =>
      getMonthlyReturns(result.equityCurve).map((m) => ({
        ...m,
        returnPct: Math.round(m.returnPct * 100) / 100,
      })),
    [result.equityCurve]
  );

  const hasEquity = equityData.length > 1;
  const hasPnl = pnlData.length > 0;
  const hasMonthly = monthlyData.length > 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Performance charts">
        {CHART_TABS.map((t) => {
          const disabled =
            (t.key !== "pnl" && t.key !== "monthly" && !hasEquity) ||
            (t.key === "pnl" && !hasPnl) ||
            (t.key === "monthly" && !hasMonthly);
          return (
            <Button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              variant={tab === t.key ? "default" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={() => setTab(t.key)}
              className={cn("h-7 px-2.5 text-xs")}
            >
              {t.label}
            </Button>
          );
        })}
      </div>

      <div className="h-60 w-full rounded-md border bg-card p-2">
        {!hasEquity && tab !== "pnl" ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Not enough data to chart.
          </div>
        ) : tab === "equity" ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={32} />
              <YAxis tick={{ fontSize: 10 }} width={64} domain={["auto", "auto"]} />
              <Tooltip
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.full ?? ""
                }
                formatter={(v) => [`$${Number(v).toFixed(2)}`, "Equity"]}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.25}
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : tab === "drawdown" ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ddData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={32} />
              <YAxis tick={{ fontSize: 10 }} width={48} unit="%" />
              <Tooltip
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.full ?? ""
                }
                formatter={(v) => [`${Number(v).toFixed(2)}%`, "Drawdown"]}
              />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.25}
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : tab === "returns" ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={returnData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={32} />
              <YAxis tick={{ fontSize: 10 }} width={52} unit="%" />
              <Tooltip
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.full ?? ""
                }
                formatter={(v) => [`${Number(v).toFixed(2)}%`, "Return"]}
              />
              <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="ret"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.22}
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : tab === "pnl" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pnlData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} width={64} />
              <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, "PnL"]} />
              <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {pnlData.map((d) => (
                  <Cell key={d.index} fill={d.pnl >= 0 ? "#10b981" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} width={52} unit="%" />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, "Month"]} />
              <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />
              <Bar dataKey="returnPct" radius={[2, 2, 0, 0]}>
                {monthlyData.map((d) => (
                  <Cell key={d.month} fill={d.returnPct >= 0 ? "#10b981" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        {tab === "equity" && "Portfolio equity over time."}
        {tab === "drawdown" && "Peak-to-trough drawdown (%)."}
        {tab === "returns" && "Cumulative return vs initial capital (%)."}
        {tab === "pnl" && "Realized PnL per closed trade."}
        {tab === "monthly" && "Return bucketed by calendar month."}
      </div>
    </div>
  );
}
