// api/contest/contest.js — what the public contest page shows.
// The active contest, or (when none is open) the last one with its results: entries, Ant-Thony's
// verdict (if he judged and posted), and the confirmed winners.
import { getActiveContestId, getContestMeta, listEntries, publicEntry, kvGet } from '../_lib/redisAdapter';
import { readVerdict } from '../_lib/judge';

export const config = { runtime: 'nodejs' };

export default async function handler(_req, res) {
  try {
    let id = await getActiveContestId();
    const active = !!id;
    if (!id) {
      const last = await kvGet('ra:contest:last').catch(() => null);
      id = last && last.id ? String(last.id) : null;
    }
    if (!id) {
      res.status(200).json({ ok: true, active: false, id: null, meta: null, entries: [] });
      return;
    }
    const [meta, entries, verdict, winners] = await Promise.all([
      getContestMeta(id),
      listEntries(id, 50),
      readVerdict(id),
      kvGet('ra:contest:' + id + ':winners').catch(() => null),
    ]);
    const endTs = Number(meta && meta.endTs) || 0;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      active,
      votingOpen: active && (!endTs || Date.now() < endTs),
      id,
      meta,
      entries: (entries || []).map(publicEntry),
      verdict: verdict || null,
      winners: Array.isArray(winners) ? winners.map(w => ({ place: w.place, entryId: w.entryId, name: w.name, imageUrl: w.imageUrl || w.url || '', score: w.score })) : [],
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
