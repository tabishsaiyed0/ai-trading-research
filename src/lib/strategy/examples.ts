export const DEFAULT_PROMPT =
  "Buy SPY when SMA 20 crosses above SMA 50, sell when SMA 20 crosses below SMA 50 with 5% stop loss";

export const EXAMPLE_PROMPTS = [
  "Buy SPY when SMA 20 crosses above SMA 50, exit when SMA 20 crosses below SMA 50",
  "Buy AAPL when RSI 14 drops below 30, sell when RSI 14 goes above 70 with 5% stop loss",
  "Long SPY when EMA 12 crosses above EMA 26, exit on opposite cross with 8% take profit",
] as const;

export const EXAMPLE_PREVIEW_LENGTH = 42;
