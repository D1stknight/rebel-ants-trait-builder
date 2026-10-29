// POST /api/admin/sso  (form fields: ticket, target) — opened by the Rebel Console.
// The ticket is checked with the economy (REBEL_BADGES_KEY, scope "builder.admin"); if real, the
// browser gets an 8-hour admin pass where the admin pages keep their key, and lands on the admin
// page: target "contest" → /contest/admin.html, "builder" → /?admin=1.
const { makePass } = require('../_lib/adminPass');

const economyBase = () => String(process.env.REBEL_ECONOMY_URL || process.env.ECONOMY_BASE_URL || 'https://economy.rebelants.io').replace(/\/+$/, '');

function readBody(req){
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > 4000) s = s.slice(0, 4000); });
    req.on('end', () => {
      const out = {};
      for (const part of s.split('&')) { const [k, v] = part.split('='); if (k) out[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' ')); }
      resolve(out);
    });
    req.on('error', () => resolve({}));
  });
}

function page(res, status, body){
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.status(status).send("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Builder admin</title><body style='background:#15120e;color:#f3ead6;font:16px system-ui;padding:24px'>" + body);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return page(res, 405, 'Open the Builder admin from the Rebel Console.'); }
  const body = await readBody(req);
  const ticket = String(body.ticket || '');
  const target = body.target === 'builder' ? 'builder' : 'contest';
  const secret = process.env.RA_ADMIN_KEY || '';
  const key = process.env.REBEL_BADGES_KEY || process.env.SERVICE_API_KEY || '';
  if (!secret || !key) return page(res, 503, 'The Builder is not connected to the console yet.');
  if (!/^rat_[A-Za-z0-9_-]{20,96}$/.test(ticket)) return page(res, 400, 'That link did not work. Open the Builder from the Rebel Console again.');
  let ok = false, adminId = 'admin';
  try {
    const r = await fetch(economyBase() + '/api/internal/admin-ticket', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, scope: 'builder.admin' }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json().catch(() => null);
    ok = r.ok && j && j.ok === true && (j.role === 'owner' || j.role === 'admin');
    if (ok && typeof j.adminId === 'string') adminId = j.adminId;
  } catch { ok = false; }
  if (!ok) return page(res, 401, 'That link did not work (it works once, for 2 minutes). Open the Builder from the Rebel Console again.');
  const pass = makePass(secret, adminId);
  const to = target === 'builder' ? '/?admin=1' : '/contest/admin.html';
  return page(res, 200, 'Signing you in…<script>try{localStorage.setItem("ra:adminkey",' + JSON.stringify(pass) + ');localStorage.setItem("ra2_admin_key",' + JSON.stringify(pass) + ')}catch(e){}location.replace(' + JSON.stringify(to) + ')</script>');
};
