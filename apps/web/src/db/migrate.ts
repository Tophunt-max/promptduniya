/**
 * Applies pending Drizzle migrations. Run with: `npm run db:migrate`
 */
import { migrate } from 'drizzle-orm/libsql/migrator';

import { getClient, getDb } from './index';

async function main() {
  const db = getDb();
  console.info('→ applying migrations from src/db/migrations …');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.info('✓ migrations applied');
  getClient().close();
}

main().catch((error) => {
  console.error('✗ migration failed');
  console.error(error);
  process.exit(1);
});
