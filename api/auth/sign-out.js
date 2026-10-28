// api/auth/sign-out.js
const { nameSessionClearCookie } = require('../_lib/nameSession');
module.exports = async (req, res) => {
  const cookies = [nameSessionClearCookie()];
  // Shared Rebel sign-in (Discord): the economy sets `poker_session` on
  // .rebelants.io, so this site may expire that copy too (same as the
  // economy's own logout does for the shared-domain copy).
  const host = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(':')[0].toLowerCase();
  if (host === 'rebelants.io' || host.endsWith('.rebelants.io')) {
    cookies.push('poker_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Domain=rebelants.io; HttpOnly; Secure; SameSite=Lax');
  }
  res.setHeader('Set-Cookie', cookies);
  return res.status(200).json({ ok: true });
};
