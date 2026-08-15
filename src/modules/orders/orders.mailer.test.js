import { describe, it, expect } from 'vitest';
import { buildMessage } from './orders.mailer.js';
import { env } from '../../config/env.js';

const order = (over = {}) => ({
  reference: 'KW-2026-000044',
  pricing: {
    total: 24800,
    items: [
      { kitLabel: 'Jersey', templateName: 'Solid', size: 'M', quantity: 6, lineTotal: 16800 },
    ],
  },
  ...over,
});

describe('orders.mailer buildMessage', () => {
  it('subject and body carry the order reference', () => {
    const msg = buildMessage({ to: 'jane@example.com', order: order(), paymentId: 'cod' });
    expect(msg.to).toBe('jane@example.com');
    expect(msg.subject).toContain('KW-2026-000044');
    expect(msg.text).toContain('KW-2026-000044');
  });

  it('lists every line with its label, template, size, quantity and price', () => {
    const msg = buildMessage({ to: 'jane@example.com', order: order(), paymentId: 'cod' });
    expect(msg.text).toContain('Jersey (Solid, size M) x6 — PKR 16,800');
    expect(msg.text).toContain('Total: PKR 24,800');
  });

  it('a bank order includes the configured account details, never hardcoded ones', () => {
    const msg = buildMessage({ to: 'jane@example.com', order: order(), paymentId: 'bank' });
    expect(msg.text).toContain('Bank Transfer');
    expect(msg.text).toContain(env.BANK_NAME);
    expect(msg.text).toContain(env.BANK_ACCOUNT_TITLE);
    expect(msg.text).toContain(env.BANK_ACCOUNT_NUMBER);
  });

  it('a cod order never mentions bank account details', () => {
    const msg = buildMessage({ to: 'jane@example.com', order: order(), paymentId: 'cod' });
    expect(msg.text).toContain('Cash on Delivery');
    expect(msg.text).not.toContain(env.BANK_ACCOUNT_NUMBER);
  });
});
