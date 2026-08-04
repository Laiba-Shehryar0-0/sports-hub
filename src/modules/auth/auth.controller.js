import { asyncHandler } from '../../utils/asyncHandler.js';
import * as authService from './auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const result = await authService.register({ name, email, password });

  // 200, NOT 201 — deliberate. docs/API_CONTRACT.md pins register's success status at 200, and
  // the contract wins over REST convention per CLAUDE.md. This looks inconsistent next to
  // POST /contact -> 201; that inconsistency is the contract's, not a bug.
  //
  // The body is { user, verification }, NOT { user, token } — registration no longer produces a
  // session. The client must POST /auth/verify with the emailed code to get one.
  res.json(result);
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token, code } = req.body;
  const result = await authService.verifyEmail({
    token,
    code,
    userAgent: req.get('user-agent'),
    ip: req.ip,
  });
  res.json(result);
});

export const resendCode = asyncHandler(async (req, res) => {
  const result = await authService.resendCode({ token: req.body.token });
  res.json(result);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({
    email,
    password,
    userAgent: req.get('user-agent'),
    ip: req.ip,
  });
  res.json(result);
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: authService.toPublicUser(req.user) });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.auth.jti);
  // Not { message: ... } — `message` is this codebase's error channel and a frontend would render
  // it as an error toast. 204 isn't in CLAUDE.md's allowed status list.
  res.json({ success: true });
});
