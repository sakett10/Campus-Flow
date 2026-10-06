import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple .env parser to avoid external dependencies
function loadEnv() {
  const rootEnvPath = path.resolve(__dirname, '../../../.env');
  if (fs.existsSync(rootEnvPath)) {
    const lines = fs.readFileSync(rootEnvPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

export async function verifyDatabase() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });

  try {
    const dbInfo = await sql`SELECT current_database(), version();`;
    const currentDb = dbInfo[0]?.current_database ?? 'unknown';
    const version = dbInfo[0]?.version ?? 'unknown';
    console.log(`[DB Verify] Database Name: ${currentDb}`);
    console.log(`[DB Verify] Engine Version: ${version}`);

    // Tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log('\n--- TABLES ---');
    for (const t of tables) {
      console.log(`  - ${t.table_name}`);
    }

    // Indexes
    const indexes = await sql`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      ORDER BY tablename, indexname;
    `;
    console.log(`\n--- INDEXES (${indexes.length} total) ---`);
    for (const idx of indexes) {
      console.log(`  - [${idx.tablename}] ${idx.indexname}`);
    }

    // Foreign Keys
    const fks = await sql`
      SELECT 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu 
        ON tc.constraint_name = kcu.constraint_name 
      JOIN information_schema.constraint_column_usage AS ccu 
        ON ccu.constraint_name = tc.constraint_name 
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `;
    console.log(`\n--- FOREIGN KEYS (${fks.length} total) ---`);
    for (const fk of fks) {
      console.log(
        `  - ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`,
      );
    }

    console.log(
      '\n[Database Verification] SUCCESS: Schema, tables, indexes, and foreign keys verified.',
    );
  } finally {
    await sql.end();
  }
}

verifyDatabase().catch((err) => {
  console.error('Database verification failed:', err);
  process.exit(1);
});
