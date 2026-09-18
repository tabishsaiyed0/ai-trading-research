import { z } from "zod";

export const indicatorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SMA"), period: z.number().int().min(2).max(500) }),
  z.object({ type: z.literal("EMA"), period: z.number().int().min(2).max(500) }),
  z.object({ type: z.literal("RSI"), period: z.number().int().min(2).max(100) }),
  z
    .object({
      type: z.literal("MACD"),
      fast: z.number().int().min(2).max(100),
      slow: z.number().int().min(2).max(500),
      signal: z.number().int().min(2).max(100),
    })
    .refine((v) => v.slow > v.fast, { message: "MACD slow must be > fast", path: ["slow"] }),
  z.object({
    type: z.literal("BBANDS"),
    period: z.number().int().min(2).max(500),
    stdDev: z.number().min(0.5).max(4),
  }),
]);

export const conditionSchema = z.object({
  left: z.string().describe("e.g. close, SMA(20), RSI(14)"),
  operator: z.enum([">", "<", ">=", "<=", "==", "crosses_above", "crosses_below"]),
  right: z.string().describe("e.g. close, SMA(50), 70, 30"),
});

export const strategySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  universe: z.object({
    symbols: z.array(z.string()).min(1).describe("e.g. ['AAPL','SPY']"),
    timeframe: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).default("1d"),
  }),
  indicators: z.array(indicatorSchema).default([]),
  entry: z.object({
    logic: z.enum(["AND", "OR"]),
    conditions: z.array(conditionSchema).min(1),
  }),
  exit: z.object({
    logic: z.enum(["AND", "OR"]),
    conditions: z.array(conditionSchema).min(1),
    stopLossPct: z.number().min(0).max(100).optional(),
    takeProfitPct: z.number().min(0).max(100).optional(),
    trailingStopPct: z.number().min(0).max(100).optional(),
  }),
  positionSizing: z.object({
    type: z.enum(["percent_equity", "fixed", "kelly"]),
    value: z.number().positive(),
  }).default({ type: "percent_equity", value: 10 }),
  startDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: "startDate must be a valid date" })
    .optional(),
  endDate: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: "endDate must be a valid date" })
    .optional(),
});

export type Strategy = z.infer<typeof strategySchema>;
export type Indicator = z.infer<typeof indicatorSchema>;
export type Condition = z.infer<typeof conditionSchema>;
