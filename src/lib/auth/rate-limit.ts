import 'server-only';

import { AuthRateLimit } from '@/lib/db/models';
import { dbConnect } from '@/lib/db/connection';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
};

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  if (!key || limit <= 0 || windowSeconds <= 0) {
    return { allowed: true, remaining: limit, resetAt: new Date() };
  }

  await dbConnect();

  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  const existing = await AuthRateLimit.findOne({ key });

  if (!existing || existing.resetAt <= now) {
    await AuthRateLimit.findOneAndUpdate(
      { key },
      { key, count: 1, resetAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetAt,
    };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000)
    );

    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds,
    };
  }

  existing.count += 1;
  await existing.save();

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}
