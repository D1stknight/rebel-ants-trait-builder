const { kvGet, kvSet, sAdd } = require('../_lib/redisAdapter');

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
    const name = String(body.name || '').trim();
    const imageUrl = String(body.imageUrl || '').trim();
    const caption = String(body.caption || '').trim();

    if (!name || !imageUrl) return res.status(400).json({ error: 'missing' });

    const entryId = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const entry = {
      id: entryId, contestId: active.id, name, imageUrl, caption,
      createdTs: Date.now()
    };

    await kvSet(`ra:contest:${active.id}:entry:${entryId}`, entry);
    await sAdd(`ra:contest:${active.id}:entries`, entryId);

    return res.status(200).json({ ok: true, entry });
  } catch (e) {
    console.error('[entry]', e);
    return res.status(500).json({ error: 'server' });
  }
};
