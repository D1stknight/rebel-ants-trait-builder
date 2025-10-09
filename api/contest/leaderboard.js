const { kvGet, zRevRangeWithScores } = require('../_lib/redisAdapter');

async function getEntry(storeId, entryId) {
  const { kvGet } = require('../_lib/redisAdapter');
  return kvGet(`ra:contest:${storeId}:entry:${entryId}`);
}

module.exports = async (req, res) => {
  try {
    const activeOnly = (req.query?.id || req.query?.contestId) ? null : true;
    const id = activeOnly ? (await kvGet('ra:contest:active'))?.id : String(req.query.id || req.query.contestId || '');

    if (!id) return res.status(200).json({ id: null, items: [] });

    const top = await zRevRangeWithScores(`ra:contest:${id}:score`, 0, 49); // top 50
    const items = [];
    for (const row of top) {
      const entry = await getEntry(id, row.member);
      if (entry) items.push({ score: row.score, ...entry });
    }
    return res.status(200).json({ id, items });
  } catch (e) {
    console.error('[leaderboard]', e);
    return res.status(500).json({ error: 'server' });
  }
};
