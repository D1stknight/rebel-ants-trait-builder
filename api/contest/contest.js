const { kvGet } = require('../_lib/redisAdapter');

module.exports = async (_req, res) => {
  try {
    const active = await kvGet('ra:contest:active');
    if (!active?.id) return res.status(200).json({ active: null });

    const meta = await kvGet(`ra:contest:${active.id}:meta`);
    return res.status(200).json({ active: meta || null });
  } catch (e) {
    console.error('[contest meta]', e);
    return res.status(500).json({ error: 'server' });
  }
};
