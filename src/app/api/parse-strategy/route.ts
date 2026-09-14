import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { parseNaturalLanguageToStrategy } from "@/lib/strategy/parser";
import { cacheGet, cacheSet } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const rl = await checkRateLimit(req, "parse");
    if (!rl.ok) {
      return NextResponse.json({ error: "rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } });
    }
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    const hash = createHash("sha256").update(prompt.trim().toLowerCase()).digest("hex").slice(0, 32);
    const cacheKey = `strategy:nl:${hash}`;
    try {
      const cached = await cacheGet(cacheKey);
      if (cached) return NextResponse.json({ strategy: cached, cached: true });
    } catch {}

    const strategy = await parseNaturalLanguageToStrategy(prompt);

    try { await cacheSet(cacheKey, strategy, 3600); } catch {}

    return NextResponse.json({ strategy, cached: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "parse failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
