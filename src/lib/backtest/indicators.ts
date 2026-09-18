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
  if (values.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function normalizeKey(expr: string): string {
  return expr.trim().toUpperCase();
}

export function computeSeries(
  close: number[],
  expr: string,
  cache: Record<string, (number | null)[]>
): (number | null)[] {
  const e = expr.trim();
  // numeric literal
  if (e !== "" && !isNaN(Number(e))) return Array(close.length).fill(Number(e));
  if (e.toLowerCase() === "close") return [...close];

  const key = normalizeKey(e);
  if (cache[key]) return cache[key];

  const smaMatch = e.match(/^SMA\((\d+)\)$/i);
  if (smaMatch) {
    const p = Number(smaMatch[1]);
    const arr = sma(close, p);
    cache[key] = arr;
    return arr;
  }
  const emaMatch = e.match(/^EMA\((\d+)\)$/i);
  if (emaMatch) {
    const p = Number(emaMatch[1]);
    const arr = ema(close, p);
    cache[key] = arr;
    return arr;
  }
  const rsiMatch = e.match(/^RSI\((\d+)\)$/i);
  if (rsiMatch) {
    const p = Number(rsiMatch[1]);
    const arr = rsi(close, p);
    cache[key] = arr;
    return arr;
  }
  throw new Error(`Unknown indicator expr: ${expr}. Supported: close, SMA(n), EMA(n), RSI(n) or numeric literal`);
}
