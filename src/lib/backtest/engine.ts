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
    case ">": return l > r;
    case "<": return l < r;
    case ">=": return l >= r;
    case "<=": return l <= r;
    case "==": return Math.abs(l - r) < 1e-9;
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
    default: return false;
  }
}

function evalLogic(conditions: Condition[], logic: "AND" | "OR", idx: number, close: number[], cache: Record<string, (number|null)[]>) {
  const results = conditions.map(c => evalCondition(c, idx, close, cache));
  return logic === "AND" ? results.every(Boolean) : results.some(Boolean);
}

export function runBacktest(
  strategy: Strategy,
  ohlcv: OHLCV[],
  initialCapital = 10000
): BacktestResult {
  const close = ohlcv.map(b => b.close);
  const cache: Record<string, (number|null)[]> = {};

  for (const ind of strategy.indicators) {
    if (ind.type === "SMA") cache[`SMA(${ind.period})`] = computeSeries(close, `SMA(${ind.period})`, cache);
    if (ind.type === "EMA") cache[`EMA(${ind.period})`] = computeSeries(close, `EMA(${ind.period})`, cache);
    if (ind.type === "RSI") cache[`RSI(${ind.period})`] = computeSeries(close, `RSI(${ind.period})`, cache);
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
    const dd = (peak - curEquity) / peak * 100;
    if (dd > maxDD) maxDD = dd;

    if (position) {
      if (bar.high > position.peakPrice) position.peakPrice = bar.high;

      const shouldExit = evalLogic(strategy.exit.conditions, strategy.exit.logic, i, close, cache);
      const stopLoss = strategy.exit.stopLossPct;
      const takeProfit = strategy.exit.takeProfitPct;
      const trailing = strategy.exit.trailingStopPct;
      let slHit = false, tpHit = false, trailHit = false;
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
      const exitReason = slHit ? "stop_loss" : trailHit ? "trailing_stop" : tpHit ? "take_profit" : shouldExit ? "signal" : null;
      if (exitReason) {
        let exitPrice = price;
        if (slHit) exitPrice = position.entryPrice * (1 - (stopLoss as number)/100);
        else if (trailHit) exitPrice = position.peakPrice * (1 - (trailing as number)/100);
        else if (tpHit) exitPrice = position.entryPrice * (1 + (takeProfit as number)/100);
        const pnl = (exitPrice - position.entryPrice) * position.qty;
        equity += pnl;
        trades.push({
          entryTime: ohlcv[position.entryIdx].timestamp,
          exitTime: bar.timestamp,
          entryPrice: position.entryPrice,
          exitPrice,
          qty: position.qty,
          pnl,
          pnlPct: (exitPrice - position.entryPrice)/position.entryPrice*100,
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
          const notional = equity * (sizing.value / 100);
          qty = notional / price;
        } else if (sizing.type === "fixed") {
          qty = sizing.value / price;
        } else {
          qty = (equity * 0.1) / price; // kelly placeholder
        }
        if (qty > 0) position = { entryIdx: i, entryPrice: price, qty, peakPrice: price };
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
      pnlPct: (last.close - position.entryPrice)/position.entryPrice*100,
      exitReason: "eod",
      barsHeld: ohlcv.length - 1 - position.entryIdx,
    });
  }

  const finalEquity = equity;
  const totalReturnPct = (finalEquity - initialCapital) / initialCapital * 100;
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = trades.length ? wins.length / trades.length * 100 : 0;
  const avgWin = wins.length ? wins.reduce((a,b)=>a+b.pnl,0)/wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a,b)=>a+b.pnl,0)/losses.length : 0;
  const grossProfit = wins.reduce((a,b)=>a+b.pnl,0);
  const grossLoss = Math.abs(losses.reduce((a,b)=>a+b.pnl,0));
  const profitFactor = grossLoss === 0 ? (grossProfit>0? Infinity : 0) : grossProfit/grossLoss;

  // sharpe (daily returns)
  const returns: number[] = [];
  for (let i=1;i<equityCurve.length;i++) returns.push((equityCurve[i].equity - equityCurve[i-1].equity)/equityCurve[i-1].equity);
  const mean = returns.length ? returns.reduce((a,b)=>a+b,0)/returns.length : 0;
  const std = returns.length ? Math.sqrt(returns.reduce((a,b)=>a+(b-mean)**2,0)/returns.length) : 0;
  const sharpe = std===0 ? 0 : (mean/std)*Math.sqrt(252);

  const years = ohlcv.length / 252;
  const cagrPct = years>0 ? (Math.pow(finalEquity/initialCapital, 1/years)-1)*100 : 0;

  return {
    strategyName: strategy.name,
    initialCapital,
    finalEquity,
    totalReturnPct,
    cagrPct,
    maxDrawdownPct: maxDD,
    sharpe,
    winRate,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : 0,
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

//  Deterministic seeded RNG (mulberry32) for reproducible mocks
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed: string | number): () => number {
  let t = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Demo data generator (GBM) for quick testing without external API
// Deterministic when `seed` is provided, defaults to hash of startDate for stability.
export function generateMockOHLCV(days = 500, startPrice = 100, startDate = "2024-01-01", seed?: string | number): OHLCV[] {
  const effectiveSeed = seed ?? process.env.MOCK_SEED ?? `mock:${startDate}:${startPrice}:${days}`;
  const rand = seededRandom(effectiveSeed);
  const out: OHLCV[] = [];
  let p = startPrice;
  const d = new Date(startDate);
  for (let i=0;i<days;i++) {
    const drift = 0.0002;
    const vol = 0.015;
    const shock = (rand()*2-1)*vol;
    const change = drift + shock;
    const open = p;
    p = p * (1+change);
    const high = Math.max(open,p)*(1+rand()*0.005);
    const low = Math.min(open,p)*(1-rand()*0.005);
    const close = p;
    out.push({ timestamp: new Date(d).toISOString().slice(0,10), open, high, low, close, volume: 1_000_000 + rand()*500_000 });
    d.setDate(d.getDate()+1);
    // skip weekends
    if (d.getDay()===6) d.setDate(d.getDate()+2);
    if (d.getDay()===0) d.setDate(d.getDate()+1);
  }
  return out;
}
