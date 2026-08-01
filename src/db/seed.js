import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.join(__dirname, 'seeds');

// Scoped connection with multipleStatements, same rationale as migrate.js —
// seed files are static and trusted, not request-derived.
const connection = await mysql.createConnection({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  multipleStatements: true,
});

async function run() {
  let files = [];
  try {
    files = (await readdir(seedsDir)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    logger.info('No seeds directory found, nothing to run.');
    await connection.end();
    return;
  }

  if (files.length === 0) {
    logger.info('No seed files found.');
    await connection.end();
    return;
  }

  for (const file of files) {
    const sql = await readFile(path.join(seedsDir, file), 'utf8');
    logger.info({ file }, 'Applying seed');
    await connection.query(sql);
  }

  logger.info({ count: files.length }, 'Seeds applied');
  await connection.end();
}

run().catch(async (err) => {
  logger.error({ err }, 'Seed failed');
  await connection.end();
  process.exit(1);
});
