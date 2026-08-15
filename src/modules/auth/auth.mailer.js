import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { transport } from '../../utils/mailer.js';
import {
  renderEmailHtml, logoAttachment, escapeHtml, SIGN_OFF_TEXT,
} from '../../utils/emailTemplate.js';
import { CODE_TTL_SECONDS } from './auth.verification.js';

/**
 * DEVELOPMENT-ONLY AFFORDANCE — see docs/known-gaps.md, "Verification codes logged in dev".
 *
 * Prints the 6-digit code to the server console so the signup flow can be completed without SMTP
 * credentials. A verification code is a live credential: in production this would put a working
 * account-takeover token into plaintext logs, log aggregators, and anything shipping those logs
 * off-box. It is therefore gated on an exact NODE_ENV === 'development' match — deliberately NOT
 * `!isProduction`, which would also be true under NODE_ENV=test.
 *
 * The flag is resolved once, here, and the logging branch returns before the transport is ever
 * touched — so the code-logging path and the real sending path are mutually exclusive rather than
 * merely conditional.
 */
const DEV_CODE_LOGGING = env.NODE_ENV === 'development';

// Defence in depth: if the two conditions ever disagree, refuse to start rather than leak.
if (DEV_CODE_LOGGING && env.isProduction) {
  throw new Error('Refusing to boot: dev code logging enabled in a production environment.');
}

/** Exported for auth.mailer.test.js — pure, so message content is verifiable without a real
 *  SMTP transport or touching the module-level singleton in utils/mailer.js. */
export function buildVerificationMessage({ to, code, name }) {
  const minutes = Math.round(CODE_TTL_SECONDS / 60);
  const safeName = escapeHtml(name);

  const bodyRowsHtml = `
            <tr>
              <td align="center" style="padding:12px 32px 24px;color:#aaaaaa;font-size:14px;line-height:1.6;">
                Hi ${safeName}, use the code below to finish setting up your D Sports Hub account.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 24px;">
                <div style="display:inline-block;background-color:#0d0d0d;border:1px solid #3d3d3d;border-radius:6px;padding:16px 28px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#F5A623;">
                  ${code}
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 24px;color:#888888;font-size:12px;line-height:1.6;">
                This code expires in ${minutes} minutes. If you didn't create an account, you can safely ignore this email.
              </td>
            </tr>`;

  return {
    from: env.SMTP_FROM,
    to,
    subject: `${code} is your D Sports Hub verification code`,
    text: `Hi ${name},\n\n`
      + `Your verification code is ${code}.\n\n`
      + `It expires in ${minutes} minutes. If you didn't create an account, you can ignore this email.\n\n`
      + SIGN_OFF_TEXT,
    html: renderEmailHtml({ heading: 'Verify your email', bodyRowsHtml }),
    attachments: [logoAttachment()],
  };
}

/**
 * Sent once verification actually succeeds (auth.service.js's verifyEmail) — distinct from the
 * code email above, which is sent BEFORE verification and can be requested repeatedly (resend).
 * This one fires exactly once per account, the moment it becomes usable.
 */
export function buildWelcomeMessage({ to, name }) {
  const safeName = escapeHtml(name);

  const bodyRowsHtml = `
            <tr>
              <td align="center" style="padding:12px 32px 8px;color:#F5A623;font-size:15px;font-weight:bold;">
                ✓ Email verified
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 24px;color:#aaaaaa;font-size:14px;line-height:1.6;">
                Welcome, ${safeName} — your account is ready. Head back to D Sports Hub to design your kit and place an order whenever you're ready.
              </td>
            </tr>`;

  return {
    from: env.SMTP_FROM,
    to,
    subject: "You're verified — welcome to D Sports Hub!",
    text: `Hi ${name},\n\n`
      + "Your email is verified and your account is ready to go.\n\n"
      + SIGN_OFF_TEXT,
    html: renderEmailHtml({ heading: 'Email verified', bodyRowsHtml }),
    attachments: [logoAttachment()],
  };
}

/**
 * Never rejects. Callers fire-and-forget this so SMTP latency cannot slow or fail the request
 * that triggered it — the trade-off being that a delivery failure is invisible to the user until
 * they use "resend".
 */
export async function sendVerificationEmail({ to, code, name }) {
  if (DEV_CODE_LOGGING) {
    // Intentionally logs the credential. Development only — never reached in prod or test.
    logger.warn(
      { to, code },
      'DEV ONLY: verification code logged because no SMTP is configured. Never enable outside development.',
    );
    return;
  }

  if (!transport) {
    // Reachable in test, or a non-prod env with SMTP unset. Production cannot get here: env.js
    // refuses to boot without SMTP_HOST when NODE_ENV=production.
    logger.warn({ to }, 'Verification email suppressed: no SMTP configured.');
    return;
  }

  try {
    await transport.sendMail(buildVerificationMessage({ to, code, name }));
    logger.info({ to }, 'Verification email sent');
  } catch (err) {
    // Log the failure, never the code.
    logger.error({ err, to }, 'Verification email failed to send');
  }
}

/**
 * Never rejects, same reasoning as sendVerificationEmail. No dev-console fallback here — there is
 * no credential in this email, so there is nothing sensitive to leak and nothing a developer needs
 * printed to keep testing; it simply doesn't send without SMTP configured, same as any other
 * non-credential email in this app (see orders.mailer.js).
 */
export async function sendVerificationSuccessEmail({ to, name }) {
  if (!transport) {
    logger.warn({ to }, 'Welcome email suppressed: no SMTP configured.');
    return;
  }

  try {
    await transport.sendMail(buildWelcomeMessage({ to, name }));
    logger.info({ to }, 'Welcome email sent');
  } catch (err) {
    logger.error({ err, to }, 'Welcome email failed to send');
  }
}
