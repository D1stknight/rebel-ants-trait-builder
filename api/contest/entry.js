// api/contest/entry.js
// Saves a canvas PNG into Vercel Blob and records an entry in Upstash Redis.
// Expects JSON body: { imageDataUrl, name, caption }

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ ok: false, error: 'Use POST' });
  }

  // --- read raw body (Node serverless)
  const raw = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

  let body;
  try {
    body = JSON.parse(raw || '{}');
  } catch (e) {
    res.statusCode = 400;
    return res.json({ ok: false, error: 'Invalid JSON body' });
  }

  const { imageDataUrl, name = 'Anonymous', caption = '' } = body || {};
  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    res.statusCode = 400;
    return res.json({ ok: false, error: 'imageDataUrl is required' });
  }

  // --- decode data URL
  const m = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) {
    res.statusCode = 400;
    return res.json({ ok: false, error: 'Expected a data:image/...;base64,... URL' });
  }
  const contentType = m[1];
  const buf = Buffer.from(m[2], 'base64');

  try {
    // --- write to Blob
    const { put } = await import('@vercel/blob');
    const filename = `contest/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

    const blob = await put(filename, buf, {
      access: 'public',
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // --- prepare entry object
    const entry = {
      id: filename,
      url: blob.url,
      name: String(name || '').slice(0, 64),
      caption: String(caption || '').slice(0, 200),
      ts: Date.now(),
      votes: { heart: 0, fire: 0, star: 0 },
    };

    // --- store in Upstash Redis (append to list + set by id)
    async function redis(cmd, args) {
      const r = await fetch(process.env.KV_REST_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cmd, args }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `Upstash error: ${r.status}`);
      return j;
    }

    // current list of entries (for the active contest)
    await redis('LPUSH', ['contest:entries', JSON.stringify(entry)]);
    // also keep a direct lookup
    await redis('SET', [`contest:entry:${entry.id}`, JSON.stringify(entry)]);

    res.statusCode = 200;
    return res.json({ ok: true, entry });
  } catch (err) {
    console.error('[entry] error:', err);
    res.statusCode = 500;
    return res.json({ ok: false, error: String(err && err.message || err) });
  }
};
