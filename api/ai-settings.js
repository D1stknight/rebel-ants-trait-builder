// /api/ai-settings.js — runtime-adjustable AI generation pricing.
// GET  -> { ok, costPerGen, source: 'kv'|'env' }   (public read)
// POST -> { costPerGen } (admin only) -> saved to KV, effective immediately.
const { kvGet, kvSet } = require('./_lib/redisAdapter');
const { isAdminRequest } = require('./_lib/adminAuth');

const KEY = 'ra:settings:aiCost';
const envDefault = () => Math.max(0, parseInt(process.env.REBEL_COST_PER_GEN || '25', 10) || 0);

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      let kvVal = null;
      try { kvVal = parseInt(await kvGet(KEY), 10); } catch(_){}
      const fromKv = Number.isFinite(kvVal) && kvVal >= 0;
      return res.status(200).json({ ok: true, costPerGen: fromKv ? kvVal : envDefault(), source: fromKv ? 'kv' : 'env' });
    }
    if (req.method === 'POST') {
      if (!isAdminRequest(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
      let body = {};
      try { body = (typeof req.body === 'string') ? JSON.parse(req.body) : (req.body || {}); } catch(_){}
      const n = parseInt(body.costPerGen, 10);
      if (!Number.isFinite(n) || n < 0 || n > 100000) return res.status(400).json({ ok: false, error: 'bad_cost' });
      await kvSet(KEY, String(n));
      return res.status(200).json({ ok: true, costPerGen: n });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[ai-settings]', e);
    return res.status(500).json({ ok: false, error: 'server' });
  }
};
