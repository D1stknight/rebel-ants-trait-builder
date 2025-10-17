// api/overlays.js  (CommonJS, Vercel serverless)
const { kvGet, kvSet, kvDel } = require('./_lib/redisAdapter'); // adjust path if needed

const IDS_KEY = 'ra:overlays:ids';
const itemKey = (id) => `ra:overlay:${id}`;

function uid() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

function normalize(raw) {
  const id  = String(raw.id || uid());
  const name = String(raw.name || 'overlay');
  // accept either `url` (preferred) or `dataURL` (base64)
  const url = raw.url && String(raw.url);
  const dataURL = !url && raw.dataURL ? String(raw.dataURL) : null;
  return { id, name, ...(url ? { url } : {}), ...(dataURL ? { dataURL } : {}) };
}

async function listAll() {
  let ids = await kvGet(IDS_KEY);
  if (!Array.isArray(ids)) ids = [];
  const out = [];
  for (const id of ids) {
    const it = await kvGet(itemKey(id));
    if (it) out.push(it);
  }
  return out;
}

module.exports = async (req, res) => {
  try {
    const adminKey = (req.query.admin || '').trim();
    const method = req.method || 'GET';

    if (method === 'GET') {
      const overlays = await listAll();
      return res.status(200).json({ ok: true, overlays });
    }

    // everything below requires admin
    if (!adminKey || adminKey !== process.env.RA_ADMIN_KEY) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    if (method === 'DELETE') {
      const id = String(req.query.id || '');
      if (!id) return res.status(400).json({ ok: false, error: 'missing id' });

      let ids = await kvGet(IDS_KEY);
      if (!Array.isArray(ids)) ids = [];
      ids = ids.filter(x => x !== id);
      await kvSet(IDS_KEY, ids);
      await kvDel(itemKey(id));
      return res.status(200).json({ ok: true });
    }

    // parse body json safely
    let body = {};
    try { body = JSON.parse(req.body || '{}'); } catch {}

    if (method === 'PUT') {
      // Replace entire set — expect small or empty array here
      const incoming = Array.isArray(body.overlays) ? body.overlays : [];
      let ids = [];

      // clear everything first
      const prev = await kvGet(IDS_KEY);
      if (Array.isArray(prev)) {
        for (const id of prev) await kvDel(itemKey(id));
      }

      // set new ones (usually empty; but we support non-empty too)
      for (const raw of incoming) {
        const ov = normalize(raw);
        await kvSet(itemKey(ov.id), ov);
        ids.push(ov.id);
      }
      await kvSet(IDS_KEY, ids);
      return res.status(200).json({ ok: true, count: ids.length });
    }

    if (method === 'POST') {
      // Append some overlays (chunk uploads)
      const mode = String(req.query.mode || '');
      if (mode !== 'append') {
        return res.status(400).json({ ok: false, error: 'use POST ?mode=append' });
      }
      const arr = Array.isArray(body.overlays) ? body.overlays : [];
      if (!arr.length) return res.status(400).json({ ok: false, error: 'no overlays' });

      let ids = await kvGet(IDS_KEY);
      if (!Array.isArray(ids)) ids = [];

      const saved = [];
      for (const raw of arr) {
        const ov = normalize(raw);
        await kvSet(itemKey(ov.id), ov);
        if (!ids.includes(ov.id)) ids.push(ov.id);
        saved.push(ov.id);
      }
      await kvSet(IDS_KEY, ids);
      return res.status(200).json({ ok: true, count: saved.length, ids: saved });
    }

    return res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (e) {
    console.error('[overlays]', e);
    return res.status(500).json({ ok: false, error: 'server' });
  }
};
