import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, isS3Configured } from "@/lib/aws/s3";
import type { OHLCV } from "@/lib/backtest/types";
import type { FetchParams } from "./types";
import { normalizeSymbol, isoDateOnly, resolveDateWindow } from "./utils";

function s3KeyFor(params: FetchParams): string {
  const symbol = normalizeSymbol(params.symbol);
  const tf = params.timeframe;
  const { start, end } = resolveDateWindow(tf, params.startDate, params.endDate);
  const prefix = process.env.MARKET_DATA_S3_PREFIX || process.env.AWS_S3_MARKET_PREFIX || "ohlcv";
  // key: ohlcv/SPY/1d/2023-01-01_2024-01-01.json
  return `${prefix.replace(/\/$/, "")}/${symbol}/${tf}/${isoDateOnly(start)}_${isoDateOnly(end)}.json`;
}

function legacyKeyFor(symbol: string, timeframe: string): string {
  const prefix = process.env.MARKET_DATA_S3_PREFIX || "ohlcv";
  return `${prefix.replace(/\/$/, "")}/${normalizeSymbol(symbol)}/${timeframe}.json`;
}

export async function fetchS3OHLCV(params: FetchParams): Promise<OHLCV[] | null> {
  // S3 is optional — skip silently without credentials
  if (!isS3Configured()) return null;
  const bucket = process.env.AWS_S3_BUCKET!;

  const client = getS3Client();
  const keysToTry = [s3KeyFor(params), legacyKeyFor(params.symbol, params.timeframe)];

  for (const key of keysToTry) {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await res.Body?.transformToString();
      if (!body) continue;
      const parsed = JSON.parse(body) as OHLCV[] | { ohlcv: OHLCV[] } | { bars: OHLCV[] };
      const arr = Array.isArray(parsed) ? parsed : (parsed as { ohlcv?: OHLCV[]; bars?: OHLCV[] }).ohlcv ?? (parsed as { bars?: OHLCV[] }).bars ?? null;
      if (!arr || !Array.isArray(arr) || arr.length === 0) continue;

      // optional date filtering if key was legacy aggregated file
      const { start, end } = resolveDateWindow(params.timeframe, params.startDate, params.endDate);
      const filtered = arr.filter((b) => {
        const t = new Date(b.timestamp).getTime();
        return t >= start.getTime() && t <= end.getTime();
      });
      return filtered.length ? filtered : arr;
    } catch (e: unknown) {
      // All S3 misses are silent , fall through to Yahoo
      const name = (e as { name?: string })?.name ?? "";
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("NoSuchKey") || name === "NoSuchKey") continue;
      return null;
    }
  }
  return null;
}

export async function putS3OHLCV(params: FetchParams, ohlcv: OHLCV[]): Promise<string | null> {
  if (!isS3Configured()) return null;
  if (!ohlcv.length) return null;

  const bucket = process.env.AWS_S3_BUCKET!;
  const key = s3KeyFor(params);
  const client = getS3Client();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(ohlcv, null, 2),
        ContentType: "application/json",
      })
    );
    return `s3://${bucket}/${key}`;
  } catch {
    return null;
  }
}
