// api/contest/vote.js
const { getActiveContestId, addVote } = require('../_lib/redisAdapter');

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let s=''; req.on('data', c => (s+=c));
    req.on('end', () => { try{ resolve(JSON.parse(s || '{}')); } catch(e){ reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }
    const { entryId, emoji } = await readJSON(req);
    if (!entryId || !emoji) { res.status(400).json({ ok:false, error:'entryId and emoji required' }); return; }
    const id = await getActiveContestId();
    if (!id) { res.status(400).json({ ok:false, error:'no active contest' }); return; }
    const votes = await addVote(id, entryId, emoji);
    res.status(200).json({ ok:true, votes });
  } catch (e) {
    console.error('[vote]', e);
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
};
