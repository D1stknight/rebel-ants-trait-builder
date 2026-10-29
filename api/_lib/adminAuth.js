// api/_lib/adminAuth.js — admin authorization for write endpoints.
// Passes when: (a) signed-in commander whose name is in RA_ADMIN_NAMES
// (comma-separated), (b) a Rebel Console admin pass in ?admin=, or (c) the typed key, only with ALLOW_TYPED_ADMIN_KEY=true.
// If NEITHER env is configured: open on previews/local only; production stays closed.
const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('./nameSession');
const { PREFIX: PASS_PREFIX, checkPass } = require('./adminPass');

function adminNames(){
  return String(process.env.RA_ADMIN_NAMES || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
}
function sessionName(req){
  const pid = verifyNameSession(readCookie(req, NAME_SESSION_COOKIE));
  return pid ? pid.slice('name:'.length) : null;
}
function isAdminRequest(req){
  const names = adminNames();
  const legacyKey = process.env.RA_ADMIN_KEY || '';
  if (!names.length && !legacyKey) return process.env.VERCEL_ENV !== 'production'; // never open on the live site
  const n = sessionName(req);
  if (n && names.includes(n)) return true;
  const k = String((req.query && req.query.admin) || '').trim();
  // a Rebel Console admin pass (api/_lib/adminPass.js) counts like the key
  if (legacyKey && k.startsWith(PASS_PREFIX)) return checkPass(legacyKey, k);
  // Oct 28: typing the key itself is switched off (the admin opens from the Rebel Console).
  // ALLOW_TYPED_ADMIN_KEY=true in Vercel turns it back on for emergencies.
  if (process.env.ALLOW_TYPED_ADMIN_KEY !== 'true') return false;
  return !!(legacyKey && k && k === legacyKey);
}
module.exports = { isAdminRequest, sessionName, adminNames };
