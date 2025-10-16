// api/overlays.js  (CommonJS; matches your existing adapter style)
const { kvGet, kvSet } = require('./_lib/redisAdapter');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const pack = await kvGet('ra:overlays:pack');
      return res.status(200).json(pack || { overlays: [], updatedAt: 0, version: 1, source: 'empty' });
    }

    if (req.method === 'PUT') {
      const admin = (req.query && req.query.admin || '').trim();
      if (!admin || admin !== (process.env.RA_ADMIN_KEY || '')) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }

      // Read raw body (no bodyParser in Vercel Node runtime)
      let raw = '';
      await new Promise((resolve, reject) => {
        req.on('data', (c) => raw += c);
        req.on('end', resolve);
        req.on('error', reject);
      });

      let json;
      try { json = JSON.parse(raw || '{}'); }
      catch { return res.status(400).json({ ok:false, error:'bad json' }); }

      // Accept array or { overlays:[...] }
      const overlays = Array.isArray(json.overlays) ? json.overlays
                     : (Array.isArray(json) ? json : null);
      if (!overlays) return res.status(400).json({ ok:false, error:'expected overlays array' });

      const pack = { overlays, updatedAt: Date.now(), version: 1 };
      await kvSet('ra:overlays:pack', pack);
      return res.status(200).json({ ok:true, count: overlays.length });
    }

    return res.status(405).json({ ok:false, error:'method not allowed' });
  } catch (e) {
    console.error('[api/overlays] error:', e);
    return res.status(500).json({ ok:false, error: 'server' });
  }
};
