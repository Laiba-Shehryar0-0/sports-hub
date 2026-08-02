import 'dotenv/config';
import { z } from 'zod';

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
