// /api/cron/contest-end.js — hourly (vercel.json). When the active contest's end date has passed:
// Ant-Thony judges it and posts his verdict (finalist badges, verdict saved for the contest page),
// then voting closes. The contest stays as the "last contest" so its page shows the results, and
// the admin confirms the real winners from the Rebel Console. Runs once per contest (marker).
const { getActiveContestId, getContestMeta, kvSetNX, kvDel, kvSet } = require('../_lib/redisAdapter');
const { runJudge } = require('../_lib/judge');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) return res.status(401).json({ ok: false });
  try {
    const id = await getActiveContestId();
    if (!id) return res.status(200).json({ ok: true, did: 'nothing', why: 'no active contest' });
    const meta = await getContestMeta(id);
    const endTs = Number(meta && meta.endTs) || 0;
    if (!endTs || Date.now() < endTs) return res.status(200).json({ ok: true, did: 'nothing', why: 'not ended yet', endsAt: endTs });
    const mine = await kvSetNX('ra:contest:' + id + ':ended', Date.now());
    if (!mine) return res.status(200).json({ ok: true, did: 'nothing', why: 'already handled' });
    const verdict = await runJudge({ post: true }, { contestId: id });
    await kvSet('ra:contest:last', { id });
    await kvDel('ra:contest:active');
    return res.status(200).json({ ok: true, did: 'judged and closed', contestId: id, judged: !!(verdict && verdict.ok), posted: !!(verdict && verdict.posted), error: verdict && !verdict.ok ? verdict.error : undefined });
  } catch (e) {
    console.error('[contest-end]', e);
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
