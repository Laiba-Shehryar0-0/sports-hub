import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Treats a blank env var (`KEY=`) as unset — dotenv yields '' for those, not undefined. */
const optionalEnvString = z.string().trim().optional().transform((v) => v || undefined);

/** This file is src/config/env.js, so two levels up is the repository root. */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * An optional absolute filesystem path.
 *
 * Absolute is enforced rather than merely non-empty. `path.resolve()` would silently resolve a
 * relative value against `process.cwd()`, so identical config would land in different directories
 * depending on how the process was launched — `npm run dev` from the repo root versus a service
 * unit with its own working directory. That failure is quiet and destructive: uploads keep
 * succeeding, while every already-stored row still reads `/static/logos/<uuid>.webp` against a
 * mount that has moved, so every historical logo 404s with nothing in the logs.
 *
 * Location is deliberately NOT constrained. Pointing uploads at a mounted volume outside the repo
 * is the main reason this is configurable at all — a deploy directory is often replaced wholesale
 * or read-only. Containment is required only under NODE_ENV=test, and is enforced in
 * assets.service, where the write actually happens.
 */
const absolutePathEnv = (name) => optionalEnvString.refine(
  (value) => value === undefined || path.isAbsolute(value),
  { message: `${name} must be an absolute path` },
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1),
  DB_NAME_TEST: z.string().min(1),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),

  // Used only by migrate.js/seed.js — a privileged account distinct from
  // DB_USER, which must not carry DDL rights. Not required at app boot.
  DB_MIGRATE_USER: z.string().min(1).optional(),
  DB_MIGRATE_PASSWORD: z.string().default(''),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  // Express's trust-proxy setting. Unset (the default) means "trust nobody" — correct for a
  // direct connection, and what this app has always run as. Behind a reverse proxy (nginx,
  // Cloudflare, a load balancer), leaving this unset makes every client collapse into one
  // rate-limit key and records the proxy's IP in sessions.ip instead of the caller's.
  //
  // Accepts a hop count ("1" — trust exactly one proxy, e.g. one nginx in front of the app) or a
  // comma-separated list of trusted IPs/CIDRs/Express keywords (e.g. "loopback,10.0.0.0/8").
  // Deliberately does NOT accept "true"/"false"/"*" — Express's own docs call `true` out as
  // unsafe: it trusts the leftmost X-Forwarded-For hop, which is client-supplied and trivially
  // spoofed by anyone who can reach the app directly.
  TRUST_PROXY: optionalEnvString.refine(
    (value) => {
      if (value === undefined) return true;
      if (/^(true|false|\*)$/i.test(value)) return false;
      return value.split(',').every((entry) => /^[a-zA-Z0-9.:/_-]+$/.test(entry.trim()));
    },
    {
      message: 'TRUST_PROXY must be a hop count (e.g. "1") or a comma-separated list of '
        + 'trusted IPs/CIDRs/keywords — never "true", "false", or "*".',
    },
  ),

  // Filesystem roots. Both optional because their defaults depend on repoRoot and NODE_ENV, so
  // they are resolved after parsing rather than with .default() here.
  //
  // These exist because app.js and assets.service.js each used to compute a path from their own
  // __dirname, with different `..` counts — the serve path and the write path agreed only by
  // coincidence of directory depth, and moving either file would have broken the pair silently.
  STATIC_ROOT: absolutePathEnv('STATIC_ROOT'),
  LOGO_DIR: absolutePathEnv('LOGO_DIR'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Verification email delivery. Optional so development can boot with no mail server, but
  // required in production — see the superRefine below.
  //
  // optionalEnvString, not .optional(): a key present-but-blank in .env (SMTP_HOST=) arrives as
  // '' rather than undefined, which .optional() does not cover — the same empty-string trap
  // CLAUDE.md rule 8 describes for request bodies. Blank is normalized to undefined here so
  // "unset" and "set to nothing" behave identically.
  SMTP_HOST: optionalEnvString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: optionalEnvString,
  SMTP_PASS: optionalEnvString,
  SMTP_FROM: optionalEnvString.pipe(
    z.string().default('D Sports Hub <no-reply@dsportshub.local>'),
  ),

  // Shown in the order-confirmation email for a `paymentId: 'bank'` order, so the customer knows
  // where to send money. Optional here (not .default()'d) so the superRefine below can tell
  // "genuinely unset" apart from "set" — the friendly dev/test placeholder is filled in after
  // parsing, same pattern as STATIC_ROOT/LOGO_DIR above. BANK_BRANCH stays genuinely optional even
  // in production: not every bank/account needs one.
  BANK_NAME: optionalEnvString,
  BANK_ACCOUNT_TITLE: optionalEnvString,
  BANK_ACCOUNT_NUMBER: optionalEnvString,
  BANK_BRANCH: optionalEnvString,
}).superRefine((value, ctx) => {
  // A production deploy with no SMTP would accept signups and silently never deliver a code,
  // leaving every new user permanently stuck. Fail at boot instead.
  if (value.NODE_ENV === 'production' && !value.SMTP_HOST) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_HOST'],
      message: 'SMTP_HOST is required when NODE_ENV=production (verification emails cannot be sent without it).',
    });
  }

  // A production deploy with placeholder bank details would email every bank-transfer customer an
  // account nobody can pay into. Fail at boot instead of discovering it from a confused customer.
  if (value.NODE_ENV === 'production'
      && (!value.BANK_NAME || !value.BANK_ACCOUNT_TITLE || !value.BANK_ACCOUNT_NUMBER)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['BANK_NAME'],
      message: 'BANK_NAME, BANK_ACCOUNT_TITLE and BANK_ACCOUNT_NUMBER are required when '
        + 'NODE_ENV=production — a bank-transfer order cannot be paid without real account details.',
    });
  }
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return parsed.data;
}

const rawEnv = loadEnv();

// STATIC_ROOT does NOT move under test. It serves the 24 committed kit images
// (public/static/kits/*.png), which are source files the suite still needs — only the upload
// directory is runtime data, and only that is redirected.
const STATIC_ROOT = rawEnv.STATIC_ROOT ?? path.join(repoRoot, 'public', 'static');

// LOGO_DIR does move, on exactly the principle DB_NAME → DB_NAME_TEST applies below: a test run
// must not write to real storage. assets.service refuses to load if this is not inside a temp
// directory when NODE_ENV=test, so the redirect cannot be silently lost.
const LOGO_DIR = rawEnv.LOGO_DIR ?? (
  rawEnv.NODE_ENV === 'test'
    ? path.join(os.tmpdir(), 'kitworld-test-logos')
    : path.join(STATIC_ROOT, 'logos')
);

// Obvious, unmissable placeholders — never a plausible-looking fake account. Only reachable
// outside production; the superRefine above refuses to boot production without the real values.
const BANK_NAME = rawEnv.BANK_NAME ?? '[SET BANK_NAME IN .env]';
const BANK_ACCOUNT_TITLE = rawEnv.BANK_ACCOUNT_TITLE ?? '[SET BANK_ACCOUNT_TITLE IN .env]';
const BANK_ACCOUNT_NUMBER = rawEnv.BANK_ACCOUNT_NUMBER ?? '[SET BANK_ACCOUNT_NUMBER IN .env]';

export const env = {
  ...rawEnv,
  isProduction: rawEnv.NODE_ENV === 'production',
  isTest: rawEnv.NODE_ENV === 'test',
  DB_NAME: rawEnv.NODE_ENV === 'test' ? rawEnv.DB_NAME_TEST : rawEnv.DB_NAME,
  STATIC_ROOT,
  LOGO_DIR,
  BANK_NAME,
  BANK_ACCOUNT_TITLE,
  BANK_ACCOUNT_NUMBER,
};
