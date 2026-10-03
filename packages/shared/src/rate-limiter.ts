export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimiter {
  check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private hits: Map<string, { count: number; resetAt: number }> = new Map();

  async check(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const record = this.hits.get(key);

    if (!record || now > record.resetAt) {
      const resetAt = now + windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: new Date(resetAt),
      };
    }

    if (record.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(record.resetAt),
      };
    }

    record.count += 1;
    return {
      allowed: true,
      remaining: limit - record.count,
      resetAt: new Date(record.resetAt),
    };
  }

  clear(): void {
    this.hits.clear();
  }
}
