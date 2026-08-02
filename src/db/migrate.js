import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

if (!env.DB_MIGRATE_USER) {
  logger.error(
    'DB_MIGRATE_USER is not set. Migrations need a privileged DB user distinct from ' +
    'DB_USER (which must not carry DDL rights) — set DB_MIGRATE_USER/DB_MIGRATE_PASSWORD in .env.',
  );
  process.exit(1);
}

// A dedicated connection with multipleStatements enabled, scoped to this
// script only — migration files are static and trusted, unlike request data,
// so this doesn't carry the injection risk the shared app pool must avoid.
const connection = await mysql.createConnection({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_MIGRATE_USER,
  password: env.DB_MIGRATE_PASSWORD,
  database: env.DB_NAME,
  multipleStatements: true,
});

async function ensureMigrationsTable() {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getAppliedMigrations() {
  const [rows] = await connection.query('SELECT name FROM schema_migrations');
  return new Set(rows.map((row) => row.name));
}

async function run() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  let files = [];
  try {
    files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    logger.info('No migrations directory found, nothing to run.');
    await connection.end();
    return;
  }

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    logger.info('No pending migrations.');
    await connection.end();
    return;
  }

  for (const file of pending) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    logger.info({ file }, 'Applying migration');
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  }

  logger.info({ count: pending.length }, 'Migrations applied');
  await connection.end();
}

run().catch((err) => {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
});
