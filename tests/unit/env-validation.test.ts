import { describe, it, expect } from 'vitest';
import { validateEnv } from '@campusflow/config';

describe('Environment Configuration & Validation', () => {
  const validMockEnv = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://campusflow:campusflow@localhost:5432/campusflow',
    REDIS_URL: 'redis://localhost:6379',
    CLERK_SECRET_KEY: 'sk_test_mock_secret_key',
    CLERK_PUBLISHABLE_KEY: 'pk_test_mock_pub_key',
    STORAGE_ENDPOINT: 'http://localhost:9000',
    STORAGE_BUCKET: 'campusflow-dev',
    STORAGE_ACCESS_KEY: 'minioadmin',
    STORAGE_SECRET_KEY: 'minioadmin',
    AI_PROVIDER_KEY: 'test_ai_key',
    AI_MODEL: 'gemini-2.5-flash',
    ENCRYPTION_KEY: '01234567890123456789012345678901', // 32 chars
  };

  it('successfully validates a complete and correct environment config', () => {
    const config = validateEnv(validMockEnv);
    expect(config.DATABASE_URL).toBe('postgres://campusflow:campusflow@localhost:5432/campusflow');
    expect(config.STORAGE_BUCKET).toBe('campusflow-dev');
    expect(config.AI_PROVIDER).toBe('stub');
    expect(config.AUTH_TEST_BYPASS).toBe(false);
  });

  it('fails when required variables like DATABASE_URL or REDIS_URL are missing', () => {
    const incompleteEnv = { ...validMockEnv };
    delete (incompleteEnv as Record<string, unknown>)['DATABASE_URL'];

    expect(() => validateEnv(incompleteEnv)).toThrow(/Environment validation failed/);
  });

  it('fails when URLs are malformed', () => {
    const invalidUrlEnv = {
      ...validMockEnv,
      DATABASE_URL: 'not-a-valid-url',
    };

    expect(() => validateEnv(invalidUrlEnv)).toThrow(/DATABASE_URL must be a valid connection URL/);
  });

  it('fails when ENCRYPTION_KEY is less than 32 characters', () => {
    const shortKeyEnv = {
      ...validMockEnv,
      ENCRYPTION_KEY: 'too-short',
    };

    expect(() => validateEnv(shortKeyEnv)).toThrow(/ENCRYPTION_KEY must be at least 32 characters/);
  });

  it('STRICT SECURITY CHECK: rejects AUTH_TEST_BYPASS=true when NODE_ENV=production', () => {
    const dangerousProdEnv = {
      ...validMockEnv,
      NODE_ENV: 'production',
      AUTH_TEST_BYPASS: 'true',
    };

    expect(() => validateEnv(dangerousProdEnv)).toThrow(
      /SECURITY VIOLATION: AUTH_TEST_BYPASS cannot be true when NODE_ENV is production/,
    );
  });

  it('allows AI_PROVIDER=ollama without AI_PROVIDER_KEY', () => {
    const ollamaEnv = {
      ...validMockEnv,
      AI_PROVIDER: 'ollama',
      AI_MODEL: 'llama3.2:3b',
      OLLAMA_BASE_URL: 'http://localhost:11434',
    };
    delete (ollamaEnv as Record<string, unknown>)['AI_PROVIDER_KEY'];

    const config = validateEnv(ollamaEnv);
    expect(config.AI_PROVIDER).toBe('ollama');
    expect(config.AI_MODEL).toBe('llama3.2:3b');
    expect(config.OLLAMA_BASE_URL).toBe('http://localhost:11434');
    expect(config.AI_PROVIDER_KEY).toBeUndefined();
  });

  it('requires AI_PROVIDER_KEY when AI_PROVIDER=gemini', () => {
    const geminiWithoutKey = {
      ...validMockEnv,
      AI_PROVIDER: 'gemini',
      AI_MODEL: 'gemini-2.5-flash',
    };
    delete (geminiWithoutKey as Record<string, unknown>)['AI_PROVIDER_KEY'];

    expect(() => validateEnv(geminiWithoutKey)).toThrow(
      /AI_PROVIDER_KEY is required when AI_PROVIDER is "gemini"/,
    );
  });

  it('accepts AI_PROVIDER=gemini when AI_PROVIDER_KEY is provided', () => {
    const geminiWithKey = {
      ...validMockEnv,
      AI_PROVIDER: 'gemini',
      AI_PROVIDER_KEY: 'test-gemini-key',
      AI_MODEL: 'gemini-2.5-flash',
    };

    const config = validateEnv(geminiWithKey);
    expect(config.AI_PROVIDER).toBe('gemini');
    expect(config.AI_PROVIDER_KEY).toBe('test-gemini-key');
  });
});
