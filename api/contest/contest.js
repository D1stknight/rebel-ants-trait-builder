// /api/contest/contest.js
import * as store from '../_lib/redisAdapter.js';
export const config = { runtime: 'nodejs' };

export default async function handler(_req, res) {
  try {
    const id = await store.getActiveContestId();
    if (!id) return res.status(200).json({ ok:true, active:false, id:null, meta:null, entries:[] });

    const meta    = await store.getContestMeta(id);
    const entries = await store.listEntries(id, 200); // newest first, with votes + score
    // normalize image field for client
    for (const e of entries) {
      e.imageUrl = e.imageUrl || e.url || '';
      e.votes    = e.votes || {};
      e.score    = e.score|0;
    }
    res.status(200).json({ ok:true, active:true, id, meta, entries });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
}
