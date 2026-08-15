import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { transport } from '../../utils/mailer.js';
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

function buildMessage(to, code) {
  const minutes = Math.round(CODE_TTL_SECONDS / 60);
  return {
    from: env.SMTP_FROM,
    to,
    subject: `${code} is your Kit World Sports verification code`,
    text: `Your verification code is ${code}.\n\n`
      + `It expires in ${minutes} minutes. If you didn't create an account, you can ignore this email.`,
  };
}

/**
 * Never rejects. Callers fire-and-forget this so SMTP latency cannot slow or fail the request
 * that triggered it — the trade-off being that a delivery failure is invisible to the user until
 * they use "resend".
 */
export async function sendVerificationEmail({ to, code }) {
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
    await transport.sendMail(buildMessage(to, code));
    logger.info({ to }, 'Verification email sent');
  } catch (err) {
    // Log the failure, never the code.
    logger.error({ err, to }, 'Verification email failed to send');
  }
}
