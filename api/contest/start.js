// Starts a new contest. Admin-protected via x-ra-admin header.
const { kvSet, sadd } = require('../_lib/redisAdapter');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const EXPECT = process.env.RA_ADMIN_KEY;
    if (!EXPECT) return res.status(500).json({ error: 'RA_ADMIN_KEY missing on server' });

    // Header name is case-insensitive in Node
    const admin = req.headers['x-ra-admin'];
    if (admin !== EXPECT) return res.status(401).json({ error: 'Unauthorized' });

    // Parse JSON body regardless of how Vercel passes it
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const name = body.name || 'Contest';
    const prompt = body.prompt || '';
    const durationDays = Math.max(1, parseInt(body.durationDays, 10) || 7);

    const now = Date.now();
    const id = String(now);
    const endTs = now + durationDays * 86400000;

    const contest = {
      id, name, prompt,
      startTs: now,
      endTs,
      status: 'active'
    };

    // Store a pointer to active + the contest metadata + add to an ID set
    await kvSet('ra:contest:active', { id });
    await kvSet(`ra:contest:${id}:meta`, contest);
    await sadd('ra:contest:ids', id);

    return res.status(200).json({ ok: true, contest });
  } catch (err) {
    console.error('[api/contest/start] error:', err);
    return res.status(500).json({ error: String(err && err.message || err) });
  }
};
