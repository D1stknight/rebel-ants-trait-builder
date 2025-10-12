// /api/contest/contest.js
import { getActiveContestId, getContestMeta, listEntries } from '../_lib/redisAdapter.js';

export const config = { runtime: 'nodejs' };

export default async function handler(_req, res) {
  try {
    const id = await getActiveContestId();
    if (!id) {
      res.status(200).json({ ok: true, active: false, id: null, meta: null, entries: [] });
      return;
    }

    const meta = await getContestMeta(id);          // { id,name,prompt,startTs,endTs }
    const entries = await listEntries(id, 100);     // includes { url, imageUrl, votes, score }

    res.status(200).json({ ok: true, active: true, id, meta, entries });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
