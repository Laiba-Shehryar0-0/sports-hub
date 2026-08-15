import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

/**
 * The one SMTP transport for the whole app — shared by every module that sends email (auth
 * verification codes today, order confirmations as of 2026-08-15). One connection pool, not one
 * per module: a second nodemailer transport built from the identical SMTP_* config would open
 * redundant connections for no benefit.
 *
 * null when SMTP_HOST is unset. Deliberately not wrapped in a "sendMail" helper here — auth's
 * dev-only code-logging fallback (see auth.mailer.js) and orders' plain suppress-and-warn each
 * need different behaviour when there is no transport, so each module keeps its own thin
 * send/log/suppress logic and only the transport itself is shared.
 */
export const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // implicit TLS on 465; STARTTLS is negotiated otherwise
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  })
  : null;
