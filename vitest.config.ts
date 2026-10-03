import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@campusflow/types': path.resolve(__dirname, './packages/types/src'),
      '@campusflow/config': path.resolve(__dirname, './packages/config/src'),
      '@campusflow/shared': path.resolve(__dirname, './packages/shared/src'),
      '@campusflow/database': path.resolve(__dirname, './packages/database/src'),
    },
  },
});
