/**
 * Validates the SQL under src/db/ so a corrupted file fails loudly instead of silently breaking
 * the next fresh setup.
 *
 *   npm run check:seeds
 *
 * This exists because stray text (" 1  Q") was once typed into the head of 002_pricing.sql and
 * committed. `001_kits.sql` still applied, so kits looked fine, but kit_prices and
 * delivery_methods were never populated — which nobody noticed for days, since an already-seeded
 * local database keeps working and only a fresh setup would have hit it.
 *
 * Two layers:
 *   1. STATIC — no database needed. Tokenises each file and checks every statement begins with a
 *      real SQL keyword. This is what catches junk pasted anywhere in the file.
 *   2. DRY RUN — seeds only. Executes the file inside a transaction and rolls it back, so it is
 *      checked against the real schema (missing columns, bad enum values, width overflows) without
 *      changing any data. Skipped with a warning if the database is unreachable.
 *
 * Migrations get the static check only: they are DDL, which MySQL implicitly commits, so they
 * cannot be dry-run safely.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEEDS_DIR = path.join(repoRoot, 'src', 'db', 'seeds');
const MIGRATIONS_DIR = path.join(repoRoot, 'src', 'db', 'migrations');

const STATEMENT_KEYWORDS = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'SELECT', 'SET', 'START', 'BEGIN',
  'COMMIT', 'ROLLBACK', 'TRUNCATE', 'CREATE', 'ALTER', 'DROP', 'USE', 'RENAME',
]);

/**
 * Strips comments and string/identifier literals, then splits on `;`.
 * Literal-aware so a semicolon or `--` inside a description can't split a statement.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // -- line comment (MySQL requires whitespace after the dashes)
    if (ch === '-' && next === '-' && /[\s]/.test(sql[i + 2] ?? '\n')) {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '#') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    // /* block comment */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Quoted string or backtick identifier — replaced by a placeholder so its contents
    // can never be mistaken for SQL.
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === '\\') { i += 2; continue; }              // \' escape
        if (sql[i] === quote && sql[i + 1] === quote) { i += 2; continue; } // '' escape
        if (sql[i] === quote) { i++; break; }
        i++;
      }
      current += ' X ';
      continue;
    }
    if (ch === ';') {
      statements.push(current);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.trim()) statements.push(current);
  return statements.map(s => s.trim()).filter(Boolean);
}

function staticCheck(sql) {
  const problems = [];
  for (const [index, statement] of splitStatements(sql).entries()) {
    const firstWord = (statement.match(/^([A-Za-z_]+)/)?.[1] ?? '').toUpperCase();
    if (!STATEMENT_KEYWORDS.has(firstWord)) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 60);
      problems.push(
        `statement ${index + 1} starts with ${firstWord ? `"${firstWord}"` : 'a non-keyword'}, `
        + `not a SQL command — looks like stray text. Near: ${preview}`,
      );
    }
  }
  return problems;
}

async function listSql(dir) {
  try {
    return (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  } catch {
    return [];
  }
}

let failures = 0;

// ── 1. Static checks ──────────────────────────────────────────────────────────
for (const [label, dir] of [['migrations', MIGRATIONS_DIR], ['seeds', SEEDS_DIR]]) {
  const files = await listSql(dir);
  if (!files.length) continue;
  console.log(`\n${label}: static check`);
  for (const file of files) {
    const problems = staticCheck(await readFile(path.join(dir, file), 'utf8'));
    if (problems.length) {
      failures++;
      console.error(`  FAIL  ${file}`);
      problems.forEach(p => console.error(`        ${p}`));
    } else {
      console.log(`  ok    ${file}`);
    }
  }
}

// ── 2. Dry run (seeds only) ───────────────────────────────────────────────────
const seedFiles = await listSql(SEEDS_DIR);
if (seedFiles.length) {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      multipleStatements: true,
    });
  } catch (err) {
    console.warn(`\nseeds: dry run SKIPPED — database unreachable (${err.code}).`);
    console.warn('Static checks still ran. Run again with the database up for full validation.');
  }

  if (connection) {
    console.log('\nseeds: dry run against the live schema (rolled back)');
    for (const file of seedFiles) {
      const sql = await readFile(path.join(SEEDS_DIR, file), 'utf8');
      try {
        await connection.query('START TRANSACTION');
        await connection.query(sql);
        console.log(`  ok    ${file}`);
      } catch (err) {
        failures++;
        console.error(`  FAIL  ${file}`);
        console.error(`        ${err.code}: ${err.sqlMessage ?? err.message}`);
      } finally {
        // Always roll back, including on success — this is a check, not a seed.
        await connection.query('ROLLBACK').catch(() => {});
      }
    }
    await connection.end();
  }
}

if (failures) {
  console.error(`\n${failures} file(s) failed validation.`);
  process.exit(1);
}
console.log('\nAll SQL valid.');
