// api/auth/sign-out.js
const { nameSessionClearCookie } = require('../_lib/nameSession');
module.exports = async (_req, res) => {
  res.setHeader('Set-Cookie', nameSessionClearCookie());
  return res.status(200).json({ ok: true });
};
