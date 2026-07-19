// api/_lib/adminAuth.js — admin authorization for write endpoints.
// Passes when: (a) signed-in commander whose name is in RA_ADMIN_NAMES
// (comma-separated), or (b) legacy ?admin=<RA_ADMIN_KEY> query.
// Rollout-safe: if NEITHER env is configured, behaves as before (open).
const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('./nameSession');

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
  if (!names.length && !legacyKey) return true; // legacy open until configured
  const n = sessionName(req);
  if (n && names.includes(n)) return true;
  const k = String((req.query && req.query.admin) || '').trim();
  return !!(legacyKey && k && k === legacyKey);
}
module.exports = { isAdminRequest, sessionName, adminNames };
