// POST /api/admin/pass  { ticket } — server-to-server, for the Rebel Console's contest page.
// The console sends a one-time admin ticket (scope "builder.console"); after the economy confirms
// it, the Builder answers with an 8-hour admin pass the console then uses as ?admin= on the
// existing contest routes (start, close, delete, judge, confirm-winners). No key leaves the server.
const { makePass } = require('../_lib/adminPass');

const economyBase = () => String(process.env.REBEL_ECONOMY_URL || process.env.ECONOMY_BASE_URL || 'https://economy.rebelants.io').replace(/\/+$/, '');

function readJSON(req){
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > 2000) s = s.slice(0, 2000); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const body = await readJSON(req);
  const ticket = String(body.ticket || '');
  const secret = process.env.RA_ADMIN_KEY || '';
  const key = process.env.REBEL_BADGES_KEY || process.env.SERVICE_API_KEY || '';
  if (!secret || !key) return res.status(503).json({ ok: false, error: 'not_connected' });
  if (!/^rat_[A-Za-z0-9_-]{20,96}$/.test(ticket)) return res.status(400).json({ ok: false, error: 'bad_ticket' });
  try {
    const r = await fetch(economyBase() + '/api/internal/admin-ticket', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, scope: 'builder.console' }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json().catch(() => null);
    if (!(r.ok && j && j.ok === true && (j.role === 'owner' || j.role === 'admin'))) return res.status(401).json({ ok: false, error: 'unauthorized' });
    return res.status(200).json({ ok: true, pass: makePass(secret, typeof j.adminId === 'string' ? j.adminId : 'admin') });
  } catch {
    return res.status(502).json({ ok: false, error: 'economy_unreachable' });
  }
};
