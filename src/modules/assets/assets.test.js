import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { createApp } from '../../app.js';
import { pool, closePool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { storeFromDataUrl, assetExists } from './assets.service.js';
import { STORED_LOGO_URL_RE } from './assets.constants.js';

const app = createApp();

/**
 * The filesystem counterpart to the DB_NAME guard the other suites assert.
 *
 * Until env.LOGO_DIR existed, `npm test` wrote real .webp files into the repository's
 * public/static/logos/ directory — the careful kitworld_test isolation never extended to storage.
 */

/** A 24x24 PNG built by sharp — same fixture as orders.test.js, and guaranteed decodable. */
async function pngDataUrl() {
  const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#c00' } })
    .png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

const repoLogoDir = path.resolve('public', 'static', 'logos');

/** How many files LOGO_DIR holds right now — used to prove a request did or did not write one. */
const logoCount = () => readdirSync(env.LOGO_DIR).length;

/**
 * Registers a user, marks it verified, and signs in. Verification is set directly rather than
 * driven through the code flow, which is auth's business and already covered elsewhere; the UPDATE
 * is scoped to one id (CLAUDE.md rule 16).
 */
async function signedInUser() {
  const email = `assets-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'Str0ng-Passw0rd!';

  // 200, not 201: register returns a pending-verification payload rather than creating a session.
  await request(app).post('/api/auth/register')
    .send({ name: 'Asset Tester', email, password })
    .expect(200);

  await pool.execute(
    'UPDATE users SET email_verified_at = NOW() WHERE email = ? AND email LIKE ?',
    [email, 'assets-%@example.com'],
  );

  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return { email, token: res.body.token };
}

let auth;

beforeAll(async () => {
  // The suite must only ever touch the test database — the same assertion the other suites make.
  expect(env.DB_NAME).toBe('kitworld_test');
  auth = await signedInUser();
});

afterAll(async () => {
  // Scoped to the accounts this file creates, by an explicit test-only pattern. Never an
  // unqualified DELETE (rule 16).
  await pool.execute('DELETE FROM users WHERE email LIKE ?', ['assets-%@example.com']);
  await closePool();
});

describe('assets storage isolation', () => {
  it('writes to an OS temp directory under test, never into the repository', async () => {
    const { url } = await storeFromDataUrl(await pngDataUrl());
    const filename = url.split('/').pop();

    // The write landed in the temp directory...
    expect(existsSync(path.join(env.LOGO_DIR, filename))).toBe(true);

    // ...and NOT in the repository. This is the assertion that would have failed before Phase 1.5,
    // when both paths were the same directory.
    expect(existsSync(path.join(repoLogoDir, filename))).toBe(false);
  });

  it('resolves LOGO_DIR inside the OS temp directory and STATIC_ROOT inside the repo', () => {
    const relative = path.relative(realpathSync(os.tmpdir()), path.resolve(env.LOGO_DIR));
    expect(relative.startsWith('..')).toBe(false);
    expect(relative).not.toBe('');

    // STATIC_ROOT deliberately does NOT move — it serves the committed kit images.
    expect(path.resolve(env.STATIC_ROOT)).toBe(path.resolve('public', 'static'));
  });

  /**
   * NEGATIVE TEST for the guard itself.
   *
   * Run in a child process, not in-process: the guard fires at module load, and this suite has
   * already imported assets.service with a valid LOGO_DIR. Re-importing cannot re-run it, so the
   * only honest way to test "refuses to start" is to actually try to start it.
   */
  it('refuses to load when NODE_ENV=test and LOGO_DIR points at real storage', () => {
    let stderr = '';
    let threw = false;

    try {
      execFileSync(
        process.execPath,
        ['-e', "import('./src/modules/assets/assets.service.js')"],
        {
          env: { ...process.env, NODE_ENV: 'test', LOGO_DIR: repoLogoDir },
          encoding: 'utf8',
          stdio: 'pipe',
        },
      );
    } catch (err) {
      threw = true;
      stderr = err.stderr ?? '';
    }

    expect(threw, 'importing assets.service should have failed').toBe(true);
    expect(stderr).toContain('not inside the OS temp directory');
    expect(stderr).toContain('Refusing to write uploads to real storage');
  });

  it('rejects a relative LOGO_DIR at boot rather than resolving it against cwd', () => {
    let threw = false;
    let stderr = '';

    try {
      execFileSync(process.execPath, ['-e', "import('./src/config/env.js')"], {
        env: { ...process.env, LOGO_DIR: './logos' },
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      threw = true;
      stderr = err.stderr ?? '';
    }

    expect(threw, 'env.js should have exited on a relative LOGO_DIR').toBe(true);
    expect(stderr).toContain('LOGO_DIR must be an absolute path');
  });
});

describe('assetExists', () => {
  it('is true for a stored logo and false once it is gone', async () => {
    const { url } = await storeFromDataUrl(await pngDataUrl());
    expect(await assetExists(url)).toBe(true);

    await rm(path.join(env.LOGO_DIR, path.basename(url)));
    expect(await assetExists(url)).toBe(false);
  });

  it('is false for a well-formed URL that was never uploaded', async () => {
    expect(await assetExists('/static/logos/ffffffff-ffff-4fff-8fff-ffffffffffff.webp'))
      .toBe(false);
  });

  /**
   * The shape gate runs before anything reaches the filesystem, so these never become a path at
   * all. Asserted here as well as in the schema tests because assetExists is separately callable
   * and must be safe on its own — a future caller may not have validated first.
   */
  it.each([
    ['../../../../etc/passwd'],
    ['/static/logos/../../package.json'],
    ['/static/kits/socks.png'],
    ['https://evil.example.com/x.webp'],
    [null],
    [undefined],
    [42],
  ])('is false without touching the filesystem for %s', async (value) => {
    expect(await assetExists(value)).toBe(false);
  });
});

describe('POST /api/assets', () => {
  it('requires authentication', async () => {
    const before = logoCount();
    const res = await request(app).post('/api/assets').send({ dataUrl: await pngDataUrl() });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
    // requireAuth runs before the body parser, so nothing was written and nothing was buffered.
    expect(logoCount()).toBe(before);
  });

  it('rejects a malformed bearer token', async () => {
    const res = await request(app).post('/api/assets')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ dataUrl: await pngDataUrl() });

    expect(res.status).toBe(401);
  });

  it('stores a PNG and returns a URL this server minted', async () => {
    const before = logoCount();
    const res = await request(app).post('/api/assets')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({ dataUrl: await pngDataUrl() });

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(STORED_LOGO_URL_RE);
    expect(res.body.bytes).toBeGreaterThan(0);
    expect(logoCount()).toBe(before + 1);

    // Written to the temp dir, never into the repository.
    const filename = res.body.url.split('/').pop();
    expect(existsSync(path.join(env.LOGO_DIR, filename))).toBe(true);
    expect(existsSync(path.join(repoLogoDir, filename))).toBe(false);
  });

  /**
   * ROUND TRIP over HTTP — the assertion nothing else in the suite makes.
   *
   * This is what proves /static/logos is mounted ahead of /static and points at LOGO_DIR. The
   * file provably does not exist under STATIC_ROOT (asserted above), so if the broader mount
   * matched first this would 404. Without this test a wrong mount order passes everything.
   */
  it('serves the stored logo back over HTTP from LOGO_DIR', async () => {
    const upload = await request(app).post('/api/assets')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({ dataUrl: await pngDataUrl() })
      .expect(201);

    const res = await request(app).get(upload.body.url);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body.length).toBe(upload.body.bytes);
  });

  it('rejects an SVG disguised as a PNG, by magic bytes', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    const before = logoCount();

    const res = await request(app).post('/api/assets')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({ dataUrl: `data:image/png;base64,${svg.toString('base64')}` });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ASSET_UNSUPPORTED_TYPE');
    expect(logoCount()).toBe(before); // nothing written
  });

  it('rejects unknown keys rather than ignoring them', async () => {
    const res = await request(app).post('/api/assets')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({ dataUrl: await pngDataUrl(), filename: '../../etc/passwd', ownerUserId: 1 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a body with no dataUrl', async () => {
    const res = await request(app).post('/api/assets')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({});

    expect(res.status).toBe(422);
  });

  it('leaks nothing internal in an error body', async () => {
    const res = await request(app).post('/api/assets')
      .set('Authorization', `Bearer ${auth.token}`)
      .send({ dataUrl: 'data:image/png;base64,####' });

    expect(res.status).toBe(422);
    const body = JSON.stringify(res.body);
    // Markers that cannot occur in ordinary user-facing prose. 'at ' was tried first and is a
    // false positive — it matches "not a supported image".
    const leaks = ['LOGO_DIR', 'Temp', 'sharp', 'node_modules', '.js:', 'SELECT', 'kitworld', 'stack'];
    for (const leak of leaks) {
      expect(body, `error body leaked "${leak}"`).not.toContain(leak);
    }
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('requestId');
  });
});
