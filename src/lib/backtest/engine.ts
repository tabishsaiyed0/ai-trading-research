import { Strategy, Condition } from "../strategy/schema";
import { OHLCV, BacktestResult, Trade, EquityPoint } from "./types";
import { computeSeries } from "./indicators";

function evalCondition(
  cond: Condition,
  idx: number,
  close: number[],
  cache: Record<string, (number | null)[]>
): boolean {
  const leftSeries = computeSeries(close, cond.left, cache);
  const rightSeries = computeSeries(close, cond.right, cache);
  const l = leftSeries[idx];
  const r = rightSeries[idx];
  if (l == null || r == null) return false;

  switch (cond.operator) {
    case ">":
      return l > r;
    case "<":
      return l < r;
    case ">=":
      return l >= r;
    case "<=":
      return l <= r;
    case "==":
      return Math.abs(l - r) < 1e-9;
    case "crosses_above": {
      const lPrev = leftSeries[idx - 1];
      const rPrev = rightSeries[idx - 1];
      if (lPrev == null || rPrev == null) return false;
      return lPrev <= rPrev && l > r;
    }
    case "crosses_below": {
      const lPrev = leftSeries[idx - 1];
      const rPrev = rightSeries[idx - 1];
      if (lPrev == null || rPrev == null) return false;
      return lPrev >= rPrev && l < r;
    }
    default:
      return false;
  }
}

function evalLogic(
  conditions: Condition[],
  logic: "AND" | "OR",
  idx: number,
  close: number[],
  cache: Record<string, (number | null)[]>
) {
  const results = conditions.map((c) => evalCondition(c, idx, close, cache));
  return logic === "AND" ? results.every(Boolean) : results.some(Boolean);
}

function collectIndicatorExprs(strategy: Strategy): string[] {
  const exprs = new Set<string>();
  for (const ind of strategy.indicators) {
    if (ind.type === "SMA") exprs.add(`SMA(${ind.period})`);
    if (ind.type === "EMA") exprs.add(`EMA(${ind.period})`);
    if (ind.type === "RSI") exprs.add(`RSI(${ind.period})`);
    // MACD/BBANDS are validated at schema level; if reached here they are unsupported in engine
  }
  const allConds = [...strategy.entry.conditions, ...strategy.exit.conditions];
  for (const c of allConds) {
    for (const expr of [c.left, c.right]) {
      const t = expr.trim();
      if (t === "" || !isNaN(Number(t)) || t.toLowerCase() === "close") continue;
      // capture SMA(n)/EMA(n)/RSI(n) patterns — normalize later in computeSeries
      if (/^(SMA|EMA|RSI)\(\d+\)$/i.test(t)) exprs.add(t);
    }
  }
  return [...exprs];
}

export function runBacktest(
  strategy: Strategy,
  ohlcv: OHLCV[],
  initialCapital = 10000
): BacktestResult {
  const close = ohlcv.map((b) => b.close);
  const cache: Record<string, (number | null)[]> = {};

  // Reject unsupported indicators early with actionable 400
  for (const ind of strategy.indicators) {
    if (ind.type === "MACD" || ind.type === "BBANDS") {
      throw new Error(`Indicator ${ind.type} is not yet supported by the backtest engine. Use SMA/EMA/RSI.`);
    }
  }

  // Pre-warm all indicator series once (avoids per-bar per-condition recompute)
  const exprs = collectIndicatorExprs(strategy);
  for (const e of exprs) {
    try {
      computeSeries(close, e, cache);
    } catch {
      throw new Error(`Unsupported indicator expression in strategy: ${e}. Supported: close, SMA(n), EMA(n), RSI(n)`);
    }
  }

  let equity = initialCapital;
  let position: { entryIdx: number; entryPrice: number; qty: number; peakPrice: number } | null = null;
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];

  let peak = initialCapital;
  let maxDD = 0;

  for (let i = 0; i < ohlcv.length; i++) {
    const bar = ohlcv[i];
    const price = bar.close;

    let curEquity = equity;
    if (position) {
      const unrealized = (price - position.entryPrice) * position.qty;
      curEquity = equity + unrealized;
    }
    equityCurve.push({ timestamp: bar.timestamp, equity: curEquity });
    if (curEquity > peak) peak = curEquity;
    const dd = peak === 0 ? 0 : ((peak - curEquity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;

    if (position) {
      if (bar.high > position.peakPrice) position.peakPrice = bar.high;

      const shouldExit = evalLogic(strategy.exit.conditions, strategy.exit.logic, i, close, cache);
      const stopLoss = strategy.exit.stopLossPct;
      const takeProfit = strategy.exit.takeProfitPct;
      const trailing = strategy.exit.trailingStopPct;
      let slHit = false,
        tpHit = false,
        trailHit = false;
      if (stopLoss != null) {
        const slPrice = position.entryPrice * (1 - stopLoss / 100);
        if (bar.low <= slPrice) slHit = true;
      }
      if (takeProfit != null) {
        const tpPrice = position.entryPrice * (1 + takeProfit / 100);
        if (bar.high >= tpPrice) tpHit = true;
      }
      if (trailing != null) {
        const trailPrice = position.peakPrice * (1 - trailing / 100);
        if (bar.low <= trailPrice) trailHit = true;
      }
      // Exit priority: stop_loss > trailing_stop > take_profit > signal
      const exitReason = slHit ? "stop_loss" : trailHit ? "trailing_stop" : tpHit ? "take_profit" : shouldExit ? "signal" : null;
      if (exitReason) {
        let exitPrice = price;
        if (slHit) exitPrice = position.entryPrice * (1 - (stopLoss as number) / 100);
        else if (trailHit) exitPrice = position.peakPrice * (1 - (trailing as number) / 100);
        else if (tpHit) exitPrice = position.entryPrice * (1 + (takeProfit as number) / 100);
        const pnl = (exitPrice - position.entryPrice) * position.qty;
        equity += pnl;
        trades.push({
          entryTime: ohlcv[position.entryIdx].timestamp,
          exitTime: bar.timestamp,
          entryPrice: position.entryPrice,
          exitPrice,
          qty: position.qty,
          pnl,
          pnlPct: ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
          exitReason,
          barsHeld: i - position.entryIdx,
        });
        position = null;
        continue;
      }
    }

    // entry
    if (!position) {
      const shouldEnter = evalLogic(strategy.entry.conditions, strategy.entry.logic, i, close, cache);
      if (shouldEnter) {
        const sizing = strategy.positionSizing;
        let qty: number;
        if (sizing.type === "percent_equity") {
          // value is % of equity to allocate as notional (e.g. 10 => 10% of equity)
          const notional = equity * (sizing.value / 100);
          qty = notional / price;
        } else if (sizing.type === "fixed") {
          // value is number of shares (not cash). Keeps sizing deterministic across prices.
          qty = sizing.value;
        } else {
          // kelly: simplified as 10% equity until full Kelly (W - (1-W)/R) is implemented
          qty = (equity * 0.1) / price;
        }
        if (qty > 0 && Number.isFinite(qty)) position = { entryIdx: i, entryPrice: price, qty, peakPrice: price };
      }
    }
  }

  // close open position at last close
  if (position) {
    const last = ohlcv[ohlcv.length - 1];
    const pnl = (last.close - position.entryPrice) * position.qty;
    equity += pnl;
    trades.push({
      entryTime: ohlcv[position.entryIdx].timestamp,
      exitTime: last.timestamp,
      entryPrice: position.entryPrice,
      exitPrice: last.close,
      qty: position.qty,
      pnl,
      pnlPct: ((last.close - position.entryPrice) / position.entryPrice) * 100,
      exitReason: "eod",
      barsHeld: ohlcv.length - 1 - position.entryIdx,
    });
  }

  const finalEquity = equity;
  const totalReturnPct = (finalEquity - initialCapital) / initialCapital * 100;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWin = wins.length ? wins.reduce((a, b) => a + b.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b.pnl, 0) / losses.length : 0;
  const grossProfit = wins.reduce((a, b) => a + b.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  // sharpe (daily returns)
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) returns.push((equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity);
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const std = returns.length ? Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length) : 0;
  const sharpe = std === 0 ? 0 : (mean / std) * Math.sqrt(252);

  const years = ohlcv.length / 252;
  const cagrPct = years > 0 ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100 : 0;

  return {
    strategyName: strategy.name,
    initialCapital,
    finalEquity,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: maxDD,
    sharpe,
    winRate,
    profitFactor,
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    avgWin,
    avgLoss,
    trades,
    equityCurve,
    bars: ohlcv.length,
  };
}

// Re-export mock helpers for backwards compat (prefer import from ./mock)
export { generateMockOHLCV, seededRandom } from "./mock";
