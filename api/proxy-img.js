// /api/proxy-img.js
// Fetch an image server-side and return a data: URL (base64) so the browser
// never has to reach the remote host directly (solves CORS/DNS hiccups).

export default async function handler(req, res) {
  try {
    const url = String(req.query.u || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ ok: false, error: 'bad url' }));
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(url, { signal: controller.signal, headers: { 'accept': '*/*' } }).catch(() => null);
    clearTimeout(t);

    if (!r || !r.ok) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ ok: false, error: 'fetch failed', status: r?.status || 0 }));
    }

    const ct = r.headers.get('content-type') || 'application/octet-stream';
    const ab = await r.arrayBuffer();
    const b64 = Buffer.from(ab).toString('base64');
    const dataUrl = `data:${ct};base64,${b64}`;

    res.statusCode = 200;
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ ok: true, data: dataUrl }));
  } catch (e) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
