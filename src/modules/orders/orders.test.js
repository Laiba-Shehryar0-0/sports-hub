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

/**
 * Lines first, then headers. fk_order_items_order is ON DELETE RESTRICT, so deleting an order that
 * still has lines fails loudly — which is the point: an unscoped `DELETE FROM orders` must error
 * rather than silently take every line with it (CLAUDE.md rule 16).
 *
 * Scoping: order_items has no email of its own, so it is reached through a JOIN on its parent
 * order. Every row this can touch therefore has a parent matching the test-only pattern; there is
 * no path by which it reaches a line this suite did not create.
 *
 * ┌─ THE DATABASE CHECK IS REPEATED HERE ON PURPOSE ──────────────────────────────────────────────┐
 * │ The beforeAll guard does NOT protect these deletes: vitest runs afterAll hooks even when      │
 * │ beforeAll has thrown (verified, not assumed). A misconfigured NODE_ENV or DB_NAME_TEST would  │
 * │ therefore fail the assertion above and still run these two statements — correctly scoped, on  │
 * │ the wrong database, removing every real order whose contact email ends in @example.com.       │
 * │                                                                                               │
 * │ Cleanup that deletes must verify its own preconditions. Do not remove this on the grounds     │
 * │ that beforeAll already checks.                                                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
afterAll(async () => {
  if (env.DB_NAME !== 'kitworld_test') {
    throw new Error(`Refusing to delete: DB_NAME is "${env.DB_NAME}", not kitworld_test.`);
  }

  await pool.execute(
    `DELETE oi FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
     WHERE o.contact_json->>'$.email' LIKE '%@example.com'`,
  );
  await pool.execute("DELETE FROM orders WHERE contact_json->>'$.email' LIKE '%@example.com'");
  await closePool();
});

/** The same payload as validOrder, in the multi-item cart shape: 6 jerseys + 5 shorts. */
function cartOrder(overrides = {}) {
  const { design, totalKits, primarySize, ...rest } = validOrder();
  return {
    ...rest,
    items: [
      { design, size: 'M', quantity: 6 },
      { design: { ...design, kitType: 'shorts', kitProduct: 'Football Shorts' }, size: 'L', quantity: 5 },
    ],
    ...overrides,
  };
}

const countItems = async (orderId) => {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?', [orderId],
  );
  return row.n;
};

const countOrdersWithKey = async (key) => {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) AS n FROM orders WHERE idempotency_key = ?', [key],
  );
  return row.n;
};

describe('POST /api/orders — cart shape', () => {
  it('writes one order_items row per line, positioned 1..n', async () => {
    const res = await request(app).post('/api/orders').send(cartOrder());
    expect(res.status).toBe(201);

    const [rows] = await pool.execute(
      `SELECT position, kit_type, kit_product, size, quantity, unit_price, line_total
       FROM order_items WHERE order_id = ? ORDER BY position`,
      [res.body.id],
    );

    expect(rows.map((r) => r.position)).toEqual([1, 2]);
    expect(rows.map((r) => r.kit_type)).toEqual(['jersey', 'shorts']);
    expect(rows.map((r) => r.size)).toEqual(['M', 'L']);
    expect(rows.map((r) => r.quantity)).toEqual([6, 5]);
    // Money is per line and server-computed: 2800 x 6, 1500 x 5.
    expect(rows.map((r) => r.line_total)).toEqual([16800, 7500]);
    expect(rows[0].unit_price).toBe(2800);
  });

  it('sums totalKits across lines onto the order header', async () => {
    const res = await request(app).post('/api/orders').send(cartOrder());
    const [[row]] = await pool.execute('SELECT total_kits FROM orders WHERE id = ?', [res.body.id]);
    expect(row.total_kits).toBe(11);
    expect(res.body.pricing.totalKits).toBe(11);
  });

  it('returns per-line pricing plus one delivery charge, not one per line', async () => {
    const res = await request(app).post('/api/orders').send(cartOrder());
    expect(res.body.pricing.items).toHaveLength(2);
    expect(res.body.pricing.kitPrice).toBe(16800 + 7500);
    expect(res.body.pricing.deliveryPrice).toBe(500);           // express, charged once
    expect(res.body.pricing.total).toBe(16800 + 7500 + 500);
  });

  /**
   * RULE 2 ON THE PATH A CLIENT WOULD ACTUALLY USE. The legacy equivalent has been covered since
   * the orders module was built; the cart shape is the new attack surface and had none.
   */
  it('ignores a tampered pricing object on the cart shape and charges the real total', async () => {
    const res = await request(app).post('/api/orders').send(cartOrder({
      pricing: { total: 1, kitPrice: 1, deliveryPrice: 0, discount: 99999, unitPrice: 1 },
    }));

    expect(res.status).toBe(201);
    expect(res.body.pricing.total).toBe(24800);

    const [[row]] = await pool.execute(
      'SELECT kit_price, delivery_price, discount, total_price FROM orders WHERE id = ?',
      [res.body.id],
    );
    expect(row.total_price).toBe(24800);
    expect(row.discount).toBe(0);

    // And the per-line money is server-computed too — tampering cannot reach order_items either.
    const [lines] = await pool.execute(
      'SELECT unit_price, line_total FROM order_items WHERE order_id = ? ORDER BY position',
      [res.body.id],
    );
    expect(lines.map((l) => l.line_total)).toEqual([16800, 7500]);
  });

  it('rejects a cart whose lines total fewer than 5 kits', async () => {
    const res = await request(app).post('/api/orders').send(cartOrder({
      items: [{ design: validOrder().design, size: 'M', quantity: 2 }],
    }));
    expect(res.status).toBe(422);
  });
});

/**
 * THE PHASE 5 PRECONDITION, as a pair. Either half alone proves nothing: that a cart order leaves
 * the singular columns NULL is only meaningful if a legacy order still fills them, and vice versa.
 */
describe('POST /api/orders — the singular columns', () => {
  it('a cart order leaves design_json, unit_price and primary_size NULL', async () => {
    const res = await request(app).post('/api/orders').send(cartOrder());
    const [[row]] = await pool.execute(
      'SELECT design_json, unit_price, primary_size FROM orders WHERE id = ?', [res.body.id],
    );

    // SQL NULL, not a JSON null — JSON.stringify(null) would have stored the string "null" and
    // this assertion is what catches that.
    expect(row.design_json).toBeNull();
    expect(row.unit_price).toBeNull();
    expect(row.primary_size).toBeNull();
  });

  it('a legacy order still populates all three', async () => {
    const res = await request(app).post('/api/orders').send(validOrder());
    const [[row]] = await pool.execute(
      'SELECT design_json, unit_price, primary_size FROM orders WHERE id = ?', [res.body.id],
    );

    expect(row.design_json).not.toBeNull();
    expect(row.design_json.kitType).toBe('jersey');   // mysql2 parses JSON columns
    expect(row.unit_price).toBe(2800);
    expect(row.primary_size).toBe('M');
  });

  it('a legacy order still writes exactly one line', async () => {
    const res = await request(app).post('/api/orders').send(validOrder());
    expect(await countItems(res.body.id)).toBe(1);

    const [[line]] = await pool.execute(
      'SELECT position, quantity, size, unit_price, line_total FROM order_items WHERE order_id = ?',
      [res.body.id],
    );
    expect(line).toMatchObject({ position: 1, quantity: 11, size: 'M', unit_price: 2800, line_total: 30800 });
  });
});

describe('POST /api/orders — idempotent replay inserts no duplicate lines', () => {
  it.each([
    ['cart', cartOrder, 2],
    ['legacy', validOrder, 1],
  ])('%s shape: the same key returns the original order and no extra lines', async (_label, build, expectedLines) => {
    const key = randomUUID();
    const body = build();

    const first = await request(app).post('/api/orders').set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);
    const before = await countItems(first.body.id);
    expect(before).toBe(expectedLines);

    const second = await request(app).post('/api/orders').set('Idempotency-Key', key).send(body);

    expect(second.body.id).toBe(first.body.id);                 // the original, not a second order
    expect(second.body.reference).toBe(first.body.reference);
    expect(await countItems(first.body.id)).toBe(before);       // no duplicate lines
    expect(await countOrdersWithKey(key)).toBe(1);              // exactly one row carries the key
  });

  it('a concurrent double-click races past the pre-check and still inserts one set of lines', async () => {
    const key = randomUUID();
    const body = cartOrder();

    // Fired together so both are likely to pass findByIdempotencyKey before either commits — the
    // path where the unique index, not the pre-check, is what saves us.
    const [a, b] = await Promise.all([
      request(app).post('/api/orders').set('Idempotency-Key', key).send(body),
      request(app).post('/api/orders').set('Idempotency-Key', key).send(body),
    ]);

    expect(a.body.id).toBe(b.body.id);
    expect(await countOrdersWithKey(key)).toBe(1);
    // The rollback is what guarantees this: a failed header insert cannot leave lines behind.
    expect(await countItems(a.body.id)).toBe(2);
  });
});

describe('POST /api/orders — payload routing', () => {
  it('rejects a body carrying BOTH items and design, naming the unrecognized key', async () => {
    const res = await request(app).post('/api/orders').send({
      ...validOrder(),
      items: [{ design: validOrder().design, size: 'M', quantity: 5 }],
    });

    expect(res.status).toBe(422);
    // This is the assertion that traps a future swap to z.union, which would report the useless
    // "Invalid input" here while still returning 422.
    expect(res.body.message).not.toMatch(/Invalid input/);
    expect(res.body.message).toMatch(/design/);
  });

  it.each([
    ['legacy', () => ({ ...validOrder(), legacyShape: true })],
    ['cart', () => ({ ...cartOrder(), legacyShape: true })],
    ['legacy, false', () => ({ ...validOrder(), legacyShape: false })],
  ])('rejects a client-supplied legacyShape on the %s branch', async (_label, build) => {
    const res = await request(app).post('/api/orders').send(build());
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/legacyShape/);
  });
});

/**
 * THE INVARIANT THAT LICENSES PHASE 5.
 *
 * If no order can exist without lines, the "order_items absent -> render the legacy singular
 * design" branch would exist for zero rows, and Phase 5 can delete it rather than carry it
 * forever. Self-contained: it places through BOTH shapes first, then asserts across every order in
 * the database — including the backfilled ones from migration 007 and everything this suite made.
 */
describe('every order has at least one line', () => {
  it('LEFT JOIN order_items finds no orphan header, after both payload shapes', async () => {
    const legacy = await request(app).post('/api/orders').send(validOrder());
    const cart = await request(app).post('/api/orders').send(cartOrder());
    expect(legacy.status).toBe(201);
    expect(cart.status).toBe(201);

    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS orphans
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.id IS NULL`,
    );
    expect(row.orphans).toBe(0);
  });
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

    // No longer the constant 'Validation failed.' — validate.js now surfaces the first issue so
    // the frontend, which renders `message` verbatim, has something a user can act on. It must
    // still say something, and still say nothing internal (asserted above).
    expect(res.body.message).toBeTruthy();
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeTruthy();
  });
});
