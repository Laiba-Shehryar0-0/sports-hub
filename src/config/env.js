import 'dotenv/config';
import { z } from 'zod';

/** Treats a blank env var (`KEY=`) as unset — dotenv yields '' for those, not undefined. */
const optionalEnvString = z.string().trim().optional().transform((v) => v || undefined);

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
    z.string().default('Kit World Sports <no-reply@kitworldsports.local>'),
  ),
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

export const env = {
  ...rawEnv,
  isProduction: rawEnv.NODE_ENV === 'production',
  isTest: rawEnv.NODE_ENV === 'test',
  DB_NAME: rawEnv.NODE_ENV === 'test' ? rawEnv.DB_NAME_TEST : rawEnv.DB_NAME,
};
