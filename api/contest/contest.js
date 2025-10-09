// api/contest/contest.js
import { getActiveContestId, listEntries } from '../_lib/redisAdapter';

export const config = { runtime: 'nodejs' };

export default async function handler(_req, res) {
  try {
    const id = await getActiveContestId();
    if (!id) {
      res.status(200).json({ ok: true, active: false, entries: [] });
      return;
    }
    const entries = await listEntries(id, 50);
    res.status(200).json({ ok: true, active: true, id, entries });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
