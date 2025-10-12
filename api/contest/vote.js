// /api/contest/vote.js
import * as store from '../_lib/redisAdapter.js';
export const config = { runtime: 'nodejs' };

const ALLOWED = new Set(['👍','❤️','🔥','😂','😮']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method Not Allowed' });

  try {
    const { entryId, emoji } = await readJSON(req);
    const contestId = await store.getActiveContestId();

    if (!contestId)       return res.status(400).json({ ok:false, error:'no active contest' });
    if (!entryId || !ALLOWED.has(emoji)) return res.status(400).json({ ok:false, error:'bad args' });

    const votes = await store.addVote(contestId, entryId, emoji); // returns updated votes map
    const score = Object.values(votes).reduce((a,b)=> a + (b|0), 0);

    res.status(200).json({ ok:true, votes, score });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
}

function readJSON(req){
  return new Promise((resolve, reject)=>{
    let data=''; req.on('data',d=>data+=d);
    req.on('end',()=>{ try{ resolve(JSON.parse(data||'{}')); } catch{ reject(new Error('invalid json')); } });
    req.on('error', reject);
  });
}
