import { describe, it, expect, afterAll } from 'vitest';
import { computePricing, computeCartPricing } from './pricing.service.js';
import { MAX_CART_ITEMS } from './pricing.constants.js';
import { pool, closePool } from '../../db/pool.js';
import { env } from '../../config/env.js';

// Guard rail, not decoration: CLAUDE.md requires the suite target kitworld_test and never
// kitworld. If env resolution ever regresses, fail here rather than mutating real data.
describe('test environment', () => {
  it('targets the test database, never kitworld', () => {
    expect(env.NODE_ENV).toBe('test');
    expect(env.DB_NAME).toBe('kitworld_test');
  });
});

const BASE = { kitType: 'jersey', template: 'solid', sport: 'football', deliveryId: 'express' };

afterAll(async () => {
  await closePool();
});

describe('computePricing — the worked example', () => {
  it('prices 11 jerseys with express delivery at exactly 31300', async () => {
    const p = await computePricing({ ...BASE, totalKits: 11 });

    // The full object from docs/API_CONTRACT.md, field for field.
    expect(p).toEqual({
      unitPrice: 2800,
      kitLabel: 'Jersey',
      templateName: 'Solid',
      sportLabel: 'Football',
      kitPrice: 30800,
      deliveryName: 'Express Delivery',
      deliveryPrice: 500,
      discount: 0,
      total: 31300,
    });
  });

  it('returns whole PKR integers for every money field', async () => {
    const p = await computePricing({ ...BASE, totalKits: 11 });
    for (const field of ['unitPrice', 'kitPrice', 'deliveryPrice', 'discount', 'total']) {
      expect(Number.isSafeInteger(p[field]), `${field} must be a safe integer`).toBe(true);
      expect(p[field] % 1, `${field} must have no fractional part`).toBe(0);
    }
  });

  it('applies the discount to kitPrice before adding delivery, not to the grand total', async () => {
    const p = await computePricing({ ...BASE, totalKits: 11 });
    expect(p.total).toBe(p.kitPrice - p.discount + p.deliveryPrice);
    expect(p.discount).toBe(0); // promo codes are out of scope
  });
});

describe('computePricing — pricing comes from the database, not the client', () => {
  it('prices each kit type from its own kit_prices row', async () => {
    const expected = { jersey: 2800, polo: 2600, jumper: 3200, shorts: 1500, socks: 600, cap: 1200 };
    for (const [kitType, unitPrice] of Object.entries(expected)) {
      const p = await computePricing({ ...BASE, kitType, totalKits: 10 });
      expect(p.unitPrice, kitType).toBe(unitPrice);
      expect(p.kitPrice, kitType).toBe(unitPrice * 10);
    }
  });

  it('treats standard delivery as free without special-casing it', async () => {
    const p = await computePricing({ ...BASE, deliveryId: 'standard', totalKits: 10 });
    expect(p.deliveryPrice).toBe(0);
    expect(p.deliveryName).toBe('Standard Delivery');
    expect(p.total).toBe(p.kitPrice);
  });

  it('ignores template when pricing — it is a display label only', async () => {
    const solid = await computePricing({ ...BASE, template: 'solid', totalKits: 10 });
    const chevron = await computePricing({ ...BASE, template: 'chevron', totalKits: 10 });
    expect(chevron.total).toBe(solid.total);
    expect(chevron.templateName).toBe('Chevron');
  });
});

describe('computePricing — rejects what it cannot price', () => {
  it('rejects an unknown kitType instead of falling back to a jersey', async () => {
    await expect(computePricing({ ...BASE, kitType: 'tracksuit', totalKits: 11 }))
      .rejects.toMatchObject({ statusCode: 422, code: 'PRICING_UNKNOWN_KIT_TYPE' });
  });

  it('rejects an invalid deliveryId instead of falling back to free standard shipping', async () => {
    await expect(computePricing({ ...BASE, deliveryId: 'teleport', totalKits: 11 }))
      .rejects.toMatchObject({ statusCode: 422, code: 'PRICING_UNKNOWN_DELIVERY' });
  });

  it('refuses to price a deactivated kit type', async () => {
    await pool.execute("UPDATE kit_prices SET is_active = 0 WHERE kit_type = 'socks'");
    try {
      await expect(computePricing({ ...BASE, kitType: 'socks', totalKits: 11 }))
        .rejects.toMatchObject({ code: 'PRICING_UNKNOWN_KIT_TYPE' });
    } finally {
      await pool.execute("UPDATE kit_prices SET is_active = 1 WHERE kit_type = 'socks'");
    }
  });
});

describe('computePricing — totalKits bounds', () => {
  it('accepts the lower bound of 5', async () => {
    const p = await computePricing({ ...BASE, totalKits: 5 });
    expect(p.kitPrice).toBe(2800 * 5);
    expect(p.total).toBe(14000 + 500);
  });

  it('accepts the upper bound of 500 and stays a safe integer', async () => {
    const p = await computePricing({ ...BASE, totalKits: 500 });
    expect(p.kitPrice).toBe(1_400_000);
    expect(p.total).toBe(1_400_500);
    expect(Number.isSafeInteger(p.total)).toBe(true);
  });

  it('stays within INT UNSIGNED at the most expensive possible order', async () => {
    // jumper (3200) x 500 + international (3500) — the largest total the bounds permit.
    const p = await computePricing({
      ...BASE, kitType: 'jumper', deliveryId: 'international', totalKits: 500,
    });
    expect(p.total).toBe(1_603_500);
    expect(p.total).toBeLessThan(4_294_967_295); // INT UNSIGNED max
  });

  it.each([4, 0, -1, 501, 1000])('rejects totalKits = %i', async (totalKits) => {
    await expect(computePricing({ ...BASE, totalKits }))
      .rejects.toMatchObject({ statusCode: 422, code: 'PRICING_INVALID_QUANTITY' });
  });

  it.each([11.5, NaN, '11', null, undefined])('rejects non-integer totalKits (%s)', async (totalKits) => {
    await expect(computePricing({ ...BASE, totalKits }))
      .rejects.toMatchObject({ code: 'PRICING_INVALID_QUANTITY' });
  });
});

const cartItem = (over = {}) => ({
  kitType: 'jersey', template: 'solid', sport: 'football', size: 'M', quantity: 11, ...over,
});

describe('computeCartPricing — equivalence with computePricing', () => {
  const KIT_TYPES = ['jersey', 'polo', 'jumper', 'shorts', 'socks', 'cap'];
  const DELIVERIES = ['standard', 'express', 'rush', 'international'];
  const QUANTITIES = [5, 11, 500];

  // CHARACTERIZATION TEST. Expected values are produced by computePricing itself, never
  // hand-written — so this asserts the two paths AGREE rather than asserting today's numbers.
  // If either implementation drifts the test fails; if the price table changes it still passes.
  const cases = KIT_TYPES.flatMap((kitType) =>
    DELIVERIES.flatMap((deliveryId) =>
      QUANTITIES.map((quantity) => ({ kitType, deliveryId, quantity }))));

  it.each(cases)(
    'single-item cart matches computePricing: $kitType x$quantity via $deliveryId',
    async ({ kitType, deliveryId, quantity }) => {
      const single = await computePricing({
        kitType, template: 'solid', sport: 'football', totalKits: quantity, deliveryId,
      });
      const cart = await computeCartPricing({
        items: [cartItem({ kitType, quantity })], deliveryId,
      });

      // Cart-level figures must be identical.
      expect(cart.kitPrice).toBe(single.kitPrice);
      expect(cart.deliveryName).toBe(single.deliveryName);
      expect(cart.deliveryPrice).toBe(single.deliveryPrice);
      expect(cart.discount).toBe(single.discount);
      expect(cart.total).toBe(single.total);
      expect(cart.totalKits).toBe(quantity);

      // Per-design figures move from the top level onto the line, but keep their values.
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({
        position: 1,
        unitPrice: single.unitPrice,
        kitLabel: single.kitLabel,
        templateName: single.templateName,
        sportLabel: single.sportLabel,
        lineTotal: single.kitPrice,
      });
    },
  );
});

describe('computeCartPricing — multi-line arithmetic', () => {
  it('sums lines and charges delivery exactly once', async () => {
    const cart = await computeCartPricing({
      deliveryId: 'express',
      items: [
        cartItem({ kitType: 'jersey', quantity: 11 }),
        cartItem({ kitType: 'shorts', quantity: 11 }),
      ],
    });

    expect(cart.items.map((l) => l.lineTotal)).toEqual([2800 * 11, 1500 * 11]);
    expect(cart.kitPrice).toBe(30800 + 16500);
    expect(cart.deliveryPrice).toBe(500); // once, not per line
    expect(cart.total).toBe(47300 + 500);
    expect(cart.totalKits).toBe(22);
  });

  it('assigns 1-based positions matching order_items.position', async () => {
    const cart = await computeCartPricing({
      deliveryId: 'standard',
      items: [
        cartItem({ kitType: 'cap' }),
        cartItem({ kitType: 'polo' }),
        cartItem({ kitType: 'socks' }),
      ],
    });
    expect(cart.items.map((l) => l.position)).toEqual([1, 2, 3]);
  });

  it('returns whole-PKR integers for every money value', async () => {
    const cart = await computeCartPricing({
      deliveryId: 'rush',
      items: [
        cartItem({ kitType: 'jumper', quantity: 7 }),
        cartItem({ kitType: 'cap', quantity: 3 }),
      ],
    });
    for (const field of ['kitPrice', 'deliveryPrice', 'discount', 'total']) {
      expect(Number.isSafeInteger(cart[field]), field).toBe(true);
    }
    for (const line of cart.items) {
      expect(Number.isSafeInteger(line.unitPrice)).toBe(true);
      expect(Number.isSafeInteger(line.lineTotal)).toBe(true);
    }
  });

  it('applies the discount before delivery, never to it', async () => {
    const cart = await computeCartPricing({ deliveryId: 'international', items: [cartItem()] });
    expect(cart.total).toBe(cart.kitPrice - cart.discount + cart.deliveryPrice);
    expect(cart.discount).toBe(0);
  });
});

describe('computeCartPricing — rejects what it cannot price', () => {
  it('reports EVERY unavailable kit type, not just the first', async () => {
    await expect(computeCartPricing({
      deliveryId: 'express',
      items: [cartItem({ kitType: 'tracksuit' }), cartItem(), cartItem({ kitType: 'hoodie' })],
    })).rejects.toMatchObject({
      statusCode: 422,
      code: 'PRICING_UNKNOWN_KIT_TYPE',
      details: { kitTypes: ['tracksuit', 'hoodie'] },
    });
  });

  it('never prices a short cart when a type is deactivated mid-life', async () => {
    await pool.execute("UPDATE kit_prices SET is_active = 0 WHERE kit_type = 'socks'");
    try {
      await expect(computeCartPricing({
        deliveryId: 'express',
        items: [cartItem({ kitType: 'jersey' }), cartItem({ kitType: 'socks' })],
      })).rejects.toMatchObject({ code: 'PRICING_UNKNOWN_KIT_TYPE' });
    } finally {
      await pool.execute("UPDATE kit_prices SET is_active = 1 WHERE kit_type = 'socks'");
    }
  });

  it('rejects an empty cart', async () => {
    await expect(computeCartPricing({ items: [], deliveryId: 'express' }))
      .rejects.toMatchObject({ code: 'PRICING_EMPTY_CART' });
  });

  it('rejects more than MAX_CART_ITEMS lines', async () => {
    const items = Array.from({ length: MAX_CART_ITEMS + 1 }, () => cartItem({ quantity: 1 }));
    await expect(computeCartPricing({ items, deliveryId: 'express' }))
      .rejects.toMatchObject({ code: 'PRICING_TOO_MANY_ITEMS' });
  });

  it('rejects an invalid deliveryId', async () => {
    await expect(computeCartPricing({ items: [cartItem()], deliveryId: 'teleport' }))
      .rejects.toMatchObject({ code: 'PRICING_UNKNOWN_DELIVERY' });
  });

  it.each([0, -1, 1.5, NaN, '3', null])('rejects a line quantity of %s', async (quantity) => {
    await expect(computeCartPricing({ items: [cartItem({ quantity })], deliveryId: 'express' }))
      .rejects.toMatchObject({ code: 'PRICING_INVALID_QUANTITY' });
  });
});

describe('computeCartPricing — the 5-kit minimum is cart-wide, not per line', () => {
  it('accepts 3 + 2 across two lines', async () => {
    const cart = await computeCartPricing({
      deliveryId: 'express',
      items: [
        cartItem({ kitType: 'jersey', quantity: 3 }),
        cartItem({ kitType: 'shorts', quantity: 2 }),
      ],
    });
    expect(cart.totalKits).toBe(5);
    expect(cart.kitPrice).toBe(2800 * 3 + 1500 * 2);
  });

  it('rejects a cart totalling 4', async () => {
    await expect(computeCartPricing({
      deliveryId: 'express',
      items: [cartItem({ quantity: 2 }), cartItem({ kitType: 'cap', quantity: 2 })],
    })).rejects.toMatchObject({ code: 'PRICING_INVALID_QUANTITY', details: { totalKits: 4 } });
  });

  it('rejects a cart totalling 501 across lines', async () => {
    await expect(computeCartPricing({
      deliveryId: 'express',
      items: [cartItem({ quantity: 500 }), cartItem({ kitType: 'cap', quantity: 1 })],
    })).rejects.toMatchObject({ details: { totalKits: 501 } });
  });
});
