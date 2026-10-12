import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getClerkSessionToken,
  getAuthHeaders,
  setApiAuthToken,
  createCourseFromSyllabus,
} from '../../apps/web/src/lib/api.js';
import type { SyllabusExtractedCourse } from '@campusflow/types';

describe('Clerk Session Token Lifecycle & Retry Behavior', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    setApiAuthToken(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.window = originalWindow;
  });

  it('obtains fresh token on each invocation without caching stale tokens in module state', async () => {
    let tokenCallCount = 0;
    const mockGetToken = vi.fn(async (opts?: { skipCache?: boolean }) => {
      tokenCallCount++;
      return `jwt-token-iteration-${tokenCallCount}-${opts?.skipCache ? 'skipCache' : 'cached'}`;
    });

    // Mock window.Clerk
    (globalThis as unknown as { window: unknown }).window = {
      Clerk: {
        session: {
          getToken: mockGetToken,
        },
      },
    };

    // First call
    const token1 = await getClerkSessionToken();
    expect(token1).toBe('jwt-token-iteration-1-cached');
    expect(mockGetToken).toHaveBeenCalledTimes(1);

    // Second call without skipCache
    const token2 = await getClerkSessionToken();
    expect(token2).toBe('jwt-token-iteration-2-cached');
    expect(mockGetToken).toHaveBeenCalledTimes(2);

    // Third call with forceRefresh = true
    const token3 = await getClerkSessionToken(true);
    expect(token3).toBe('jwt-token-iteration-3-skipCache');
    expect(mockGetToken).toHaveBeenCalledWith({ skipCache: true });
    expect(mockGetToken).toHaveBeenCalledTimes(3);
  });

  it('constructs auth headers dynamically without retaining expired tokens', async () => {
    let currentToken = 'token-initial';
    const mockGetToken = vi.fn(async () => currentToken);

    (globalThis as unknown as { window: unknown }).window = {
      Clerk: {
        session: {
          getToken: mockGetToken,
        },
      },
    };

    const headers1 = (await getAuthHeaders()) as Record<string, string>;
    expect(headers1['Authorization']).toBe('Bearer token-initial');

    // Simulate Clerk refreshed token after initial token expires
    currentToken = 'token-refreshed-later';
    const headers2 = (await getAuthHeaders()) as Record<string, string>;
    expect(headers2['Authorization']).toBe('Bearer token-refreshed-later');
  });

  it('retries createCourseFromSyllabus at most once on 401 using a freshly forced token', async () => {
    let tokenIndex = 0;
    const tokens = ['stale-token-1', 'refreshed-token-2'];
    const mockGetToken = vi.fn(async () => {
      return tokens[tokenIndex++];
    });

    (globalThis as unknown as { window: unknown }).window = {
      Clerk: {
        session: {
          getToken: mockGetToken,
        },
      },
    };

    let fetchCallCount = 0;
    const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      fetchCallCount++;
      const authHeader = (init?.headers as Record<string, string>)?.['Authorization'];

      if (authHeader === 'Bearer stale-token-1') {
        // First attempt rejected with 401
        return new Response(JSON.stringify({ detail: 'Invalid or expired Clerk session token.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Second attempt with refreshed token succeeds
      return new Response(
        JSON.stringify({
          success: true,
          course: { id: 'course-123', code: 'CSE101' },
          moduleCount: 1,
          topicCount: 2,
          assessmentCount: 0,
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });

    vi.stubGlobal('fetch', mockFetch);

    const testCourse: SyllabusExtractedCourse = {
      code: 'CSE101',
      title: 'Intro to CS',
      term: 'Fall 2026',
      confidence: 1.0,
      modules: [],
      prerequisites: [],
      prescribedTextbooks: [],
      assessments: [],
      unclearFields: [],
      sourcePageCount: 1,
    };

    const result = await createCourseFromSyllabus(testCourse);
    expect(result.success).toBe(true);
    expect(result.course.id).toBe('course-123');
    // Fetch called twice (first failed with 401, second retried and succeeded)
    expect(fetchCallCount).toBe(2);
  });

  it('stops and throws clear error if unauthorized 401 persists after single retry', async () => {
    const mockGetToken = vi.fn(async () => 'expired-token');

    (globalThis as unknown as { window: unknown }).window = {
      Clerk: {
        session: {
          getToken: mockGetToken,
        },
      },
    };

    let fetchCallCount = 0;
    const mockFetch = vi.fn(async () => {
      fetchCallCount++;
      return new Response(JSON.stringify({ detail: 'Invalid or expired Clerk session token.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const testCourse: SyllabusExtractedCourse = {
      code: 'CSE101',
      title: 'Intro to CS',
      term: 'Fall 2026',
      confidence: 1.0,
      modules: [],
      prerequisites: [],
      prescribedTextbooks: [],
      assessments: [],
      unclearFields: [],
      sourcePageCount: 1,
    };

    await expect(createCourseFromSyllabus(testCourse)).rejects.toThrow(
      'Invalid or expired Clerk session token.',
    );
    // Did not retry infinitely - at most 2 calls
    expect(fetchCallCount).toBeLessThanOrEqual(2);
  });
});
