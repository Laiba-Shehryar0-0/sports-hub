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

const send = (over = {}) => buildMessage({
  to: 'jane@example.com', order: order(), paymentId: 'cod', name: 'Jane Doe', ...over,
});

describe('orders.mailer buildMessage', () => {
  it('greets the customer by name, in both text and html', () => {
    const msg = send();
    expect(msg.text).toContain('Hi Jane Doe');
    expect(msg.html).toContain('Jane Doe');
  });

  it('subject and body carry the order reference, in both text and html', () => {
    const msg = send();
    expect(msg.to).toBe('jane@example.com');
    expect(msg.subject).toContain('KW-2026-000044');
    expect(msg.text).toContain('KW-2026-000044');
    expect(msg.html).toContain('KW-2026-000044');
  });

  it('lists every line with its label, template, size, quantity and price, in both text and html', () => {
    const msg = send();
    expect(msg.text).toContain('Jersey (Solid, size M) x6 — PKR 16,800');
    expect(msg.text).toContain('Total: PKR 24,800');
    expect(msg.html).toContain('Jersey');
    expect(msg.html).toContain('Solid');
    expect(msg.html).toContain('PKR 16,800');
    expect(msg.html).toContain('PKR 24,800');
  });

  it('a bank order includes the configured account details, never hardcoded ones, in both text and html', () => {
    const msg = send({ paymentId: 'bank' });
    expect(msg.text).toContain('Bank Transfer');
    expect(msg.text).toContain(env.BANK_NAME);
    expect(msg.text).toContain(env.BANK_ACCOUNT_TITLE);
    expect(msg.text).toContain(env.BANK_ACCOUNT_NUMBER);
    expect(msg.html).toContain('Bank Transfer');
    expect(msg.html).toContain(env.BANK_NAME);
    expect(msg.html).toContain(env.BANK_ACCOUNT_TITLE);
    expect(msg.html).toContain(env.BANK_ACCOUNT_NUMBER);
  });

  it('a cod order never mentions bank account details, in text or html', () => {
    const msg = send();
    expect(msg.text).toContain('Cash on Delivery');
    expect(msg.text).not.toContain(env.BANK_ACCOUNT_NUMBER);
    expect(msg.html).toContain('Cash on Delivery');
    expect(msg.html).not.toContain(env.BANK_ACCOUNT_NUMBER);
  });

  it('signs off with the shared team sign-off', () => {
    const msg = send();
    expect(msg.text).toContain('Thank you for choosing us');
    expect(msg.text).toContain('Team D Sports Hub');
    expect(msg.html).toContain('Thank you for choosing us');
    expect(msg.html).toContain('Team D Sports Hub');
  });

  it('embeds the logo as a CID attachment, not a remote URL', () => {
    const msg = send();
    expect(msg.attachments).toHaveLength(1);
    expect(msg.html).toContain(`cid:${msg.attachments[0].cid}`);
    expect(msg.html).not.toMatch(/src="https?:\/\//);
  });

  /**
   * kitLabel/templateName/size are catalog-derived (kit_prices, DESIGN_TEMPLATES) today, but
   * nothing stops a future field from becoming freer text, and this is an HTML document either
   * way — the same reasoning auth.mailer.js's name-escaping test already applies.
   */
  it('escapes HTML-significant characters in line item fields', () => {
    const msg = send({
      order: order({
        pricing: {
          total: 100,
          items: [{ kitLabel: '<script>alert(1)</script>', templateName: 'Solid', size: 'M', quantity: 1, lineTotal: 100 }],
        },
      }),
    });
    expect(msg.html).not.toContain('<script>alert(1)</script>');
    expect(msg.html).toContain('&lt;script&gt;');
  });

  /** `name` is built from contact.firstName/lastName — free text under the schema's own bounds,
   *  not an enum — and lands directly in an HTML document, same risk as auth.mailer.js's name. */
  it('escapes HTML-significant characters in the customer name', () => {
    const msg = send({ name: '<script>alert(1)</script>' });
    expect(msg.html).not.toContain('<script>alert(1)</script>');
    expect(msg.html).toContain('&lt;script&gt;');
  });
});
