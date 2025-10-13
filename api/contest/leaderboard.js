// api/contest/leaderboard.js
const { getActiveContestId, listEntries } = require('../_lib/redisAdapter');

module.exports = async (req, res) => {
  try {
    const id = req.query.id || await getActiveContestId();
    if (!id) { res.status(200).json({ ok:true, id:null, items:[] }); return; }
    const items = (await listEntries(id, 100))
      .sort((a,b) => (b.score|0) - (a.score|0))
      .slice(0, 50);
    res.status(200).json({ ok:true, id, items });
  } catch (e) {
    console.error('[leaderboard]', e);
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
};
