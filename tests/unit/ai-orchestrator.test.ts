import { describe, it, expect, beforeEach } from 'vitest';
import { AiOrchestrator, type AiTaskDefinition, z } from '../../packages/shared/src/index.js';
import { AiUsageController } from '../../packages/shared/src/ai/ai-usage-control.js';
import type { AiProvider } from '../../packages/shared/src/ai-provider.js';

describe('AI Orchestrator Unit Suite', () => {
  let orchestrator: AiOrchestrator;
  let usageController: AiUsageController;
  const testUserId = '11111111-1111-4111-a111-111111111111';

  beforeEach(() => {
    usageController = new AiUsageController();
    orchestrator = new AiOrchestrator({ usageController });
  });

  const sampleOutputSchema = z.object({
    topic: z.string(),
    summary: z.string(),
    keyPoints: z.array(z.string()),
  });

  const sampleTask: AiTaskDefinition<{ text: string }, z.infer<typeof sampleOutputSchema>> = {
    taskType: 'academic_document_analysis',
    version: '1.0.0',
    systemPrompt: 'Extract structured academic summary.',
    buildPrompt: (input) => `Analyze document: ${input.text}`,
    outputSchema: sampleOutputSchema,
    deterministicFallback: (input) => ({
      topic: 'Deterministic Concept',
      summary: `Fallback summary of length ${input.text.length}`,
      keyPoints: ['Point 1', 'Point 2'],
    }),
  };

  it('1. Rejects malformed model output and executes bounded retries', async () => {
    let callCount = 0;
    const mockProvider: AiProvider = {
      extract: async () => {
        callCount++;
        // Returns invalid object missing required keyPoints array
        return { topic: 'Distributed Systems', summary: 'Missing keyPoints' };
      },
      reason: async () => ({ reasoningSteps: [], conclusion: '', confidence: 'high' }),
      generate: async () => ({ content: '', citations: [] }),
      classify: async () => ({ category: '', confidence: 1 }),
    };

    orchestrator.setProvider(mockProvider, 'mock', 'mock-v1');

    // Should retry 2 times (3 calls total) and then fall back to safe deterministic output
    const result = await orchestrator.runTask(
      sampleTask,
      { text: 'Some text' },
      { userId: testUserId },
    );

    expect(callCount).toBe(3); // 1 initial + 2 retries
    expect(result.isFallback).toBe(true);
    expect(result.fallbackReason).toContain('Model execution failed');
    expect(result.data.topic).toBe('Deterministic Concept');
  });

  it('2. Enforces strict schema validation when valid data is returned', async () => {
    const validData = {
      topic: 'Consensus Protocols',
      summary: 'Paxos and Raft consensus mechanics.',
      keyPoints: ['Leader election', 'Log replication', 'Safety invariant'],
    };

    const mockProvider: AiProvider = {
      extract: async () => validData,
      reason: async () => ({ reasoningSteps: [], conclusion: '', confidence: 'high' }),
      generate: async () => ({ content: '', citations: [] }),
      classify: async () => ({ category: '', confidence: 1 }),
    };

    orchestrator.setProvider(mockProvider, 'mock', 'mock-v1');

    const result = await orchestrator.runTask(
      sampleTask,
      { text: 'Valid doc' },
      { userId: testUserId },
    );

    expect(result.isFallback).toBe(false);
    expect(result.data.topic).toBe('Consensus Protocols');
    expect(result.data.keyPoints.length).toBe(3);
    expect(result.metadata.model).toBe('mock-v1');
  });

  it('3. Serves identical requests from content-hash cache without calling provider twice', async () => {
    let providerCalls = 0;
    const mockProvider: AiProvider = {
      extract: async () => {
        providerCalls++;
        return {
          topic: 'Cached Topic',
          summary: 'Cached summary.',
          keyPoints: ['Cached Point'],
        };
      },
      reason: async () => ({ reasoningSteps: [], conclusion: '', confidence: 'high' }),
      generate: async () => ({ content: '', citations: [] }),
      classify: async () => ({ category: '', confidence: 1 }),
    };

    orchestrator.setProvider(mockProvider, 'mock', 'mock-v1');

    // Call 1
    const res1 = await orchestrator.runTask(
      sampleTask,
      { text: 'Identical text' },
      { userId: testUserId },
    );
    expect(providerCalls).toBe(1);
    expect(res1.cached).toBe(false);

    // Call 2 with identical input
    const res2 = await orchestrator.runTask(
      sampleTask,
      { text: 'Identical text' },
      { userId: testUserId },
    );
    expect(providerCalls).toBe(1); // Provider NOT called again
    expect(res2.cached).toBe(true);
    expect(res2.data.topic).toBe('Cached Topic');
  });

  it('4. Invalidates cache when task version changes', async () => {
    let providerCalls = 0;
    const mockProvider: AiProvider = {
      extract: async () => {
        providerCalls++;
        return {
          topic: 'Versioned Topic',
          summary: 'Versioned summary.',
          keyPoints: ['V Point'],
        };
      },
      reason: async () => ({ reasoningSteps: [], conclusion: '', confidence: 'high' }),
      generate: async () => ({ content: '', citations: [] }),
      classify: async () => ({ category: '', confidence: 1 }),
    };

    orchestrator.setProvider(mockProvider, 'mock', 'mock-v1');

    await orchestrator.runTask(sampleTask, { text: 'Version text' }, { userId: testUserId });
    expect(providerCalls).toBe(1);

    // Task version updated to 2.0.0
    const v2Task: typeof sampleTask = {
      ...sampleTask,
      version: '2.0.0',
    };

    await orchestrator.runTask(v2Task, { text: 'Version text' }, { userId: testUserId });
    expect(providerCalls).toBe(2); // Invalidation: provider called again
  });

  it('5. Uses clearly identified deterministic fallback when AI provider is unconfigured', async () => {
    // No provider set
    orchestrator.setProvider(null, 'none', 'none');

    const result = await orchestrator.runTask(
      sampleTask,
      { text: 'Fallback input text' },
      { userId: testUserId },
    );

    expect(result.isFallback).toBe(true);
    expect(result.fallbackReason).toContain('AI provider is not configured');
    expect(result.data.topic).toBe('Deterministic Concept');
    expect(result.data.summary).toContain('Fallback summary of length 19');
  });

  it('6. Strictly isolates cache entries by userId preventing cross-student data leakage', async () => {
    let providerCalls = 0;
    const otherUserId = '22222222-2222-4222-a222-222222222222';

    const mockProvider: AiProvider = {
      extract: async () => {
        providerCalls++;
        return {
          topic: 'Confidential Note',
          summary: 'Student private submission analysis.',
          keyPoints: ['Confidential Point'],
        };
      },
      reason: async () => ({ reasoningSteps: [], conclusion: '', confidence: 'high' }),
      generate: async () => ({ content: '', citations: [] }),
      classify: async () => ({ category: '', confidence: 1 }),
    };

    orchestrator.setProvider(mockProvider, 'mock', 'mock-v1');

    // User A executes task
    const resA = await orchestrator.runTask(
      sampleTask,
      { text: 'Shared prompt text' },
      { userId: testUserId },
    );
    expect(providerCalls).toBe(1);
    expect(resA.cached).toBe(false);

    // User B executes task with identical input text
    const resB = await orchestrator.runTask(
      sampleTask,
      { text: 'Shared prompt text' },
      { userId: otherUserId },
    );
    // Provider MUST be called for User B; cache must NOT leak across tenants
    expect(providerCalls).toBe(2);
    expect(resB.cached).toBe(false);
  });
});
