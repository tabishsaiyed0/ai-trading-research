# AI Trading Research

Natural language → trading strategy → backtest. Next.js + AWS + Redis.

## What it does
Type a prompt like _"Buy SPY when SMA 20 crosses above SMA 50"_ — it compiles to a strategy JSON and backtests it (Sharpe, drawdown, equity curve, trades).

## Stack
Next.js 16, Tailwind, ioredis, AWS SDK (S3 + Bedrock), Zod

## Run
```bash
docker compose up -d   # redis :6379 (optional — works without it)
npm run dev            # http://localhost:3000
```

Copy `.env.example` to `.env.local` to add AWS keys. Without them, it uses a heuristic parser + mock OHLCV — fully offline.

## APIs
`POST /api/parse-strategy` `{prompt}` → `{strategy}`
`POST /api/backtest` `{strategy}` → `BacktestResult`

## Env
`REDIS_URL`, `AWS_REGION`, `AWS_S3_BUCKET`, `BEDROCK_MODEL_ID`
