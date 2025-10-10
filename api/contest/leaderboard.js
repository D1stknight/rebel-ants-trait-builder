// api/contest/leaderboard.js
import { getActiveContestId, listEntries } from '../_lib/redisAdapter';

export const config = { runtime: 'nodejs' };

export default async function handler(_req, res) {
  try {
    const id = await getActiveContestId();
    if (!id) return res.status(200).json({ ok: true, items: [] });

    const entries = await listEntries(id, 200);

    // Map to the shape the page expects: items[].imageUrl
    const items = entries.map(e => ({
      id: e.id,
      name: e.name || 'Anonymous',
      caption: e.caption || '',
      imageUrl: e.url,                  // <- map url -> imageUrl
      score: typeof e.votes === 'number'
        ? e.votes
        : (e.votes ? Object.values(e.votes).reduce((a, b) => a + (+b || 0), 0) : 0)
    }));

    res.status(200).json({ ok: true, id, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
