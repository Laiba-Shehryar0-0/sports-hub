import { describe, it, expect, afterAll } from 'vitest';
import { computePricing } from './pricing.service.js';
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
