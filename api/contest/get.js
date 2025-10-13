// /api/contest/get.js
const { getActiveContestId, getEntry } = require('../_lib/redisAdapter');

module.exports = async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });

    const cid = await getActiveContestId();
    if (!cid) return res.status(404).json({ ok: false, error: 'no active contest' });

    const entry = await getEntry(cid, id);
    if (!entry) return res.status(404).json({ ok: false, error: 'not found' });

    res.status(200).json({ ok: true, entry });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
