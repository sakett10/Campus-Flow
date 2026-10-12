import { describe, it, expect, beforeEach } from 'vitest';
import {
  AiUsageController,
  InMemoryUsageRecorder,
} from '../../packages/shared/src/ai/ai-usage-control.js';
import { AppError } from '../../packages/shared/src/errors.js';

describe('AI Usage Control & Quota Unit Suite', () => {
  let controller: AiUsageController;
  let recorder: InMemoryUsageRecorder;
  const testUserId = '11111111-1111-4111-a111-111111111111';

  beforeEach(() => {
    recorder = new InMemoryUsageRecorder();
    controller = new AiUsageController(recorder);
  });

  it('1. Rejects unauthenticated requests with 401', async () => {
    await expect(controller.checkQuota('', 100, 'test_task')).rejects.toThrow(
      'Authenticated user context required',
    );
  });

  it('2. Enforces maximum document input size per tier', async () => {
    controller.setUserTier(testUserId, 'free');
    // Free tier maxInputChars is 60,000
    await expect(controller.checkQuota(testUserId, 65_000, 'test_task')).rejects.toThrow(
      'exceeds the maximum allowed limit of 60000 chars for tier "free"',
    );

    // Should succeed within limits
    await expect(controller.checkQuota(testUserId, 20_000, 'test_task')).resolves.not.toThrow();
  });

  it('3. Enforces sliding-window requests-per-minute limit and provides Retry-After', async () => {
    controller.setUserTier(testUserId, 'free'); // 20 req/min

    // Fill the window
    for (let i = 0; i < 20; i++) {
      await controller.recordExecution({
        userId: testUserId,
        taskType: 'test',
        taskVersion: 'v1',
        model: 'model-a',
        provider: 'stub',
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 50,
        status: 'success',
        cached: false,
      });
    }

    // 21st request should be rejected with 429 and retryAfter
    try {
      await controller.checkQuota(testUserId, 500, 'test_task');
      expect.fail('Should have been rate limited');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError & { retryAfterSeconds?: number };
      expect(appErr.status).toBe(429);
      expect(appErr.code).toBe('RATE_LIMITED');
      expect(appErr.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('4. Enforces in-flight concurrency limiter and releases correctly', async () => {
    controller.setUserTier(testUserId, 'free'); // maxConcurrency: 2

    const release1 = await controller.acquireConcurrency(testUserId);
    const release2 = await controller.acquireConcurrency(testUserId);

    // 3rd concurrent request should fail
    try {
      await controller.checkQuota(testUserId, 100, 'test_task');
      expect.fail('Should fail on concurrency');
    } catch (err: unknown) {
      const appErr = err as AppError;
      expect(appErr.status).toBe(429);
      expect(appErr.message).toContain('Concurrency limit reached');
    }

    // Release one slot
    release1();

    // Now checkQuota should pass
    await expect(controller.checkQuota(testUserId, 100, 'test_task')).resolves.not.toThrow();

    release2();
  });

  it('5. Enforces daily token budgets', async () => {
    controller.setUserTier(testUserId, 'free'); // 250,000 tokens/day

    // Record high token consumption
    await controller.recordExecution({
      userId: testUserId,
      taskType: 'heavy_task',
      taskVersion: 'v1',
      model: 'model-a',
      provider: 'stub',
      inputTokens: 150_000,
      outputTokens: 110_000, // Total: 260,000 tokens
      durationMs: 1000,
      status: 'success',
      cached: false,
    });

    await expect(controller.checkQuota(testUserId, 100, 'test_task')).rejects.toThrow(
      'Daily token budget exceeded',
    );
  });

  it('6. Allows higher capacity for Pro tier', async () => {
    controller.setUserTier(testUserId, 'pro'); // maxInputChars 200,000
    await expect(controller.checkQuota(testUserId, 120_000, 'test_task')).resolves.not.toThrow();
  });

  it('7. Records durable execution metadata accurately', async () => {
    await controller.recordExecution({
      userId: testUserId,
      taskType: 'question_extraction',
      taskVersion: 'v1.0.0',
      model: 'gemini-1.5-flash',
      provider: 'gemini',
      inputTokens: 500,
      outputTokens: 250,
      estimatedCostMicroCents: 125,
      durationMs: 820,
      status: 'success',
      contentHash: 'hash123',
      cached: false,
    });

    const records = await recorder.listRecords(testUserId);
    expect(records.length).toBe(1);
    expect(records[0]?.taskType).toBe('question_extraction');
    expect(records[0]?.estimatedCostMicroCents).toBe(125);
  });
});
