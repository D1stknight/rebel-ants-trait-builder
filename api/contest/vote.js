// api/contest/vote.js
const { getActiveContestId, addVote } = require('../_lib/redisAdapter');

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let s=''; req.on('data', c => (s+=c));
    req.on('end', () => { try{ resolve(JSON.parse(s || '{}')); } catch(e){ reject(e); } });
    req.on('error', reject);
  });
}

await fetch('/api/contest/vote', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ entryId, emoji, voter: VOTER_ID })
}).then(r => r.json()).then(data => {
  if (data.ok) {
    b.disabled = true;          // lock this emoji for this browser
    b.classList.add('voted');   // (optional) style it differently
    loadBoard();                // refresh scores
  } else if (data.already) {
    b.disabled = true;          // already voted this emoji — lock it
  } else {
    alert('Vote failed');
  }
});

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
