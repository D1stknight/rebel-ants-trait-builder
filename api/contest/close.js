const { kvGet, kvSet, zRevRangeWithScores } = require('../_lib/redisAdapter');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }

    const EXPECT = process.env.RA_ADMIN_KEY;
    const admin = req.headers['x-ra-admin'];
    if (!EXPECT || admin !== EXPECT) return res.status(401).json({ error: 'unauthorized' });

    const active = await kvGet('ra:contest:active');
    if (!active?.id) return res.status(400).json({ error: 'no-active' });

    const metaKey = `ra:contest:${active.id}:meta`;
    const meta = await kvGet(metaKey);
    if (!meta) return res.status(400).json({ error: 'not-found' });

    const winners = await zRevRangeWithScores(`ra:contest:${active.id}:score`, 0, 9); // top 10
    await kvSet(`ra:contest:${active.id}:winners`, winners);

    meta.status = 'closed';
    meta.closedTs = Date.now();
    await kvSet(metaKey, meta);

    // Clear "active" pointer (optional)
    await kvSet('ra:contest:active', { id: null });

    return res.status(200).json({ ok: true, id: active.id, winners });
  } catch (e) {
    console.error('[close]', e);
    return res.status(500).json({ error: 'server' });
  }
};
