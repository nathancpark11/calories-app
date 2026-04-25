type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

declare global {
  var __calorieRateLimitBuckets: Map<string, Bucket> | undefined;
}

const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 10;

function getBuckets() {
  if (!globalThis.__calorieRateLimitBuckets) {
    globalThis.__calorieRateLimitBuckets = new Map<string, Bucket>();
  }

  return globalThis.__calorieRateLimitBuckets;
}

export function checkAIRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  const buckets = getBuckets();
  const key = `ai:${userId}`;
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + WINDOW_MS;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt };
  }

  if (existing.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  buckets.set(key, existing);

  return {
    allowed: true,
    remaining: Math.max(0, MAX_REQUESTS - existing.count),
    resetAt: existing.resetAt,
  };
}
