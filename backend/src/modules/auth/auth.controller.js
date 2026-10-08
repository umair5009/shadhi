const authService = require('./auth.service');
const {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} = require('../../services/tokens');

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
  if (refreshToken) res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

function clearAuthCookies(res) {
  const { maxAge: _ignored, ...refreshOptions } = refreshCookieOptions();
  res.clearCookie(ACCESS_COOKIE, accessCookieOptions());
  res.clearCookie(REFRESH_COOKIE, refreshOptions);
}

async function login(req, res) {
  const result = await authService.login(req.valid.body, requestMeta(req));
  setAuthCookies(res, result);
  res.json({ data: result.profile });
}

async function refresh(req, res) {
  try {
    const tokens = await authService.refresh(req.cookies?.[REFRESH_COOKIE], requestMeta(req));
    setAuthCookies(res, tokens);
    res.json({ data: { ok: true } });
  } catch (error) {
    clearAuthCookies(res);
    throw error;
  }
}

async function logout(req, res) {
  await authService.logoutByRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  clearAuthCookies(res);
  res.json({ data: { ok: true } });
}

async function me(req, res) {
  res.json({ data: await authService.buildProfile(req.ctx.userId) });
}

async function forgotPassword(req, res) {
  await authService.forgotPassword(req.valid.body);
  res.json({ data: { message: 'If an account exists for that email, a reset link has been sent.' } });
}

async function resetPassword(req, res) {
  await authService.resetPassword(req.valid.body);
  clearAuthCookies(res);
  res.json({ data: { message: 'Your password has been reset. Please sign in.' } });
}

async function changePassword(req, res) {
  const accessToken = await authService.changePassword(req.ctx, req.valid.body);
  setAuthCookies(res, { accessToken });
  res.json({ data: { message: 'Password changed. Other devices have been signed out.' } });
}

async function listSessions(req, res) {
  res.json({ data: await authService.listSessions(req.ctx) });
}

async function revokeSession(req, res) {
  await authService.revokeSession(req.ctx, req.valid.params.id);
  res.json({ data: { ok: true } });
}

module.exports = { login, refresh, logout, me, forgotPassword, resetPassword, changePassword, listSessions, revokeSession };
