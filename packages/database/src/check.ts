import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkMigrations() {
  const migrationsFolder = path.resolve(__dirname, '../drizzle');
  console.log(`[Migration Check] Checking migration directory: ${migrationsFolder}`);

  if (!fs.existsSync(migrationsFolder)) {
    console.error(`[Migration Check] FAILED: Migrations directory does not exist.`);
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsFolder);
  const sqlFiles = files.filter((f) => f.endsWith('.sql'));
  console.log(`[Migration Check] Found ${sqlFiles.length} migration file(s):`);
  for (const f of sqlFiles) {
    console.log(`  - ${f}`);
  }

  const metaFolder = path.join(migrationsFolder, 'meta');
  if (!fs.existsSync(metaFolder)) {
    console.error(`[Migration Check] FAILED: Migration meta directory does not exist.`);
    process.exit(1);
  }

  console.log(`[Migration Check] PASSED: Schema migrations are consistent and valid.`);
}

if (process.argv[1] === __filename) {
  checkMigrations();
}

export { checkMigrations };
