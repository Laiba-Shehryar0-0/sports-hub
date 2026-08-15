import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { transport } from '../../utils/mailer.js';
import {
  renderEmailHtml, logoAttachment, escapeHtml, SIGN_OFF_TEXT,
} from '../../utils/emailTemplate.js';

/** Money is INT whole PKR everywhere in this app — same formatting rule as the rest of the API. */
function formatPKR(n) {
  return `PKR ${Number(n).toLocaleString('en-US')}`;
}

function buildLinesText(items) {
  return items
    .map((item) => `  - ${item.kitLabel} (${item.templateName}, size ${item.size}) x${item.quantity} — ${formatPKR(item.lineTotal)}`)
    .join('\n');
}

function buildLinesHtml(items) {
  return items.map((item) => `
            <tr>
              <td style="padding:8px 32px;color:#ffffff;font-size:13px;border-bottom:1px solid #2a2a2a;">
                ${escapeHtml(item.kitLabel)} <span style="color:#888888;">(${escapeHtml(item.templateName)}, size ${escapeHtml(item.size)})</span> x${item.quantity}
                <span style="float:right;color:#aaaaaa;">${formatPKR(item.lineTotal)}</span>
              </td>
            </tr>`).join('');
}

/**
 * Only for paymentId 'bank'. Reads BANK_NAME/BANK_ACCOUNT_TITLE/BANK_ACCOUNT_NUMBER from config
 * (env.js), never hardcoded here — real account details belong in .env, not source control, and
 * env.js already refuses to boot production with placeholders (see its superRefine).
 */
function bankTransferBlockText(total) {
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

function bankTransferBlockHtml(total) {
  return `
            <tr>
              <td align="center" style="padding:24px 32px 4px;color:#F5A623;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">
                Payment — Bank Transfer
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d0d0d;border:1px solid #3d3d3d;border-radius:6px;">
                  <tr><td style="padding:12px 16px 4px;color:#888888;font-size:11px;">Bank</td></tr>
                  <tr><td style="padding:0 16px 10px;color:#ffffff;font-size:14px;">${escapeHtml(env.BANK_NAME)}</td></tr>
                  <tr><td style="padding:0 16px 4px;color:#888888;font-size:11px;">Account title</td></tr>
                  <tr><td style="padding:0 16px 10px;color:#ffffff;font-size:14px;">${escapeHtml(env.BANK_ACCOUNT_TITLE)}</td></tr>
                  <tr><td style="padding:0 16px 4px;color:#888888;font-size:11px;">Account number</td></tr>
                  <tr><td style="padding:0 16px ${env.BANK_BRANCH ? '10px' : '12px'};color:#ffffff;font-size:14px;">${escapeHtml(env.BANK_ACCOUNT_NUMBER)}</td></tr>
                  ${env.BANK_BRANCH ? `<tr><td style="padding:0 16px 4px;color:#888888;font-size:11px;">Branch</td></tr>
                  <tr><td style="padding:0 16px 12px;color:#ffffff;font-size:14px;">${escapeHtml(env.BANK_BRANCH)}</td></tr>` : ''}
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:4px 32px 24px;color:#aaaaaa;font-size:12px;line-height:1.6;">
                Please transfer ${formatPKR(total)} and reply to this email with your payment receipt.
                Production starts once payment is confirmed.
              </td>
            </tr>`;
}

function codBlockText(total) {
  return `
Payment — Cash on Delivery
---------------------------
Pay ${formatPKR(total)} in cash when your kits are delivered.
`;
}

function codBlockHtml(total) {
  return `
            <tr>
              <td align="center" style="padding:24px 32px 4px;color:#F5A623;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">
                Payment — Cash on Delivery
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:4px 32px 24px;color:#aaaaaa;font-size:13px;">
                Pay ${formatPKR(total)} in cash when your kits are delivered.
              </td>
            </tr>`;
}

/** Exported for orders.mailer.test.js — pure, so message content is verifiable without a real
 *  SMTP transport or touching the module-level singleton in utils/mailer.js. */
export function buildMessage({
  to, order, paymentId, name,
}) {
  const paymentBlockText = paymentId === 'bank'
    ? bankTransferBlockText(order.pricing.total)
    : codBlockText(order.pricing.total);
  const paymentBlockHtml = paymentId === 'bank'
    ? bankTransferBlockHtml(order.pricing.total)
    : codBlockHtml(order.pricing.total);

  const bodyRowsHtml = `
            <tr>
              <td align="center" style="padding:12px 32px 16px;color:#aaaaaa;font-size:14px;">
                Hi ${escapeHtml(name)}, thanks for your order!
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 4px;color:#aaaaaa;font-size:14px;">
                Order reference
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 20px;color:#ffffff;font-size:18px;font-weight:bold;">
                ${escapeHtml(order.reference)}
              </td>
            </tr>
${buildLinesHtml(order.pricing.items)}
            <tr>
              <td style="padding:12px 32px;color:#ffffff;font-size:15px;font-weight:bold;">
                Total <span style="float:right;color:#F5A623;">${formatPKR(order.pricing.total)}</span>
              </td>
            </tr>
${paymentBlockHtml}`;

  return {
    from: env.SMTP_FROM,
    to,
    subject: `Order ${order.reference} confirmed — D Sports Hub`,
    text: `Hi ${name}, thanks for your order!

Order reference: ${order.reference}

Items
-----
${buildLinesText(order.pricing.items)}

Total: ${formatPKR(order.pricing.total)}
${paymentBlockText}
Questions? Reply to this email.

${SIGN_OFF_TEXT}`,
    html: renderEmailHtml({ heading: 'Order confirmed', bodyRowsHtml }),
    attachments: [logoAttachment()],
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
export async function sendOrderConfirmationEmail({
  to, order, paymentId, name,
}) {
  if (!transport) {
    logger.warn({ to, reference: order.reference }, 'Order confirmation email suppressed: no SMTP configured.');
    return;
  }

  try {
    await transport.sendMail(buildMessage({
      to, order, paymentId, name,
    }));
    logger.info({ to, reference: order.reference }, 'Order confirmation email sent');
  } catch (err) {
    logger.error({ err, reference: order.reference }, 'Order confirmation email failed to send');
  }
}
