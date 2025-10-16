// api/overlays/publish.js (CommonJS)
const { kvSet } = require('../_lib/redisAdapter');
const { put } = require('@vercel/blob');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

    // Admin key gate
    const key = String(req.query.admin || '');
    if (!process.env.RA_ADMIN_KEY || key !== process.env.RA_ADMIN_KEY) {
      res.status(401).json({ ok:false, error:'unauthorized' }); return;
    }

    // Read raw request body as text (the exported overlays JSON)
    const raw = await new Promise((resolve, reject) => {
      let data = ''; req.setEncoding('utf8');
      req.on('data', c => data += c); req.on('end', () => resolve(data));
      req.on('error', reject);
    });

    let obj;
    try { obj = JSON.parse(raw); } catch { res.status(400).json({ ok:false, error:'invalid json' }); return; }
    const json = JSON.stringify(obj); // minified

    // Upload to Vercel Blob (public)
    const fname = `overlays/overlays-${Date.now()}.json`;
    const r = await put(fname, json, { access: 'public', contentType: 'application/json' });

    // Save pointer + meta in KV
    const count = Array.isArray(obj.items) ? obj.items.length : 0;
    await kvSet('ra:overlays:url', r.url);
    await kvSet('ra:overlays:meta', { url:r.url, count, ts: Date.now() });

    res.status(200).json({ ok:true, url:r.url, count });
  } catch (e) {
    console.error('[overlays/publish]', e);
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
};
