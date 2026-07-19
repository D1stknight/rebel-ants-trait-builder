// /api/ai-overlays.js — saved AI overlay generations (list / delete)
// GET             -> { ok:true, items:[{id,url,prompt,ts}, ...] }
// DELETE ?id=...  -> { ok:true } (removes KV entry + Blob file)
const { kvGet, kvSet } = require('./_lib/redisAdapter');
const { del } = require('@vercel/blob');
const { isAdminRequest } = require('./_lib/adminAuth');
const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('./_lib/nameSession');

const LIST_KEY = 'ra:ai-overlays';
// Signed-in commanders get their own shelf; signed-out falls back to the
// legacy global shelf (admin-managed).
const shelfKeyFor = (req) => {
  const pid = verifyNameSession(readCookie(req, NAME_SESSION_COOKIE));
  return { key: pid ? (LIST_KEY + ':' + pid) : LIST_KEY, owner: !!pid };
};

module.exports = async (req, res) => {
  try {
    const shelf = shelfKeyFor(req);
    if (req.method === 'GET') {
      let list = await kvGet(shelf.key);
      if (!Array.isArray(list)) list = [];
      return res.status(200).json({ ok: true, items: list });
    }
    if (req.method === 'DELETE') {
      // Owners can always delete from their own shelf; the legacy global
      // shelf (signed-out) still requires admin.
      if (!shelf.owner && !isAdminRequest(req)) return res.status(401).json({ ok:false, error:'unauthorized' });
      const id = String((req.query && req.query.id) || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'id_required' });
      let list = await kvGet(shelf.key);
      if (!Array.isArray(list)) list = [];
      const item = list.find(x => x && x.id === id);
      const next = list.filter(x => x && x.id !== id);
      await kvSet(shelf.key, next);
      if (item && item.url) {
        try { await del(item.url); } catch (e) { console.error('[ai-overlays] blob del failed', e && e.message); }
      }
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    console.error('[ai-overlays]', e);
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
