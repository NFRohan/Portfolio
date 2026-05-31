import type { NextRequest } from "next/server";
import { Redis } from "ioredis";
import { NextResponse } from "next/server";

type RateLimitOptions = {
  bucket: string;
  limit: number;
  windowMs: number;
};

let redisConnection: Redis | null = null;

export async function rateLimit(request: NextRequest, options: RateLimitOptions): Promise<NextResponse | null> {
  if (isDisabled()) return null;

  const identity = clientIdentity(request);
  const key = `rate-limit:${options.bucket}:${identity}`;
  const redis = getRateLimitRedis();
  let count: number;
  let ttlMs: number;
  try {
    count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, options.windowMs);
    }
    ttlMs = await redis.pttl(key);
  } catch {
    if (process.env.RATE_LIMIT_FAIL_OPEN?.toLowerCase() === "true") return null;
    return NextResponse.json(
      { error: "Rate limiter unavailable. Please retry shortly." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : options.windowMs) / 1000));
  const remaining = Math.max(0, options.limit - count);

  if (count <= options.limit) return null;

  return NextResponse.json(
    {
      error: "Too many requests. Please retry shortly.",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(options.limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil((Date.now() + retryAfterSeconds * 1000) / 1000)),
      },
    },
  );
}

function clientIdentity(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-vercel-forwarded-for") ||
    "local"
  );
}

function isDisabled(): boolean {
  return process.env.API_RATE_LIMIT_ENABLED?.toLowerCase() === "false";
}

function getRateLimitRedis(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
    });
  }
  return redisConnection;
}
