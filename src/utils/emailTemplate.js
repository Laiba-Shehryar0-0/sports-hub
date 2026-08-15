import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The shared shell every transactional email in this app renders through — logo header, dark
 * brand theme, and the sign-off footer. One place, not one copy per mailer (auth's verification
 * code, auth's "you're verified", orders' confirmation): the sign-off wording is still being
 * tuned, and three hand-copied footers is exactly the kind of pair that quietly drifts apart the
 * next time it's edited in one place and not the other two.
 */

const LOGO_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'logo.png');
export const LOGO_CID = 'dsportshub-logo';

/** The one attachment every email needs to embed the logo via cid:LOGO_CID — see the comment on
 *  LOGO_CID's use in renderEmailHtml for why this is a CID attachment, not a remote <img src>. */
export function logoAttachment() {
  return { filename: 'logo.png', path: LOGO_PATH, cid: LOGO_CID };
}

/** Escapes the characters that matter in this app's templates — every interpolated value that can
 *  contain arbitrary user input (a customer's name; nothing else currently is) must go through
 *  this before landing in HTML. */
export function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Appended to every plain-text email body. Kept as one constant so text and HTML can never say
 *  different things, and so the wording only ever needs changing here. */
export const SIGN_OFF_TEXT = 'Thank you for choosing us,\nTeam D Sports Hub';

const SIGN_OFF_HTML = `
            <tr>
              <td align="center" style="padding:20px 32px 32px;border-top:1px solid #2a2a2a;color:#aaaaaa;font-size:13px;line-height:1.6;">
                Thank you for choosing us,<br/><strong style="color:#ffffff;">Team D Sports Hub</strong>
              </td>
            </tr>`;

/**
 * Wraps `heading` + `bodyRowsHtml` (one or more `<tr>...</tr>` strings) in the shared shell:
 * logo, heading, the caller's content, then the sign-off. Same brand palette as
 * kit-frontend/src/index.css's dark theme (gold #F5A623, near-black surfaces) — inlined, not
 * linked, because email clients strip <style> blocks and external stylesheets unpredictably.
 * Table-based layout for the same reason: flexbox/grid support across mail clients (Outlook
 * desktop especially) is not reliable enough to build a transactional email on.
 *
 * The logo is embedded via Content-ID (cid:LOGO_CID), not a remote URL: this app has no public
 * domain during local/test sending, where every email this app sends is actually exercised today,
 * and most mail clients block remote images by default regardless — a linked image would just be
 * broken or prompt "load images?" before it ever appeared.
 */
export function renderEmailHtml({ heading, bodyRowsHtml }) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f0f0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#111111;border:1px solid #2a2a2a;border-radius:8px;">
            <tr>
              <td align="center" style="padding:32px 32px 16px;">
                <img src="cid:${LOGO_CID}" alt="D Sports Hub" width="64" height="64" style="display:block;border-radius:8px;" />
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px;color:#ffffff;font-size:20px;font-weight:bold;">
                ${heading}
              </td>
            </tr>
${bodyRowsHtml}${SIGN_OFF_HTML}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
