import { AppError } from '../errors.js';
import type { AiTaskExecutionRecord, AiUsageQuotaStatus } from '@campusflow/types';

export interface UsageTierPolicy {
  tierName: 'free' | 'pro';
  requestsPerMinute: number;
  dailyRequests: number;
  dailyTokens: number;
  monthlyTokens: number;
  maxConcurrency: number;
  maxInputChars: number;
}

export const DEFAULT_USAGE_POLICIES: Record<'free' | 'pro', UsageTierPolicy> = {
  free: {
    tierName: 'free',
    requestsPerMinute: 20,
    dailyRequests: 150,
    dailyTokens: 250_000,
    monthlyTokens: 5_000_000,
    maxConcurrency: 2,
    maxInputChars: 60_000,
  },
  pro: {
    tierName: 'pro',
    requestsPerMinute: 60,
    dailyRequests: 1000,
    dailyTokens: 2_000_000,
    monthlyTokens: 50_000_000,
    maxConcurrency: 5,
    maxInputChars: 200_000,
  },
};

export interface UsageRecorder {
  record(entry: Omit<AiTaskExecutionRecord, 'id' | 'createdAt'>): Promise<void>;
  listRecords?(userId: string, limit?: number): Promise<AiTaskExecutionRecord[]>;
}

export class InMemoryUsageRecorder implements UsageRecorder {
  private records: AiTaskExecutionRecord[] = [];

  async record(entry: Omit<AiTaskExecutionRecord, 'id' | 'createdAt'>): Promise<void> {
    this.records.push({
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    });
  }

  async listRecords(userId: string, limit = 50): Promise<AiTaskExecutionRecord[]> {
    return this.records
      .filter((r) => r.userId === userId)
      .slice(-limit)
      .reverse();
  }

  clear(): void {
    this.records = [];
  }
}

/**
 * Centralized, multi-window AI usage and rate-limiting controller.
 * Enforces authenticated per-user rate limits, daily/monthly budgets,
 * in-flight concurrency, and max input sizes.
 */
export class AiUsageController {
  private policyMap: Map<string, UsageTierPolicy> = new Map();
  private userTiers: Map<string, 'free' | 'pro'> = new Map();
  private windowHits: Map<string, Array<{ timestamp: number; tokens: number }>> = new Map();
  private inFlightConcurrency: Map<string, number> = new Map();
  private recorder: UsageRecorder;

  constructor(recorder?: UsageRecorder) {
    this.recorder = recorder || new InMemoryUsageRecorder();
    this.policyMap.set('free', DEFAULT_USAGE_POLICIES.free);
    this.policyMap.set('pro', DEFAULT_USAGE_POLICIES.pro);
  }

  setUserTier(userId: string, tier: 'free' | 'pro'): void {
    this.userTiers.set(userId, tier);
  }

  getPolicy(userId: string): UsageTierPolicy {
    const tier = this.userTiers.get(userId) || 'free';
    return this.policyMap.get(tier) || DEFAULT_USAGE_POLICIES.free;
  }

  /**
   * Pre-execution validation check against size, rate, and budget limits.
   */
  async checkQuota(userId: string, inputChars: number, _taskType: string): Promise<void> {
    if (!userId || typeof userId !== 'string') {
      throw AppError.unauthorized('Authenticated user context required for AI execution.');
    }

    const policy = this.getPolicy(userId);

    // 1. Validate input size limit
    if (inputChars > policy.maxInputChars) {
      throw AppError.badRequest(
        `Input size (${inputChars} chars) exceeds the maximum allowed limit of ${policy.maxInputChars} chars for tier "${policy.tierName}". Please reduce document length or process in sections.`,
      );
    }

    // 2. Validate in-flight concurrency
    const currentConcurrency = this.inFlightConcurrency.get(userId) || 0;
    if (currentConcurrency >= policy.maxConcurrency) {
      const err = AppError.rateLimited(
        `Concurrency limit reached (${currentConcurrency}/${policy.maxConcurrency} active requests). Please wait for prior AI tasks to finish.`,
      );
      (err as unknown as { retryAfterSeconds: number }).retryAfterSeconds = 2;
      throw err;
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const oneDayAgo = now - 24 * 60 * 60_000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60_000;

    let hits = this.windowHits.get(userId) || [];
    // Prune entries older than 30 days
    hits = hits.filter((h) => h.timestamp > oneMonthAgo);
    this.windowHits.set(userId, hits);

    // 3. Sliding window requests per minute
    const hitsLastMinute = hits.filter((h) => h.timestamp > oneMinuteAgo);
    if (hitsLastMinute.length >= policy.requestsPerMinute) {
      const oldestInWindow = Math.min(...hitsLastMinute.map((h) => h.timestamp));
      const retryAfter = Math.max(1, Math.ceil((oldestInWindow + 60_000 - now) / 1000));
      const err = AppError.rateLimited(
        `Rate limit exceeded: maximum ${policy.requestsPerMinute} AI requests per minute allowed. Try again in ${retryAfter}s.`,
      );
      (err as unknown as { retryAfterSeconds: number }).retryAfterSeconds = retryAfter;
      throw err;
    }

    // 4. Daily request and token limits
    const hitsToday = hits.filter((h) => h.timestamp > oneDayAgo);
    if (hitsToday.length >= policy.dailyRequests) {
      const err = AppError.rateLimited(
        `Daily request quota reached (${policy.dailyRequests} requests/day). Resets in 24 hours.`,
      );
      (err as unknown as { retryAfterSeconds: number }).retryAfterSeconds = 3600;
      throw err;
    }

    const tokensToday = hitsToday.reduce((sum, h) => sum + h.tokens, 0);
    if (tokensToday >= policy.dailyTokens) {
      const err = AppError.rateLimited(
        `Daily token budget exceeded (${tokensToday.toLocaleString()} / ${policy.dailyTokens.toLocaleString()} tokens). Resets tomorrow.`,
      );
      (err as unknown as { retryAfterSeconds: number }).retryAfterSeconds = 3600;
      throw err;
    }

    // 5. Monthly token limits
    const tokensMonth = hits.reduce((sum, h) => sum + h.tokens, 0);
    if (tokensMonth >= policy.monthlyTokens) {
      const err = AppError.rateLimited(
        `Monthly AI usage budget exceeded (${tokensMonth.toLocaleString()} / ${policy.monthlyTokens.toLocaleString()} tokens).`,
      );
      (err as unknown as { retryAfterSeconds: number }).retryAfterSeconds = 86400;
      throw err;
    }
  }

  /**
   * Acquires a concurrency token and returns a release callback.
   */
  async acquireConcurrency(userId: string): Promise<() => void> {
    const cur = this.inFlightConcurrency.get(userId) || 0;
    this.inFlightConcurrency.set(userId, cur + 1);

    let released = false;
    return () => {
      if (!released) {
        released = true;
        const updated = (this.inFlightConcurrency.get(userId) || 1) - 1;
        if (updated <= 0) {
          this.inFlightConcurrency.delete(userId);
        } else {
          this.inFlightConcurrency.set(userId, updated);
        }
      }
    };
  }

  /**
   * Records usage tokens and execution details into memory and durable store.
   */
  async recordExecution(entry: Omit<AiTaskExecutionRecord, 'id' | 'createdAt'>): Promise<void> {
    const now = Date.now();
    const totalTokens = (entry.inputTokens || 0) + (entry.outputTokens || 0);

    const userHits = this.windowHits.get(entry.userId) || [];
    userHits.push({ timestamp: now, tokens: totalTokens });
    this.windowHits.set(entry.userId, userHits);

    await this.recorder.record(entry);
  }

  /**
   * Retrieves user quota summary for observability and transparency.
   */
  getQuotaStatus(userId: string): AiUsageQuotaStatus {
    const policy = this.getPolicy(userId);
    const now = Date.now();
    const hits = this.windowHits.get(userId) || [];

    const oneMinuteAgo = now - 60_000;
    const oneDayAgo = now - 24 * 60 * 60_000;

    const hitsLastMinute = hits.filter((h) => h.timestamp > oneMinuteAgo);
    const tokensToday = hits
      .filter((h) => h.timestamp > oneDayAgo)
      .reduce((s, h) => s + h.tokens, 0);
    const tokensMonth = hits.reduce((s, h) => s + h.tokens, 0);
    const concurrency = this.inFlightConcurrency.get(userId) || 0;

    return {
      userId,
      tier: policy.tierName,
      requestsInWindow: hitsLastMinute.length,
      windowLimit: policy.requestsPerMinute,
      windowResetAt: new Date(now + 60_000),
      dailyTokensUsed: tokensToday,
      dailyTokenLimit: policy.dailyTokens,
      monthlyTokensUsed: tokensMonth,
      monthlyTokenLimit: policy.monthlyTokens,
      currentConcurrency: concurrency,
      concurrencyLimit: policy.maxConcurrency,
      isThrottled:
        hitsLastMinute.length >= policy.requestsPerMinute ||
        tokensToday >= policy.dailyTokens ||
        tokensMonth >= policy.monthlyTokens,
    };
  }

  clear(): void {
    this.windowHits.clear();
    this.inFlightConcurrency.clear();
    if (this.recorder instanceof InMemoryUsageRecorder) {
      this.recorder.clear();
    }
  }
}

export const defaultAiUsageController = new AiUsageController();
