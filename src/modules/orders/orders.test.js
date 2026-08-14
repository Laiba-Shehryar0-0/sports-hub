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

/** One design — the DEFAULT_DESIGN shape the customizer actually sends. */
function baseDesign(overrides = {}) {
  return {
    kitType: 'jersey', kitProduct: 'Football Jersey', sport: 'football', template: 'solid',
    size: 'M', customSize: '', customSizeUnit: 'in',
    bodyColor: '#CC0000', sleeveColor: '#1a1a1a', numberColor: '#FFFFFF', collarColor: '#1a1a1a',
    opacity: { body: 100, sleeves: 100, number: 100, collar: 100 },
    playerName: { front: 'SMITH', back: '' },
    playerNumber: { front: '10', back: '' },
    font: 'Bebas Neue', nameSize: 14, numberSize: 46,
    textPosition: { front: { x: 0.5, y: 0.38 }, back: { x: 0.5, y: 0.38 } },
    numberPosition: { front: { x: 0.5, y: 0.58 }, back: { x: 0.5, y: 0.58 } },
    logoDataUrl: null, logoPreset: null, logoScale: 80, logoOpacity: 100,
    logoPosition: { x: 0.28, y: 0.22 },
    layers: { body: true, sleeves: true, number: true, name: true, logo: true },
    layerOrder: ['number', 'name', 'logo', 'sleeves', 'body'],
    ...overrides,
  };
}

/**
 * A complete, valid payload: ONE line of 11 jerseys, priced at 31300 with express delivery.
 *
 * Until Phase 5 this returned the legacy `{ design, totalKits, primarySize }` body and was the
 * default fixture for most of this suite. It now returns the cart shape with a single line, which
 * keeps every call site that only cared about "a valid order" — country rules, logo handling,
 * idempotency, validation — asserting exactly what it asserted before, against the only shape the
 * API still accepts. The 31300 figure is unchanged, which is the point: 11 jerseys cost the same
 * whichever shape asked.
 */
function validOrder({ design, contact, address, root, size = 'M', quantity = 11 } = {}) {
  return {
    items: [{ design: baseDesign(design), size, quantity }],
    contact: {
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
      phone: '+92 300 1234567', clubName: '',
      ...contact,
    },
    address: {
      street: '12 Mall Road', city: 'Lahore', province: '', postalCode: '', country: 'Pakistan',
      ...address,
    },
    deliveryId: 'express', paymentId: 'cod', instructions: '',
    ...root,
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

  // The quote tests need a signed-in user, so this suite now creates accounts too. Scoped to the
  // exact prefixes it uses — orders.user_id is ON DELETE SET NULL, so this cannot orphan an order.
  await pool.execute(
    'DELETE FROM users WHERE email LIKE ? OR email LIKE ?',
    ['quote-%@example.com', 'floor-%@example.com'],
  );

  await closePool();
});

/** The same 11 kits as validOrder, split across two lines: 6 jerseys + 5 shorts. */
function cartOrder(overrides = {}) {
  return {
    ...validOrder(),
    items: [
      { design: baseDesign(), size: 'M', quantity: 6 },
      { design: baseDesign({ kitType: 'shorts', kitProduct: 'Football Shorts' }), size: 'L', quantity: 5 },
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
   * RULE 2 ACROSS SEVERAL LINES. The single-line equivalent lives under "the client never sets the
   * price" below; this one exists because a multi-line cart has more places for a tampered figure
   * to land — the header total, and every line's own money.
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
      items: [{ design: baseDesign(), size: 'M', quantity: 2 }],
    }));
    expect(res.status).toBe(422);
  });
});

/**
 * A one-line cart is not a special case. It takes the same path as a twenty-line one and writes
 * one row to order_items, not a shortcut back into the singular columns migration 008 dropped.
 */
describe('POST /api/orders — a single-line cart', () => {
  it('writes exactly one line, with the design and money on it', async () => {
    const res = await request(app).post('/api/orders').send(validOrder());
    expect(await countItems(res.body.id)).toBe(1);

    const [[line]] = await pool.execute(
      `SELECT position, quantity, size, kit_type, unit_price, line_total, design_json
       FROM order_items WHERE order_id = ?`,
      [res.body.id],
    );
    expect(line).toMatchObject({
      position: 1, quantity: 11, size: 'M', kit_type: 'jersey',
      unit_price: 2800, line_total: 30800,
    });
    // mysql2 parses JSON columns already — never JSON.parse them.
    expect(line.design_json.kitType).toBe('jersey');
  });

  it('returns the same per-line pricing shape as a multi-line cart', async () => {
    const res = await request(app).post('/api/orders').send(validOrder());
    expect(res.body.pricing.items).toHaveLength(1);
    expect(res.body.pricing.items[0]).toMatchObject({ position: 1, unitPrice: 2800, lineTotal: 30800 });
    expect(res.body.pricing.totalKits).toBe(11);
  });
});

describe('POST /api/orders — idempotent replay inserts no duplicate lines', () => {
  it.each([
    ['two-line', cartOrder, 2],
    ['one-line', validOrder, 1],
  ])('%s cart: the same key returns the original order and no extra lines', async (_label, build, expectedLines) => {
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

/**
 * THE USER-VISIBLE PROOF OF PHASE 5.
 *
 * An old client — a stale tab, a cached bundle — still sends `{ design, totalKits, primarySize }`.
 * That body is now simply wrong, and what matters is that it fails as something a developer can
 * read: the unrecognized keys named, and `items` reported missing. A generic "Invalid input" here
 * (which is what a z.union would have produced, and why the removed router was hand-written) would
 * send whoever hits this hunting through the wrong layer.
 */
describe('POST /api/orders — the legacy single-design body is rejected', () => {
  const legacyBody = () => ({
    design: baseDesign(),
    contact: {
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
      phone: '+92 300 1234567', clubName: '',
    },
    address: {
      street: '12 Mall Road', city: 'Lahore', province: '', postalCode: '', country: 'Pakistan',
    },
    deliveryId: 'express', paymentId: 'cod', totalKits: 11, primarySize: 'M', instructions: '',
  });

  it('names the unrecognized keys and the missing items array, and creates nothing', async () => {
    const [[before]] = await pool.execute('SELECT COUNT(*) AS n FROM orders');

    const res = await request(app).post('/api/orders').send(legacyBody());

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).not.toMatch(/Invalid input/);

    // Both halves of what is wrong with the body, in the machine-readable form the frontend reads.
    const reported = JSON.stringify(res.body.details);
    expect(reported).toMatch(/design/);
    expect(reported).toMatch(/totalKits/);
    expect(reported).toMatch(/primarySize/);
    expect(res.body.details.items).toBeTruthy();

    const [[after]] = await pool.execute('SELECT COUNT(*) AS n FROM orders');
    expect(after.n).toBe(before.n);
  });
});

describe('POST /api/orders/quote', () => {
  let token;

  beforeAll(async () => {
    const email = `quote-${Date.now()}@example.com`;
    const password = 'Str0ng-Passw0rd!';
    await request(app).post('/api/auth/register').send({ name: 'Quoter', email, password });
    await pool.execute(
      'UPDATE users SET email_verified_at = NOW() WHERE email = ? AND email LIKE ?',
      [email, 'quote-%@example.com'],
    );
    const res = await request(app).post('/api/auth/login').send({ email, password });
    token = res.body.token;
  });

  const quote = (body) => request(app).post('/api/orders/quote')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

  const quoteBody = (items, deliveryId = 'standard') => ({ items, deliveryId });
  const line = (over = {}) => ({ design: baseDesign(), size: 'M', quantity: 6, ...over });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/orders/quote').send(quoteBody([line()]));
    expect(res.status).toBe(401);
  });

  it('prices a multi-line cart and creates NOTHING', async () => {
    const [[before]] = await pool.execute('SELECT COUNT(*) AS n FROM orders');

    const res = await quote(quoteBody([
      line({ quantity: 6 }),
      line({ design: { ...baseDesign(), kitType: 'shorts' }, size: 'L', quantity: 5 }),
    ]));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.totalKits).toBe(11);
    expect(res.body.kitPrice).toBe(2800 * 6 + 1500 * 5);

    const [[after]] = await pool.execute('SELECT COUNT(*) AS n FROM orders');
    expect(after.n).toBe(before.n);   // no order row, no lines, nothing persisted
  });

  /**
   * The case that argued for enforceMinimum: a cart below the 5-kit floor must still return
   * prices, or the page has nothing to display while the user is deciding whether to add more —
   * and a page that cannot get prices from the server computes them itself, which is what rule 2
   * forbids.
   */
  it('prices a cart below the minimum and says so, rather than refusing', async () => {
    const res = await quote(quoteBody([line({ quantity: 3 })]));

    expect(res.status).toBe(200);
    expect(res.body.totalKits).toBe(3);
    expect(res.body.kitPrice).toBe(2800 * 3);
    expect(res.body.belowMinimum).toBe(true);
    // Served so the cart page renders "add N more" from this, never from a hardcoded 5.
    expect(res.body.minimumKits).toBe(5);
  });

  /**
   * The checkout selector shows every delivery method so the user can compare, while a quote
   * prices only the selected one. Without this the frontend would need its own price table beside
   * the server's — the exact second table BASE_PRICES was deleted to remove.
   */
  it('returns every active delivery option with its price, for the selector', async () => {
    const res = await quote(quoteBody([line()]));

    expect(res.status).toBe(200);
    expect(res.body.deliveryOptions.map((o) => o.id).sort())
      .toEqual(['express', 'international', 'rush', 'standard']);
    expect(res.body.deliveryOptions.find((o) => o.id === 'standard').price).toBe(0);
    expect(res.body.deliveryOptions.find((o) => o.id === 'international').price).toBe(3500);
    // Cheapest first, so the list order does not depend on insertion order.
    const prices = res.body.deliveryOptions.map((o) => o.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('omits a deactivated delivery method from the options', async () => {
    await pool.execute("UPDATE delivery_methods SET is_active = 0 WHERE id = 'rush'");
    try {
      const res = await quote(quoteBody([line()]));
      expect(res.body.deliveryOptions.map((o) => o.id)).not.toContain('rush');
    } finally {
      await pool.execute("UPDATE delivery_methods SET is_active = 1 WHERE id = 'rush'");
    }
  });

  it('reports belowMinimum false once the cart reaches the floor', async () => {
    const res = await quote(quoteBody([line({ quantity: 5 })]));
    expect(res.body.belowMinimum).toBe(false);
    expect(res.body.minimumKits).toBe(5);
  });

  it('still refuses a cart over the ceiling, with a message about the ceiling', async () => {
    const res = await quote(quoteBody([line({ quantity: 500 }), line({ design: { ...baseDesign(), kitType: 'cap' }, quantity: 1 })]));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PRICING_INVALID_QUANTITY');
    // The floor and ceiling messages diverged when the flag split them; a 501-kit cart must not be
    // told about a 5-kit minimum.
    expect(res.body.message).toMatch(/cannot exceed 500/);
    expect(res.body.message).not.toMatch(/at least 5/);
  });

  /**
   * THE NARROW CATCH. A bare catch around computeCartPricing would fold every pricing error into
   * QUOTE_UNAVAILABLE — the right status with a message naming the wrong problem.
   */
  it('surfaces an unknown deliveryId as itself, not as QUOTE_UNAVAILABLE', async () => {
    const res = await quote(quoteBody([line()], 'teleport'));
    // Caught by the schema enum before pricing, which is the correct layer.
    expect(res.status).toBe(422);
    expect(res.body.code).not.toBe('QUOTE_UNAVAILABLE');
  });

  it('surfaces a deactivated delivery method as PRICING_UNKNOWN_DELIVERY, not QUOTE_UNAVAILABLE', async () => {
    await pool.execute("UPDATE delivery_methods SET is_active = 0 WHERE id = 'rush'");
    try {
      const res = await quote(quoteBody([line()], 'rush'));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PRICING_UNKNOWN_DELIVERY');
      expect(res.body.code).not.toBe('QUOTE_UNAVAILABLE');
    } finally {
      await pool.execute("UPDATE delivery_methods SET is_active = 1 WHERE id = 'rush'");
    }
  });

  it('names every unavailable kit type at once, not one per reload', async () => {
    await pool.execute("UPDATE kit_prices SET is_active = 0 WHERE kit_type IN ('socks', 'cap')");
    try {
      const res = await quote(quoteBody([
        line({ design: { ...baseDesign(), kitType: 'socks' } }),
        line(),
        line({ design: { ...baseDesign(), kitType: 'cap' } }),
      ]));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('QUOTE_UNAVAILABLE');
      expect(res.body.details.unavailableKitTypes.sort()).toEqual(['cap', 'socks']);
    } finally {
      await pool.execute("UPDATE kit_prices SET is_active = 1 WHERE kit_type IN ('socks', 'cap')");
    }
  });

  it('names a line whose uploaded logo has been swept away', async () => {
    const res = await quote(quoteBody([
      line(),
      line({ design: { ...baseDesign(), logoDataUrl: '/static/logos/ffffffff-ffff-4fff-8fff-ffffffffffff.webp' } }),
    ]));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('QUOTE_UNAVAILABLE');
    expect(res.body.details.missingLogoPositions).toEqual([2]);   // 1-based, matching order_items
  });

  it('reports a missing logo AND a retired kit together', async () => {
    await pool.execute("UPDATE kit_prices SET is_active = 0 WHERE kit_type = 'socks'");
    try {
      const res = await quote(quoteBody([
        line({ design: { ...baseDesign(), kitType: 'socks' } }),
        line({ design: { ...baseDesign(), logoDataUrl: '/static/logos/ffffffff-ffff-4fff-8fff-ffffffffffff.webp' } }),
      ]));

      // The point of checking logos before pricing: one round trip reports both faults.
      expect(res.body.details.unavailableKitTypes).toEqual(['socks']);
      expect(res.body.details.missingLogoPositions).toEqual([2]);
    } finally {
      await pool.execute("UPDATE kit_prices SET is_active = 1 WHERE kit_type = 'socks'");
    }
  });
});

/**
 * REQUIREMENT 4 — the flag makes the floor optional for DISPLAY and it must stay mandatory for
 * ORDERING. This is the thing most likely to rot: someone adds enforceMinimum: false to the order
 * path to "fix" a failing checkout and the 5-kit floor quietly stops existing.
 */
describe('the 5-kit floor is still mandatory for ordering', () => {
  it.each([
    ['one-line', () => validOrder({ quantity: 3 })],
    ['two-line', () => cartOrder({
      items: [
        { design: baseDesign(), size: 'M', quantity: 2 },
        { design: baseDesign({ kitType: 'cap' }), size: 'M', quantity: 2 },
      ],
    })],
  ])('%s cart: a sub-5-kit order is rejected', async (_label, build) => {
    const res = await request(app).post('/api/orders').send(build());
    expect(res.status).toBe(422);
  });

  it('a 3-kit cart QUOTES fine but does not ORDER — the two must disagree', async () => {
    const items = [{ design: baseDesign(), size: 'M', quantity: 3 }];

    const email = `floor-${Date.now()}@example.com`;
    await request(app).post('/api/auth/register').send({ name: 'Floor', email, password: 'Str0ng-Passw0rd!' });
    await pool.execute(
      'UPDATE users SET email_verified_at = NOW() WHERE email = ? AND email LIKE ?',
      [email, 'floor-%@example.com'],
    );
    const login = await request(app).post('/api/auth/login').send({ email, password: 'Str0ng-Passw0rd!' });

    const quoted = await request(app).post('/api/orders/quote')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ items, deliveryId: 'standard' });
    const ordered = await request(app).post('/api/orders').send(cartOrder({ items }));

    expect(quoted.status).toBe(200);      // priced for display
    expect(quoted.body.belowMinimum).toBe(true);
    expect(ordered.status).toBe(422);     // refused for real
  });
});

/**
 * THE INVARIANT PHASE 5 SPENT.
 *
 * Because no order can exist without lines, order history and every future read can go to
 * order_items alone — no "if the order has no lines, fall back to the singular columns" branch,
 * which is what let migration 008 drop those columns outright. The invariant now has to HOLD
 * rather than merely be true: nothing remains to fall back to.
 *
 * Self-contained: it places orders first, then asserts across every row in the database —
 * including the ones migration 007 backfilled and everything this suite made.
 */
describe('every order has at least one line', () => {
  it('LEFT JOIN order_items finds no orphan header', async () => {
    const single = await request(app).post('/api/orders').send(validOrder());
    const cart = await request(app).post('/api/orders').send(cartOrder());
    expect(single.status).toBe(201);
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
    expect(res.body.pricing.items[0].unitPrice).toBe(2800);
    expect(res.body.pricing.kitPrice).toBe(30800);
    expect(res.body.pricing.deliveryPrice).toBe(500);
    expect(res.body.pricing.discount).toBe(0);
  });

  it('persists the server total, not the client one', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({
      root: { pricing: { total: 1 } },
    }));
    const [[row]] = await pool.execute(
      'SELECT total_price FROM orders WHERE reference = ?', [res.body.reference],
    );
    expect(row.total_price).toBe(31300);

    // The per-line money is server-computed too — tampering reaches order_items no more than it
    // reaches the header.
    const [[line]] = await pool.execute(
      'SELECT unit_price, line_total FROM order_items WHERE order_id = ?', [res.body.id],
    );
    expect(line).toMatchObject({ unit_price: 2800, line_total: 30800 });
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
      'SELECT design_json FROM order_items WHERE order_id = ?', [res.body.id],
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
      'SELECT design_json FROM order_items WHERE order_id = ?', [res.body.id],
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

  it('rejects a cart below the 5-kit minimum', async () => {
    const res = await request(app).post('/api/orders').send(validOrder({ quantity: 4 }));
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
