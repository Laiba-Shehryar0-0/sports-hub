import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { transport } from '../../utils/mailer.js';

/** Money is INT whole PKR everywhere in this app — same formatting rule as the rest of the API. */
function formatPKR(n) {
  return `PKR ${Number(n).toLocaleString('en-US')}`;
}

function buildLines(items) {
  return items
    .map((item) => `  - ${item.kitLabel} (${item.templateName}, size ${item.size}) x${item.quantity} — ${formatPKR(item.lineTotal)}`)
    .join('\n');
}

/**
 * Only for paymentId 'bank'. Reads BANK_NAME/BANK_ACCOUNT_TITLE/BANK_ACCOUNT_NUMBER from config
 * (env.js), never hardcoded here — real account details belong in .env, not source control, and
 * env.js already refuses to boot production with placeholders (see its superRefine).
 */
function bankTransferBlock(total) {
  return `
Payment — Bank Transfer
------------------------
Bank: ${env.BANK_NAME}
Account title: ${env.BANK_ACCOUNT_TITLE}
Account number: ${env.BANK_ACCOUNT_NUMBER}${env.BANK_BRANCH ? `\nBranch: ${env.BANK_BRANCH}` : ''}

Please transfer ${formatPKR(total)} and reply to this email with your payment receipt.
Production starts once payment is confirmed.
`;
}

function codBlock(total) {
  return `
Payment — Cash on Delivery
---------------------------
Pay ${formatPKR(total)} in cash when your kits are delivered.
`;
}

/** Exported for orders.mailer.test.js — pure, so message content is verifiable without a real
 *  SMTP transport or touching the module-level singleton in utils/mailer.js. */
export function buildMessage({ to, order, paymentId }) {
  const paymentBlock = paymentId === 'bank'
    ? bankTransferBlock(order.pricing.total)
    : codBlock(order.pricing.total);

  return {
    from: env.SMTP_FROM,
    to,
    subject: `Order ${order.reference} confirmed — Kit World Sports`,
    text: `Thanks for your order!

Order reference: ${order.reference}

Items
-----
${buildLines(order.pricing.items)}

Total: ${formatPKR(order.pricing.total)}
${paymentBlock}
Questions? Reply to this email.`,
  };
}

/**
 * Never rejects — mirrors auth.mailer.js's sendVerificationEmail exactly, for the same reason:
 * callers fire-and-forget this so SMTP latency/failure can never slow or fail the checkout
 * request that triggered it. A delivery failure is invisible to the customer; that trade-off is
 * accepted here the same way it already is for verification email.
 *
 * Only ever called for a NEWLY created order (orders.service.js's placeOrder, replayed: false
 * branch) — an idempotent replay of the same request must not re-send the confirmation, or a
 * double-click / retried request would email the customer twice for one order.
 */
export async function sendOrderConfirmationEmail({ to, order, paymentId }) {
  if (!transport) {
    logger.warn({ to, reference: order.reference }, 'Order confirmation email suppressed: no SMTP configured.');
    return;
  }

  try {
    await transport.sendMail(buildMessage({ to, order, paymentId }));
    logger.info({ to, reference: order.reference }, 'Order confirmation email sent');
  } catch (err) {
    logger.error({ err, reference: order.reference }, 'Order confirmation email failed to send');
  }
}
