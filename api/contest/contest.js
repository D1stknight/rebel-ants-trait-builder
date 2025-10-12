// api/contest/contest.js
export const config = { runtime: 'nodejs' };

import {
  getActiveContestId,
  getContestMeta,
  listEntries,
} from '../_lib/redisAdapter';

export default async function handler(_req, res) {
  try {
    const id = await getActiveContestId();
    if (!id) {
      return res.status(200).json({ ok: true, active: false, entries: [] });
    }

    // meta + up to 200 latest entries (newest first)
    const [meta, entries] = await Promise.all([
      getContestMeta(id),
      listEntries(id, 200),
    ]);

    return res.status(200).json({
      ok: true,
      active: true,
      id,
      meta,       // includes name/prompt/startTs/endTs
      entries,    // [{ id, name, caption, url, imageUrl, votes, score, ts }, ...]
    });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, error: String(e && e.message || e) });
  }
}
