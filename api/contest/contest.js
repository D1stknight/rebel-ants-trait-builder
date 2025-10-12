// api/contest/contest.js  (CommonJS)
exports.config = { runtime: 'nodejs' };

const {
  getActiveContestId,
  getContestMeta,
  listEntries,
} = require('../_lib/redisAdapter');

module.exports = async (_req, res) => {
  try {
    const id = await getActiveContestId();
    if (!id) {
      res.status(200).json({ ok: true, active: false, id: null, meta: null, entries: [] });
      return;
    }

    const meta = await getContestMeta(id);
    let entries = await listEntries(id, 200);

    // Normalize fields so the UI can always use .imageUrl (and still keep .url)
    entries = (entries || []).map(e => ({
      id: String(e.id),
      name: e.name || 'Anonymous',
      caption: e.caption || '',
      url: e.url || e.imageUrl || '',
      imageUrl: e.imageUrl || e.url || '',
      ts: e.ts || 0,
      votes: e.votes || {},
      score: typeof e.score === 'number'
        ? e.score
        : Object.values(e.votes || {}).reduce((a, b) => a + (b|0), 0)
    }));

    res.status(200).json({ ok: true, active: true, id, meta, entries });
  } catch (e) {
    console.error('[contest]', e);
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
