// api/contest/contest.js
const { getActiveContestId, getContestMeta, listEntries } = require('../_lib/redisAdapter');

module.exports = async (_req, res) => {
  try {
    const id = await getActiveContestId();
    if (!id) { res.status(200).json({ ok:true, active:false, entries:[] }); return; }
    const meta = await getContestMeta(id);
    const entries = await listEntries(id, 50);
    res.status(200).json({ ok:true, active:true, id, meta, entries });
  } catch (e) {
    console.error('[contest meta]', e);
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
};
