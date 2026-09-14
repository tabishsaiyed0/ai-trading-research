export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let emaPrev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      const slice = values.slice(0, period);
      emaPrev = slice.reduce((a, b) => a + b, 0) / period;
      out[i] = emaPrev;
    } else if (i >= period) {
      emaPrev = values[i] * k + (emaPrev as number) * (1 - k);
      out[i] = emaPrev;
    }
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (i <= period) {
      if (diff > 0) gains += diff; else losses -= diff;
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        // store for Wilder smoothing
        (out as unknown as { _avgGain: number; _avgLoss: number })._avgGain = avgGain;
        (out as unknown as { _avgLoss: number })._avgLoss = avgLoss;
      }
    } else {
      const prev = out as unknown as { _avgGain: number; _avgLoss: number };
      let avgGain = prev._avgGain;
      let avgLoss = prev._avgLoss;
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      prev._avgGain = avgGain;
      prev._avgLoss = avgLoss;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

export function computeSeries(
  close: number[],
  expr: string,
  cache: Record<string, (number | null)[]>
): (number | null)[] {
  const e = expr.trim();
  // numeric literal
  if (!isNaN(Number(e))) return Array(close.length).fill(Number(e));
  if (e === "close") return [...close];

  const smaMatch = e.match(/^SMA\((\d+)\)$/i);
  if (smaMatch) {
    const p = Number(smaMatch[1]);
    const key = `SMA(${p})`;
    if (!cache[key]) cache[key] = sma(close, p);
    return cache[key];
  }
  const emaMatch = e.match(/^EMA\((\d+)\)$/i);
  if (emaMatch) {
    const p = Number(emaMatch[1]);
    const key = `EMA(${p})`;
    if (!cache[key]) cache[key] = ema(close, p);
    return cache[key];
  }
  const rsiMatch = e.match(/^RSI\((\d+)\)$/i);
  if (rsiMatch) {
    const p = Number(rsiMatch[1]);
    const key = `RSI(${p})`;
    if (!cache[key]) cache[key] = rsi(close, p);
    return cache[key];
  }
  throw new Error(`Unknown indicator expr: ${expr}`);
}
