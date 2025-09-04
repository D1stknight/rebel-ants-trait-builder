// Vercel serverless endpoint for live watermark settings.
// Requires two env vars in your project settings:
//  - UPSTASH_REDIS_REST_URL
//  - UPSTASH_REDIS_REST_TOKEN
//
// GET  /api/ra-settings  -> { ok:true, settings:{...} }
// POST /api/ra-settings  -> body: {enabled, showOnTokens, showOnUploads, opacity, sizePct}

module.exports = async (req, res) => {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    res.status(500).json({ ok:false, error:'Missing UPSTASH_REDIS_REST_URL / _TOKEN env vars' });
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${url}/get/ra:wm`, { headers });
      const j = await r.json();
      let saved = {};
      try { saved = JSON.parse(j.result || '{}'); } catch { saved = {}; }
      return res.status(200).json({ ok:true, settings: normalize(saved) });
    }

    if (req.method === 'POST') {
      // Read JSON body safely
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}

      const safe = normalize(body);
      const value = encodeURIComponent(JSON.stringify(safe));
      const r = await fetch(`${url}/set/ra:wm/${value}`, { method:'POST', headers });
      const j = await r.json();
      return res.status(200).json({ ok:true, settings: safe, upstash: j });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });

  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e && e.message || e) });
  }
};

function normalize(s) {
  return {
    enabled:       !!s.enabled,
    showOnTokens:  !!s.showOnTokens,
    showOnUploads: !!s.showOnUploads,
    opacity: clampNum(s.opacity,  0, 1,    0.18), // 0..1
    sizePct: clampNum(s.sizePct, 0.05, 1,  0.22)  // 5%..100% of canvas width
  };
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
