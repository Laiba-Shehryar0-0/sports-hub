import { describe, it, expect } from 'vitest';
import { buildVerificationMessage, buildWelcomeMessage } from './auth.mailer.js';

describe('auth.mailer buildVerificationMessage', () => {
  it('greets the user by name and includes the code in both text and html', () => {
    const msg = buildVerificationMessage({ to: 'jane@example.com', code: '123456', name: 'Jane Doe' });
    expect(msg.to).toBe('jane@example.com');
    expect(msg.subject).toContain('123456');
    expect(msg.text).toContain('Hi Jane Doe');
    expect(msg.text).toContain('123456');
    expect(msg.html).toContain('Jane Doe');
    expect(msg.html).toContain('123456');
  });

  it('signs off with the shared team sign-off, in both text and html', () => {
    const msg = buildVerificationMessage({ to: 'jane@example.com', code: '123456', name: 'Jane Doe' });
    expect(msg.text).toContain('Thank you for choosing us');
    expect(msg.text).toContain('Team D Sports Hub');
    expect(msg.html).toContain('Thank you for choosing us');
    expect(msg.html).toContain('Team D Sports Hub');
  });

  it('embeds the logo as a CID attachment, not a remote URL', () => {
    const msg = buildVerificationMessage({ to: 'jane@example.com', code: '123456', name: 'Jane Doe' });
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].cid).toBeTruthy();
    expect(msg.html).toContain(`cid:${msg.attachments[0].cid}`);
    // Never a remote image: this app has no public domain during local/test verification, where
    // this path is actually exercised, and a src="https://..." would just be a broken image.
    expect(msg.html).not.toMatch(/src="https?:\/\//);
  });

  /**
   * `name` is arbitrary user input (registerSchema's nameField only forbids control characters
   * and a leading digit — it does not forbid HTML) landing directly in an HTML document. Without
   * escaping, a name like `<img src=x onerror=alert(1)>` would execute in whatever renders this
   * email as HTML.
   */
  it('escapes HTML-significant characters in the name', () => {
    const msg = buildVerificationMessage({ to: 'jane@example.com', code: '123456', name: '<script>alert(1)</script>' });
    expect(msg.html).not.toContain('<script>alert(1)</script>');
    expect(msg.html).toContain('&lt;script&gt;');
  });
});

/**
 * Distinct from buildVerificationMessage: sent AFTER verification succeeds, not before. Same
 * shared shell (logo, sign-off) — these tests check what's actually different: the subject,
 * heading and copy, not the parts already covered above.
 */
describe('auth.mailer buildWelcomeMessage', () => {
  it('greets the user by name and confirms verification succeeded', () => {
    const msg = buildWelcomeMessage({ to: 'jane@example.com', name: 'Jane Doe' });
    expect(msg.to).toBe('jane@example.com');
    expect(msg.subject.toLowerCase()).toContain('verified');
    expect(msg.text).toContain('Hi Jane Doe');
    expect(msg.html).toContain('Jane Doe');
    expect(msg.html).toContain('verified');
  });

  it('signs off with the same shared sign-off as the verification email', () => {
    const msg = buildWelcomeMessage({ to: 'jane@example.com', name: 'Jane Doe' });
    expect(msg.text).toContain('Thank you for choosing us');
    expect(msg.text).toContain('Team D Sports Hub');
    expect(msg.html).toContain('Thank you for choosing us');
  });

  it('does not mention a verification code — this email is sent after that step is done', () => {
    const msg = buildWelcomeMessage({ to: 'jane@example.com', name: 'Jane Doe' });
    expect(msg.text).not.toMatch(/\bcode\b/i);
  });

  it('embeds the logo the same way the verification email does', () => {
    const msg = buildWelcomeMessage({ to: 'jane@example.com', name: 'Jane Doe' });
    expect(msg.attachments).toHaveLength(1);
    expect(msg.html).toContain(`cid:${msg.attachments[0].cid}`);
  });

  it('escapes HTML-significant characters in the name', () => {
    const msg = buildWelcomeMessage({ to: 'jane@example.com', name: '<script>alert(1)</script>' });
    expect(msg.html).not.toContain('<script>alert(1)</script>');
    expect(msg.html).toContain('&lt;script&gt;');
  });
});
