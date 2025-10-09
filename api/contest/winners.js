const { kvGet } = require('../_lib/redisAdapter');

module.exports = async (req, res) => {
  try {
    const id = String(req.query.id || req.query.contestId || '');
    if (!id) return res.status(400).json({ error: 'missing-id' });

    const winners = await kvGet(`ra:contest:${id}:winners`);
    return res.status(200).json({ id, winners: winners || [] });
  } catch (e) {
    console.error('[winners]', e);
    return res.status(500).json({ error: 'server' });
  }
};
