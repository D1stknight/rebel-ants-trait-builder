// api/contest/contest.js
import { getActiveContestId, getContestMeta, listEntries } from '../_lib/redisAdapter';

export const config = { runtime: 'nodejs' };

export default async function handler(_req, res) {
  try {
    const id = await getActiveContestId();
    if (!id) {
      res.status(200).json({ ok: true, active: false, id: null, meta: null, entries: [] });
      return;
    }
    const [meta, entries] = await Promise.all([
      getContestMeta(id),
      listEntries(id, 50),
    ]);
    res.status(200).json({ ok: true, active: true, id, meta, entries });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
