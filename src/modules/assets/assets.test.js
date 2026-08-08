import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import { storeFromDataUrl } from './assets.service.js';

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
