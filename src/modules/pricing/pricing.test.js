import { describe, it, expect, afterAll } from 'vitest';
import { computeCartPricing } from './pricing.service.js';
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

afterAll(async () => {
  await closePool();
});

const cartItem = (over = {}) => ({
  kitType: 'jersey', template: 'solid', sport: 'football', size: 'M', quantity: 11, ...over,
});

/**
 * ┌─ PORTED FROM THE DELETED computePricing SUITE (2026-08-13) ───────────────────────────────────┐
 * │ computePricing and its 72-case equivalence matrix went with the legacy order path in Phase 5. │
 * │ The matrix could not be kept: its expected values were produced BY computePricing, so with    │
 * │ that function gone it had nothing to compare against.                                         │
 * │                                                                                               │
 * │ These five are the assertions it had that no computeCartPricing test covered. They are        │
 * │ hand-written literals rather than a characterization, which is the right form now that there  │
 * │ is one implementation instead of two being held level.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe('computeCartPricing — the worked example and the price table', () => {
  it('prices 11 jerseys with express delivery at exactly 31300', async () => {
    const cart = await computeCartPricing({ items: [cartItem()], deliveryId: 'express' });

    // The worked example from docs/API_CONTRACT.md, field for field, now in the cart shape: the
    // per-design figures sit on the line and the money totals on the cart.
    expect(cart).toMatchObject({
      totalKits: 11,
      kitPrice: 30800,
      deliveryName: 'Express Delivery',
      deliveryPrice: 500,
      discount: 0,
      total: 31300,
    });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({
      position: 1,
      unitPrice: 2800,
      kitLabel: 'Jersey',
      templateName: 'Solid',
      sportLabel: 'Football',
      lineTotal: 30800,
    });
  });

  it('prices each kit type from its own kit_prices row', async () => {
    const expected = { jersey: 2800, polo: 2600, jumper: 3200, shorts: 1500, socks: 600, cap: 1200 };
    for (const [kitType, unitPrice] of Object.entries(expected)) {
      const cart = await computeCartPricing({
        items: [cartItem({ kitType, quantity: 10 })], deliveryId: 'express',
      });
      expect(cart.items[0].unitPrice, kitType).toBe(unitPrice);
      expect(cart.kitPrice, kitType).toBe(unitPrice * 10);
    }
  });

  it('treats standard delivery as free without special-casing it', async () => {
    const cart = await computeCartPricing({
      items: [cartItem({ quantity: 10 })], deliveryId: 'standard',
    });
    expect(cart.deliveryPrice).toBe(0);
    expect(cart.deliveryName).toBe('Standard Delivery');
    expect(cart.total).toBe(cart.kitPrice);
  });

  it('ignores template when pricing — it is a display label only', async () => {
    const solid = await computeCartPricing({
      items: [cartItem({ template: 'solid', quantity: 10 })], deliveryId: 'express',
    });
    const chevron = await computeCartPricing({
      items: [cartItem({ template: 'chevron', quantity: 10 })], deliveryId: 'express',
    });
    expect(chevron.total).toBe(solid.total);
    expect(chevron.items[0].templateName).toBe('Chevron');
  });

  it('stays within INT UNSIGNED at the most expensive possible order', async () => {
    // jumper (3200) x 500 + international (3500) — the largest total the bounds permit.
    const cart = await computeCartPricing({
      items: [cartItem({ kitType: 'jumper', quantity: 500 })], deliveryId: 'international',
    });
    expect(cart.total).toBe(1_603_500);
    expect(cart.total).toBeLessThan(4_294_967_295); // INT UNSIGNED max
    expect(Number.isSafeInteger(cart.total)).toBe(true);
  });
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
