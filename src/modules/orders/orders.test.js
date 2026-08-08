import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../../app.js';
import { pool, closePool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { SHIPPING_COUNTRIES } from './orders.constants.js';
import { storeFromDataUrl } from '../assets/assets.service.js';

const app = createApp();

/** A complete, valid payload — the DEFAULT_DESIGN shape the customizer actually sends. */
function validOrder(overrides = {}) {
  return {
    design: {
      kitType: 'jersey', kitProduct: 'Football Jersey', sport: 'football', template: 'solid',
      size: 'M', customSize: '', customSizeUnit: 'in',
      bodyColor: '#CC0000', sleeveColor: '#1a1a1a', numberColor: '#FFFFFF', collarColor: '#1a1a1a',
      opacity: { body: 100, sleeves: 100, number: 100, collar: 100 },
      playerName: { front: 'SMITH', back: '' },
      playerNumber: { front: '10', back: '' },
      font: 'Bebas Neue', nameSize: 14, numberSize: 46,
      textPosition: { x: 0.5, y: 0.38 }, numberPosition: { x: 0.5, y: 0.58 },
      logoDataUrl: null, logoPreset: null, logoScale: 80, logoOpacity: 100,
      logoPosition: { x: 0.28, y: 0.22 },
      layers: { body: true, sleeves: true, number: true, name: true, logo: true },
      layerOrder: ['number', 'name', 'logo', 'sleeves', 'body'],
      ...overrides.design,
    },
    contact: {
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
      phone: '+92 300 1234567', clubName: '',
      ...overrides.contact,
    },
    address: {
      street: '12 Mall Road', city: 'Lahore', province: '', postalCode: '', country: 'Pakistan',
      ...overrides.address,
    },
    deliveryId: 'express', paymentId: 'cod', totalKits: 11, primarySize: 'M', instructions: '',
    ...overrides.root,
  };
}

beforeAll(() => {
  expect(env.DB_NAME).toBe('kitworld_test'); // never touch kitworld
});

afterAll(async () => {
  await pool.execute("DELETE FROM orders WHERE contact_json->>'$.email' LIKE '%@example.com'");
  await closePool();
});

describe('POST /api/orders — the client never sets the price', () => {
  it('ignores a tampered pricing object and charges the real total', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({
      root: {
        // The classic attack: edit the total in DevTools and submit.
        pricing: { unitPrice: 1, kitPrice: 1, deliveryPrice: 0, discount: 0, total: 1 },
      },
    }));

    expect(res.status).toBe(201);
    expect(res.body.pricing.total).toBe(31300);   // 2800 x 11 + 500
    expect(res.body.pricing.unitPrice).toBe(2800);
    expect(res.body.pricing.kitPrice).toBe(30800);
    expect(res.body.pricing.deliveryPrice).toBe(500);
    expect(res.body.pricing.discount).toBe(0);
  });

  it('persists the server total, not the client one', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({
      root: { pricing: { total: 1 } },
    }));
    const [[row]] = await pool.execute(
      'SELECT total_price, unit_price FROM orders WHERE reference = ?', [res.body.reference],
    );
    expect(row.total_price).toBe(31300);
    expect(row.unit_price).toBe(2800);
  });

  it('accepts an order with no pricing object at all', async () => {
    const res = await request(app).post('/api/orders').send(validOrder());
    expect(res.status).toBe(201);
    expect(res.body.pricing.total).toBe(31300);
  });

  it('returns id, reference, pricing and status per the contract', async () => {
    const res = await request(app).post('/api/orders').send(validOrder());
    expect(res.body).toMatchObject({ status: 'placed' });
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.reference).toMatch(/^KW-\d{4}-\d{6}$/);
    expect(res.body.pricing).toBeDefined();
  });
});

describe('POST /api/orders — idempotency', () => {
  it('returns the same order for a repeated Idempotency-Key, not a second one', async () => {
    const key = randomUUID();
    const payload = validOrder();

    const first = await request(app).post('/api/orders').set('Idempotency-Key', key).send(payload);
    const second = await request(app).post('/api/orders').set('Idempotency-Key', key).send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.reference).toBe(first.body.reference);

    const [[{ n }]] = await pool.execute(
      'SELECT COUNT(*) n FROM orders WHERE idempotency_key = ?', [key],
    );
    expect(n).toBe(1); // exactly one row, not two
  });

  it('creates separate orders for different keys', async () => {
    const a = await request(app).post('/api/orders').set('Idempotency-Key', randomUUID()).send(validOrder());
    const b = await request(app).post('/api/orders').set('Idempotency-Key', randomUUID()).send(validOrder());
    expect(b.body.id).not.toBe(a.body.id);
  });

  it('still creates an order when no key is sent (multiple NULLs are allowed)', async () => {
    const a = await request(app).post('/api/orders').send(validOrder());
    const b = await request(app).post('/api/orders').send(validOrder());
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).not.toBe(a.body.id);
  });
});

/**
 * These test the client's KEY-GENERATION POLICY, not the server's handling of a key.
 *
 * The earlier tests pass the same key twice by hand, which passes even against a broken client —
 * and the client WAS broken: ordersService minted a fresh UUID inside placeOrder, so a
 * double-click produced two different keys and two orders while the column looked populated.
 *
 * The pair below is the point: the same code path, run under two policies, must give different
 * results. If `oncePerAttempt` ever regresses to per-call generation it becomes `perCall` and the
 * first test fails.
 */
describe('POST /api/orders — client key-generation policy', () => {
  /** Mirrors Checkout.jsx: one key per attempt, held across retries. */
  function checkoutAttempt() {
    const key = randomUUID(); // generated ONCE, like the useRef in Checkout.jsx
    return () => request(app).post('/api/orders').set('Idempotency-Key', key).send(validOrder());
  }

  /** The broken policy: a fresh key on every call, as ordersService used to do. */
  function perCallKey() {
    return () => request(app).post('/api/orders')
      .set('Idempotency-Key', randomUUID())
      .send(validOrder());
  }

  it('one key per attempt: a retry produces ONE order', async () => {
    const submit = checkoutAttempt();
    const first = await submit();
    const retry = await submit(); // the user clicks again after a timeout

    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.reference).toBe(first.body.reference);
  });

  it('one key per attempt: concurrent double-click produces ONE order', async () => {
    const submit = checkoutAttempt();
    const [a, b] = await Promise.all([submit(), submit()]);

    expect(b.body.id).toBe(a.body.id);
    const [[{ n }]] = await pool.execute(
      'SELECT COUNT(*) n FROM orders WHERE reference = ?', [a.body.reference],
    );
    expect(n).toBe(1);
  });

  it('a per-call key produces TWO orders — proving the tests above can tell the policies apart', async () => {
    const submit = perCallKey();
    const first = await submit();
    const second = await submit();

    // This is the bug that shipped. Asserting it explicitly means the two tests above are
    // meaningful rather than passing for an unrelated reason.
    expect(second.body.id).not.toBe(first.body.id);
  });
});

describe('POST /api/orders — country and delivery must agree', () => {
  it('rejects a domestic courier for an address outside Pakistan', async () => {
    // The hole this closes: a UK address on free "Nationwide courier".
    const res = await request(app).post('/api/orders').send(validOrder({
      address: { country: 'United Kingdom' },
      root: { deliveryId: 'standard' },
    }));
    expect(res.status).toBe(422);
    expect(res.body.details.deliveryId?.[0]).toMatch(/International Shipping/i);
  });

  it('accepts international shipping for an address outside Pakistan', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({
      address: { country: 'United Kingdom' },
      root: { deliveryId: 'international' },
    }));
    expect(res.status).toBe(201);
    expect(res.body.pricing.deliveryPrice).toBe(3500);
  });

  it('rejects international shipping for a Pakistan address', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({
      root: { deliveryId: 'international' },
    }));
    expect(res.status).toBe(422);
  });

  it.each(['standard', 'express', 'rush'])('accepts %s for a Pakistan address', async (deliveryId) => {
    const res = await request(app).post('/api/orders').send(validOrder({ root: { deliveryId } }));
    expect(res.status).toBe(201);
  });

  it('rejects a country that is not on the shipping list', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({
      address: { country: 'Wakanda' },
    }));
    expect(res.status).toBe(422);
  });

  it('rejects an empty country — the dropdown always has a value now', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({
      address: { country: '' },
    }));
    expect(res.status).toBe(422);
  });
});

describe('the shipping-country list has not drifted between repos', () => {
  const frontendList = path.resolve('../kit-frontend/src/data/countries.js');

  it.skipIf(!existsSync(frontendList))('frontend and backend list identical countries', () => {
    const source = readFileSync(frontendList, 'utf8');
    const block = source.match(/export const SHIPPING_COUNTRIES = \[([\s\S]*?)\];/)[1];
    const frontend = [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);

    // The lists are duplicated across two repos out of necessity; this is what keeps them honest.
    // A country added to one side only would silently 422 every order using it.
    expect(frontend).toEqual([...SHIPPING_COUNTRIES]);
  });
});

describe('the frontend client does not mint its own key', () => {
  const servicePath = path.resolve('../kit-frontend/src/api/ordersService.js');

  it.skipIf(!existsSync(servicePath))('ordersService takes the key as a parameter', () => {
    const source = readFileSync(servicePath, 'utf8');
    // The regression guard: generating a UUID inside placeOrder is precisely the defect.
    expect(source).not.toMatch(/randomUUID/);
    expect(source).toMatch(/placeOrder\s*\(\s*payload\s*,\s*idempotencyKey\s*\)/);
  });
});

describe('POST /api/orders — optional contract fields arrive as empty strings', () => {
  // country is deliberately NOT in this list any more. It used to accept '' because the old
  // free-text field had no required-validation; it is now a dropdown backed by a z.enum, so ''
  // is neither producible nor accepted (docs/EXTRACTED.md discrepancy #2, resolved).
  it('accepts empty clubName, province, postalCode and instructions', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({
      contact: { clubName: '' },
      address: { province: '', postalCode: '' },
      root: { instructions: '' },
    }));
    expect(res.status).toBe(201);
  });
});

describe('POST /api/orders — logo handling', () => {
  it('stores a real PNG as a file and replaces the field with a URL', async () => {
    const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#c00' } })
      .png().toBuffer();
    const res = await request(app).post('/api/orders').send(validOrder({
      design: { logoDataUrl: `data:image/png;base64,${png.toString('base64')}` },
    }));

    expect(res.status).toBe(201);
    const [[row]] = await pool.execute(
      'SELECT design_json FROM orders WHERE reference = ?', [res.body.reference],
    );
    // mysql2 parses JSON columns already — never JSON.parse them.
    const stored = row.design_json.logoDataUrl;
    expect(stored).toMatch(/^\/static\/logos\/[0-9a-f-]{36}\.webp$/);
    expect(stored).not.toContain('base64'); // never stored inline
  });

  it('rejects a non-image data URL', async () => {
    const notAnImage = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    const res = await request(app).post('/api/orders').send(validOrder({
      design: { logoDataUrl: `data:image/png;base64,${notAnImage.toString('base64')}` },
    }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ASSET_UNSUPPORTED_TYPE');
  });

  /**
   * Since Phase 2 the field may already be a URL from POST /api/assets. It must be persisted
   * verbatim and NOT re-processed — re-processing would write a second copy under a new UUID and
   * orphan the first, which is exactly the leak docs/known-gaps.md warns cannot be cleaned up
   * safely.
   */
  it('passes an already-uploaded logo URL through without writing a second file', async () => {
    const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#0c0' } })
      .png().toBuffer();
    const { url } = await storeFromDataUrl(`data:image/png;base64,${png.toString('base64')}`);

    const before = readdirSync(env.LOGO_DIR).length;
    const res = await request(app).post('/api/orders').send(validOrder({
      design: { logoDataUrl: url },
    }));

    expect(res.status).toBe(201);
    const [[row]] = await pool.execute(
      'SELECT design_json FROM orders WHERE reference = ?', [res.body.reference],
    );
    expect(row.design_json.logoDataUrl).toBe(url);        // byte-identical, not re-minted
    expect(readdirSync(env.LOGO_DIR).length).toBe(before); // no second copy
  });

  /**
   * The schema can only prove the URL is SHAPED like one this server minted. assetExists is what
   * proves the file is actually there — without it an order can reference a UUID nobody uploaded
   * and render a broken image forever.
   */
  it('rejects a well-formed logo URL whose file does not exist', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({
      design: { logoDataUrl: '/static/logos/ffffffff-ffff-4fff-8fff-ffffffffffff.webp' },
    }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ASSET_NOT_FOUND');
    // The user-facing message must not name a directory or a driver code (rule 14).
    expect(res.body.message).not.toMatch(/logos|Temp|ENOENT|LOGO_DIR/);
  });

  /**
   * The URL branch is matched exactly, never by prefix. These are the payloads a loose
   * `startsWith('/static/logos/')` check would accept and persist into an <img src>.
   */
  it.each([
    ['traversal', '/static/logos/../../../../etc/passwd'],
    ['traversal via encoded segment', '/static/logos/..%2f..%2fsecret.webp'],
    ['off-site absolute URL', 'https://evil.example.com/track.webp'],
    ['protocol-relative URL', '//evil.example.com/track.webp'],
    ['right prefix, arbitrary name', '/static/logos/not-a-uuid.webp'],
    ['right prefix, wrong extension', '/static/logos/088f2e63-8f49-4a03-8af6-fd46fcbe6f13.svg'],
    ['nested path under the prefix', '/static/logos/a/088f2e63-8f49-4a03-8af6-fd46fcbe6f13.webp'],
  ])('rejects a forged logo URL: %s', async (_label, logoDataUrl) => {
    const res = await request(app).post('/api/orders').send(validOrder({
      design: { logoDataUrl },
    }));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/orders — validation', () => {
  it('rejects unknown keys (.strict)', async () => {
    const res = await request(app).post('/api/orders').send({ ...validOrder(), isAdmin: true });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects totalKits below the 5-kit minimum', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({ root: { totalKits: 4 } }));
    expect(res.status).toBe(422);
  });

  it('rejects an invalid deliveryId', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({ root: { deliveryId: 'teleport' } }));
    expect(res.status).toBe(422);
  });

  it('never leaks internals in an error body', async () => {
    const res = await request(app).post('/api/orders').send({ design: {} });
    expect(res.status).toBe(422);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/orders|design_json|mysql|SELECT|INSERT|at .*\.js:/i);
    expect(res.body.message).toBe('Validation failed.');
  });
});
