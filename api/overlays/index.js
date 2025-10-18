// api/overlays/index.js (CommonJS)
const { kvGet } = require('../_lib/redisAdapter');

module.exports = async (_req, res) => {
  try {
    const url = await kvGet('ra:overlays:url');
    if (!url) {
      // fall back to the static file if you haven't published yet
      res.writeHead(302, { Location: '/overlays.json' }).end();
      return;
    }
    const r = await fetch(url);
    const text = await r.text();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.status(200).send(text);
  } catch (e) {
    console.error('[overlays] fallback', e);
    res.writeHead(302, { Location: '/overlays.json' }).end();
  }
};
