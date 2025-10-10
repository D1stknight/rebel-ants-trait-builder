// api/contest/contest.js
import { getActiveContestId, kvGet } from '../_lib/redisAdapter';

export const config = { runtime: 'nodejs' };

export default async function handler(_req, res) {
  try {
    const id = await getActiveContestId();
    if (!id) {
      res.status(200).json({ ok: true, active: null, id: null });
      return;
    }
    const meta = await kvGet(`ra:contest:${id}:meta`);
    // meta should have: { name, prompt, endTs, startTs, ... }
    res.status(200).json({ ok: true, active: meta, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
