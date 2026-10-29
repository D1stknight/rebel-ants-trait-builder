// api/_lib/adminPass.js — Rebel Console sign-in for the Builder admin (Oct 28, 2026).
// /api/admin/sso checks the console's one-time ticket with the economy and gives the browser an
// "admin pass": rba1.<expires>.<adminId>.<signature>, good for 8 hours, signed with RA_ADMIN_KEY
// (which never leaves the server this way). isAdminRequest accepts a valid pass wherever the old
// key was typed (?admin=...), so every admin route keeps working unchanged.
const { createHmac, timingSafeEqual } = require('crypto');

const PREFIX = 'rba1.';
const TTL_MS = 8 * 60 * 60 * 1000;
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sign = (secret, data) => b64url(createHmac('sha256', 'builder-admin-pass:' + secret).update(data).digest());

function makePass(secret, adminId, now = Date.now()){
  const exp = String(now + TTL_MS);
  const who = String(adminId || 'admin').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'admin';
  const body = exp + '.' + who;
  return PREFIX + body + '.' + sign(secret, body);
}
function checkPass(secret, pass, now = Date.now()){
  if (!secret || typeof pass !== 'string' || !pass.startsWith(PREFIX) || pass.length > 200) return false;
  const parts = pass.slice(PREFIX.length).split('.');
  if (parts.length !== 3) return false;
  const [exp, who, sig] = parts;
  if (!/^\d{13}$/.test(exp) || Number(exp) < now || Number(exp) > now + TTL_MS + 60000) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(secret, exp + '.' + who));
  return a.length === b.length && timingSafeEqual(a, b);
}
module.exports = { PREFIX, makePass, checkPass };
