// /api/contest/vote.js
// One reaction per emoji, per entry, per voter (signed-in player, else this connection), while the
// contest is open (until its end date). Score = all reactions.
import * as store from '../_lib/redisAdapter.js';
import { createHash } from 'crypto';
export const config = { runtime: 'nodejs' };

const ALLOWED = new Set(['👍','❤️','🔥','😂','😮']);

function voterId(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || '');
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);
  return createHash('sha256').update('ra-vote:' + ip + '|' + ua).digest('hex').slice(0, 32);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method Not Allowed' });

  try {
    const { entryId, emoji } = await readJSON(req);
    const contestId = await store.getActiveContestId();

    if (!contestId)       return res.status(400).json({ ok:false, error:'no active contest' });
    if (!entryId || !ALLOWED.has(emoji)) return res.status(400).json({ ok:false, error:'bad args' });

    const meta = await store.getContestMeta(contestId);
    if (meta && Number(meta.endTs) && Date.now() > Number(meta.endTs)) return res.status(400).json({ ok:false, error:'voting is closed' });

    const mark = 'ra:contest:' + contestId + ':v:' + String(entryId).slice(0, 64) + ':' + emoji + ':' + voterId(req);
    const first = await store.kvSetNXEx(mark, 1, 60 * 60 * 24 * 60);
    if (!first) return res.status(409).json({ ok:false, error:'already reacted' });

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
