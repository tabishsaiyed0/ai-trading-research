import { strategySchema, Strategy } from "./schema";
import { bedrockConverse } from "../aws/bedrock";
import tickerData from "../../../data/tickers.json";

const SYSTEM = `You are a trading strategy compiler.
Convert natural language trading ideas into JSON matching this Zod schema:
{
  name: string,
  description: string,
  universe: { symbols: string[], timeframe: "1m"|"5m"|"15m"|"1h"|"4h"|"1d" },
  indicators: Array<{type:"SMA"|"EMA"|"RSI"|"MACD"|"BBANDS", period?:number, fast?:number, slow?:number, signal?:number, stdDev?:number }>,
  entry: { logic:"AND"|"OR", conditions: Array<{left:string, operator: ">"|"<"|">="|"<="|"=="|"crosses_above"|"crosses_below", right:string}> },
  exit: { logic:"AND"|"OR", conditions: Array<{left:string, operator:string, right:string}>, stopLossPct?:number, takeProfitPct?:number },
  positionSizing: { type:"percent_equity"|"fixed"|"kelly", value:number }
}
Rules:
- Use close, SMA(period), EMA(period), RSI(period) as left/right operands. Example: "SMA(20) crosses_above SMA(50)"
- If user says "buy when RSI below 30", use left:"RSI(14)" operator:"<" right:"30"
- Always return ONLY valid JSON, no markdown.
- Default timeframe 1d, default symbols ["SPY"] if not specified.
- Infer stopLoss/takeProfit if mentioned.
`;


const KNOWN_TICKERS = new Set<string>(tickerData.tickers);
const STOPWORDS = new Set<string>(tickerData.stopwords);

function extractSymbols(input: string): string[] {
  const raw = [...input.matchAll(/\b[A-Z]{1,5}\b/g)].map(m => m[0]);
  // keep only tokens that are plausibly tickers
  const hasTickerCue = /(?:buy|sell|long|short|trade)\s+[A-Z]{1,5}/i.test(input) || /(?:symbol|ticker)\s*[:=]/i.test(input);
  const filtered = raw.filter(s => {
    if (STOPWORDS.has(s)) return false;
    if (KNOWN_TICKERS.has(s)) return true;
    return hasTickerCue && s.length >= 2 && s.length <= 4;
  });
  const uniq = [...new Set(filtered)].slice(0, 3);
  return uniq.length ? uniq : ["SPY"];
}

function parseTimeframe(input: string): "1m"|"5m"|"15m"|"1h"|"4h"|"1d" {
  const lower = input.toLowerCase();
  if (/\b1m\b|\b1\s*min/.test(lower)) return "1m";
  if (/\b5m\b|\b5\s*min/.test(lower)) return "5m";
  if (/\b15m\b|\b15\s*min/.test(lower)) return "15m";
  if (/\b1h\b|\b1\s*hour|\bhourly\b/.test(lower)) return "1h";
  if (/\b4h\b|\b4\s*hour/.test(lower)) return "4h";
  if (/\b1d\b|\bdaily\b|\bday\b/.test(lower)) return "1d";
  return "1d";
}

function parseRisk(input: string): { stopLossPct?: number; takeProfitPct?: number; trailingStopPct?: number } {
  const lower = input.toLowerCase();
  function pctNear(keyword: RegExp): number | undefined {
    const kwMatch = lower.match(keyword);
    if (!kwMatch || !kwMatch.index) return undefined;
    let best: number|undefined, bestDist=Infinity;
    for (const m of [...lower.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]) {
      const dist = Math.abs((m.index ?? 0) - (kwMatch.index ?? 0));
      if (dist < bestDist) { bestDist = dist; best = Number(m[1]); }
    }
    return bestDist < 40 ? best : undefined;
  }
  const sl = pctNear(/stop\s*loss|stop-loss|\bsl\b/);
  const tp = pctNear(/take\s*profit|take-profit|\btp\b|target|profit\s*target/);
  const trail = pctNear(/trailing/);
  return {
    stopLossPct: sl,
    takeProfitPct: tp,
    trailingStopPct: trail,
  };
}
function heuristicParse(input: string): Strategy {
  const lower = input.toLowerCase();
  const universeSymbols = extractSymbols(input);
  const timeframe = parseTimeframe(input);
  const risk = parseRisk(input);
  const slDefault = risk.stopLossPct;
  const tpDefault = risk.takeProfitPct;

  if (lower.includes("sma") || lower.includes("moving average")) {
    const nums = [...input.matchAll(/\d+/g)].map(m=>Number(m[0]));
    const fast = nums[0] || 20;
    const slow = nums[1] || 50;
    return strategySchema.parse({
      name: `SMA ${fast}/${slow} Crossover`,
      description: input,
      universe: { symbols: universeSymbols, timeframe },
      indicators: [{ type: "SMA", period: fast }, { type: "SMA", period: slow }],
      entry: { logic: "AND", conditions: [{ left: `SMA(${fast})`, operator: "crosses_above", right: `SMA(${slow})` }] },
      exit: { logic: "AND", conditions: [{ left: `SMA(${fast})`, operator: "crosses_below", right: `SMA(${slow})` }], stopLossPct: slDefault ?? 5, takeProfitPct: tpDefault, trailingStopPct: risk.trailingStopPct },
      positionSizing: { type: "percent_equity", value: 10 },
    });
  }

  if (lower.includes("rsi")) {
    const nums = [...input.matchAll(/\d+/g)].map(m=>Number(m[0]));
    const period = nums[0] && nums[0] <= 50 ? nums[0] : 14;
    const belowMatch = lower.match(/below\s*(\d+)/);
    const aboveMatch = lower.match(/above\s*(\d+)/);
    const oversold = belowMatch ? Number(belowMatch[1]) : 30;
    const overbought = aboveMatch ? Number(aboveMatch[1]) : 70;
    return strategySchema.parse({
      name: `RSI ${period} Mean Reversion`,
      description: input,
      universe: { symbols: universeSymbols, timeframe },
      indicators: [{ type: "RSI", period }],
      entry: { logic: "AND", conditions: [{ left: `RSI(${period})`, operator: "<", right: `${oversold}` }] },
      exit: { logic: "AND", conditions: [{ left: `RSI(${period})`, operator: ">", right: `${overbought}` }], stopLossPct: risk.stopLossPct, takeProfitPct: risk.takeProfitPct, trailingStopPct: risk.trailingStopPct },
      positionSizing: { type: "percent_equity", value: 10 },
    });
  }

  return strategySchema.parse({
    name: "AI Generated Strategy",
    description: input,
    universe: { symbols: universeSymbols, timeframe },
    indicators: [{ type: "SMA", period: 20 }, { type: "SMA", period: 50 }],
    entry: { logic: "AND", conditions: [{ left: "close", operator: ">", right: "SMA(20)" }] },
    exit: { logic: "AND", conditions: [{ left: "close", operator: "<", right: "SMA(20)" }], stopLossPct: risk.stopLossPct, takeProfitPct: risk.takeProfitPct, trailingStopPct: risk.trailingStopPct },
    positionSizing: { type: "percent_equity", value: 10 },
  });
}

export { extractSymbols, parseTimeframe, parseRisk };

export async function parseNaturalLanguageToStrategy(input: string): Promise<Strategy> {
  const hasAws = !!process.env.AWS_ACCESS_KEY_ID || !!process.env.AWS_PROFILE || process.env.NODE_ENV === "production";
  if (hasAws) {
    try {
      const prompt = `Convert this to JSON:\n"${input}"\n\nReturn ONLY JSON.`;
      const text = await bedrockConverse(prompt, SYSTEM);
      const cleaned = text.replace(/```json|```/g, "").trim();
      const json = JSON.parse(cleaned);
      return strategySchema.parse(json);
    } catch (e) {
      console.warn("[parser] bedrock failed, falling back to heuristic", e);
    }
  }
  return heuristicParse(input);
}
