// api/contest/leaderboard.js
import { getActiveContestId, kvGet, zRevRangeWithScores } from '../_lib/redisAdapter';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const contestId = String(req.query.id || (await getActiveContestId()) || '');
    if (!contestId) {
      res.status(200).json({ id: null, items: [] });
      return;
    }

    // Top 50 by score (highest first)
    const top = await zRevRangeWithScores(`ra:contest:${contestId}:score`, 0, 49);

    const items = [];
    for (const row of top) {
      const entry = await kvGet(`ra:contest:${contestId}:entry:${row.member}`);
      if (!entry) continue;

      items.push({
        id: row.member,
        name: entry.name || 'Anonymous',
        caption: entry.caption || '',
        imageUrl: entry.imageUrl || entry.url || '', // <- critical mapping
        score: Number(row.score) || 0,
      });
    }

    res.status(200).json({ id: contestId, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
