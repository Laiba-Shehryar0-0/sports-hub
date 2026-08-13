/**
 * The whole check, in one command. Runs every gate that decides whether the working tree is
 * shippable, across BOTH repos.
 *
 *   npm run ci                 # everything, streaming output, summary at the end
 *   npm run ci -- --bail       # stop at the first failure
 *   npm run ci -- --quiet      # suppress per-step output, print only the summary
 *
 * ┌─ WHY THIS LIVES IN kit-backend AND NOT ALONGSIDE THE TWO REPOS ───────────────────────────────┐
 * │ F:\SportsHub (or wherever the pair is checked out) is NOT a git repository — it is a plain    │
 * │ folder holding two independent ones. A script there is tracked by nothing: unversioned,       │
 * │ unreviewable, not cloned, and gone with the machine. That is the wrong home for the script    │
 * │ that decides whether code ships.                                                              │
 * │                                                                                               │
 * │ kit-backend is already the cross-repo authority — sync-reference.mjs reaches into             │
 * │ ../kit-frontend and the pre-commit hook already knows the sibling's layout — so the runner    │
 * │ lives here too. There may be an untracked convenience shim at the parent folder; it is a      │
 * │ two-line wrapper around this file and holds no logic of its own. See docs/ci.md.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Node rather than a .sh or a .cmd, deliberately: `npm run ci` then behaves identically from
 * PowerShell, cmd and Git Bash. A .sh needs the caller to be in Git Bash; a .cmd cannot be called
 * from Git Bash. It also matches the existing tooling (check-seeds.mjs, sync-reference.mjs) and
 * makes the pre-flight below possible, which a shell script could not do cleanly.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.resolve(repoRoot, '..', 'kit-frontend');

const bail = process.argv.includes('--bail');
const quiet = process.argv.includes('--quiet');

/**
 * npm is a .cmd shim on Windows, and since the CVE-2024-27980 hardening (Node 18.20.2/20.12/21.7)
 * spawning a .cmd WITHOUT a shell throws EINVAL rather than running it. So Windows needs both the
 * .cmd name and `shell: true`; POSIX needs neither.
 *
 * `shell: true` is safe HERE and only here: every argument in STEPS is a hardcoded literal in this
 * file. Nothing from argv, the environment or a filename is ever interpolated into a command. If a
 * future step needs a dynamic argument, it does not go through this path — quote it or spawn the
 * underlying binary directly.
 */
const isWindows = process.platform === 'win32';
const NPM = isWindows ? 'npm.cmd' : 'npm';

/**
 * The gates, cheapest first.
 *
 * Ordering is not cosmetic: a stale mirror or a corrupted seed file is a 2-second answer, and
 * discovering it only after 33 seconds of tests wastes most of a run. The two test suites are last
 * because they are 89% of the wall clock.
 */
const STEPS = [
  { label: 'check:seeds', cwd: repoRoot, args: ['run', '--silent', 'check:seeds'] },
  { label: 'sync:reference --check', cwd: repoRoot, args: ['run', '--silent', 'sync:reference', '--', '--check'] },
  { label: 'backend tests', cwd: repoRoot, args: ['test'] },
  { label: 'frontend tests', cwd: frontendRoot, args: ['test'] },
];

function runStep(step) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(NPM, step.args, {
      cwd: step.cwd,
      shell: isWindows,   // see NPM above — required for .cmd, safe because every arg is a literal
      // Streamed by default so a hanging step is visible while it hangs. Under --quiet the output
      // is swallowed rather than buffered: it is reprinted for failures only, below.
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    let output = '';
    if (quiet) {
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
    }

    child.on('error', (err) => {
      resolve({ ...step, ok: false, ms: Date.now() - startedAt, output, spawnError: err.message });
    });
    child.on('close', (code) => {
      resolve({ ...step, ok: code === 0, code, ms: Date.now() - startedAt, output });
    });
  });
}

/** `git` for one repo, as a trimmed string. Returns null rather than throwing on any failure. */
function git(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

/**
 * ── PRE-FLIGHT ─────────────────────────────────────────────────────────────────────────────────
 *
 * Two hard requirements and one report.
 *
 * MySQL is the one that matters. The backend suite cannot run without kitworld_test, and without
 * this check that surfaces as a connection stack trace nine seconds in, looking like a code
 * failure. Checked against DB_NAME_TEST specifically — this script runs under NODE_ENV
 * unset/development, where env.DB_NAME resolves to the DEV database, and a reachable kitworld
 * proves nothing about the database the suite actually uses.
 *
 * "Could not run" is failure, not silence. `check:seeds` deliberately warns-and-passes when the
 * database is down, because it still has static checks worth running standalone; CI has no such
 * excuse. A suite that reports "no tests" must never be mistaken for a green one — that is the
 * failure mode already logged in docs/known-gaps.md.
 *
 * The working-tree report is a WARNING and never a failure. CI runs against the working tree and
 * running it before committing is the intended use, so failing on a dirty tree would forbid the
 * main use case. The commit hash is printed so a green run is attributable to something.
 */
async function preflight() {
  const problems = [];

  if (!existsSync(frontendRoot)) {
    problems.push(
      `kit-frontend not found at ${frontendRoot}\n`
      + '  This script expects the two repos to sit side by side. Without the sibling, the mirror\n'
      + '  check and the frontend suite cannot run — which is two of the four gates, so this is a\n'
      + '  failure rather than a skip.',
    );
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME_TEST,
      connectTimeout: 5000,
    });
    await connection.end();
  } catch (err) {
    problems.push(
      `MySQL unreachable: ${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME_TEST} (${err.code ?? err.message})\n`
      + '  The backend suite needs this database. Start MySQL and re-run; do not read a failure\n'
      + '  here as a problem with the code.',
    );
  }

  if (problems.length) {
    console.error('\nPRE-FLIGHT FAILED\n');
    problems.forEach((p) => console.error(`  ${p}\n`));
    process.exit(1);
  }

  // ── Report, not a gate ──
  console.log('CI — kit-backend + kit-frontend\n');
  for (const [name, cwd] of [['kit-backend', repoRoot], ['kit-frontend', frontendRoot]]) {
    const head = await git(cwd, ['rev-parse', '--short', 'HEAD']);
    const branch = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const dirty = await git(cwd, ['status', '--porcelain']);
    const state = dirty === null ? 'not a git repo' : dirty === '' ? 'clean' : `${dirty.split('\n').length} file(s) uncommitted`;
    console.log(`  ${name.padEnd(13)} ${branch ?? '?'} @ ${head ?? '?'}  (${state})`);
  }
  console.log(`  ${'database'.padEnd(13)} ${env.DB_NAME_TEST} reachable`);
  if (bail) console.log('\n  --bail: stopping at the first failure');
  if (quiet) console.log('\n  --quiet: per-step output suppressed, shown for failures only');
}

await preflight();

const results = [];
for (const step of STEPS) {
  if (!quiet) console.log(`\n${'─'.repeat(70)}\n▶ ${step.label}\n${'─'.repeat(70)}`);
  const result = await runStep(step);
  results.push(result);

  // Under --quiet the output was swallowed; a failing step is exactly when it is wanted back.
  if (!result.ok && quiet && result.output) {
    console.error(`\n▼ ${step.label} output\n${result.output}`);
  }
  if (!result.ok && bail) break;
}

// ── Summary ────────────────────────────────────────────────────────────────────────────────────
// Printed even for a fully green run: the per-step timings are how anyone notices this creeping
// past a minute, which is the point at which people stop running it.
const width = Math.max(...STEPS.map((s) => s.label.length));
const total = results.reduce((sum, r) => sum + r.ms, 0);
const failed = results.filter((r) => !r.ok);
const skipped = STEPS.length - results.length;

console.log(`\n${'═'.repeat(70)}\nSUMMARY\n${'═'.repeat(70)}`);
for (const r of results) {
  const time = `${(r.ms / 1000).toFixed(1)}s`.padStart(8);
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(width)}${time}`);
  if (r.spawnError) console.log(`        could not start: ${r.spawnError}`);
}
for (const s of STEPS.slice(results.length)) {
  console.log(`  ----  ${s.label.padEnd(width)}${'skipped'.padStart(8)}`);
}
console.log(`\n  ${(total / 1000).toFixed(1)}s total`);

if (failed.length) {
  console.error(`\n${failed.length} step(s) failed: ${failed.map((r) => r.label).join(', ')}`);
  if (skipped > 0) console.error(`${skipped} step(s) never ran (--bail).`);
  process.exit(1);
}

console.log('\nAll checks passed.');
