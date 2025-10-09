const { kvGet, setEx, zIncrBy } = require('../_lib/redisAdapter');

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string') return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || '0.0.0.0';
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }

    const active = await kvGet('ra:contest:active');
    if (!active?.id) return res.status(400).json({ error: 'no-active' });

    const meta = await kvGet(`ra:contest:${active.id}:meta`);
    if (!meta || meta.status !== 'active' || Date.now() > meta.endTs) {
      return res.status(400).json({ error: 'closed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body||'{}') : (req.body||{});
    const entryId = String(body.entryId || '');
    const emoji = String(body.emoji || '👍'); // stored, not used for math (v1)

    if (!entryId) return res.status(400).json({ error: 'missing-entry' });

    // Basic rate limit by IP
    const ip = getClientIp(req);
    const votedKey = `ra:contest:${active.id}:voted:${ip}`;
    // Set a small TTL (12h) to allow future votes; change to 24h or stricter as you wish
    await setEx(votedKey, 12 * 3600, '1');

    // Increment leaderboard score
    await zIncrBy(`ra:contest:${active.id}:score`, 1, entryId);

    return res.status(200).json({ ok: true, entryId, emoji });
  } catch (e) {
    console.error('[vote]', e);
    return res.status(500).json({ error: 'server' });
  }
};
