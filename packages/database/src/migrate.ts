import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const databaseUrl =
    process.env['DATABASE_URL'] || 'postgres://campusflow:campusflow@localhost:5432/campusflow';

  console.log(`[Database Migration] Connecting to database...`);
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    // 1. Enable pgvector extension as frozen in ADR-004
    console.log(`[Database Migration] Ensuring 'vector' extension is enabled...`);
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;

    // 2. Run Drizzle migrations
    const db = drizzle(sql);
    const migrationsFolder = path.resolve(__dirname, '../drizzle');
    console.log(`[Database Migration] Applying migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });

    console.log(`[Database Migration] All migrations applied successfully.`);
  } catch (error) {
    console.error(`[Database Migration] Migration failed:`, error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] === __filename) {
  runMigrations();
}

export { runMigrations };
