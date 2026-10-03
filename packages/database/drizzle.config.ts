import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env['DATABASE_URL'] || 'postgres://campusflow:campusflow@localhost:5432/campusflow',
  },
  strict: true,
  verbose: true,
});
