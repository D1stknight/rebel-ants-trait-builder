// api/overlays.js  (CommonJS, Vercel serverless)
const { kvGet, kvSet, kvDel } = require('./_lib/redisAdapter'); // adjust path if needed

const IDS_KEY = 'ra:overlays:ids';
const itemKey = (id) => `ra:overlay:${id}`;

function uid() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

function normalize(raw) {
  const id   = String(raw.id || uid());
  const name = String(raw.name || 'overlay');
  const url      = raw.url && String(raw.url);
  const dataURL  = !url && raw.dataURL ? String(raw.dataURL) : null;
  return { id, name, ...(url ? { url } : {}), ...(dataURL ? { dataURL } : {}) };
}

// ---- robust JSON body reader (handles string, object, or raw stream) ----
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  // raw stream fallback
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
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
    const method   = req.method || 'GET';
    const adminKey = (req.query.admin || '').trim();

    if (method === 'GET') {
      const overlays = await listAll();
      return res.status(200).json({ ok: true, overlays });
    }

    // admin-protected below
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

    // parse JSON body safely (works on Vercel/Node)
    const body = await readJsonBody(req);

    if (method === 'PUT') {
      // Replace entire set (we call this with [] first to clear)
      const incoming = Array.isArray(body.overlays) ? body.overlays : [];
      let ids = [];

      // clear old
      const prev = await kvGet(IDS_KEY);
      if (Array.isArray(prev)) {
        for (const id of prev) await kvDel(itemKey(id));
      }

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
