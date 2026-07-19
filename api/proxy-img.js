// /api/proxy-img.js
// Proxies an image URL server-side and streams the bytes with permissive
// CORS. ipfs:// and /ipfs/ URLs are expanded across gateways: dedicated
// Pinata first (fast for our own pins; rejects foreign CIDs), then public
// gateways that serve any CID.
//
// NOTE: this file previously contained two concatenated copies of the
// handler (duplicate declarations = module parse error), so the endpoint
// crashed with 500 on every invocation since it was added. Rewritten clean.

export const config = { api: { bodyParser: false, responseLimit: '16mb' } };

function ipfsPath(u) {
  if (!u) return '';
  const s = String(u);
  if (s.startsWith('ipfs://')) return s.slice(7).replace(/^ipfs\//, '');
  const m = s.match(/\/ipfs\/([^?#]+)/i);
  return m ? m[1] : '';
}

export default async function handler(req, res) {
  try {
    const raw = String(req.query.u || '').trim();
    if (!raw) return res.status(400).send('missing u');
    if (!/^https?:\/\//i.test(raw) && !raw.startsWith('ipfs://') && !raw.includes('/ipfs/')) {
      return res.status(400).send('bad scheme');
    }

    const candidates = [];
    const p = ipfsPath(raw);
    if (p) {
      const bases = [
        'https://brown-ready-shark-280.mypinata.cloud/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://ipfs.io/ipfs/'
      ];
      for (const b of bases) candidates.push(b + p);
    } else {
      candidates.push(raw);
    }

    let lastErr = null;
    for (const u of candidates) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      try {
        const r = await fetch(u, {
          headers: { accept: 'image/*,*/*;q=0.8', 'user-agent': 'RebelAnts-Proxy/1.0' },
          cache: 'no-store',
          signal: ctrl.signal
        });
        if (!r.ok) { lastErr = new Error('status ' + r.status + ' @ ' + u); continue; }
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);
        const ct = r.headers.get('content-type') || 'application/octet-stream';
        // A gateway can 200 an HTML error page; skip non-image bodies unless
        // the source URL was a plain http(s) passthrough.
        if (p && /text\/html/i.test(ct)) { lastErr = new Error('html body @ ' + u); continue; }
        res.setHeader('content-type', ct);
        res.setHeader('cache-control', 'public, max-age=3600, s-maxage=86400');
        res.setHeader('access-control-allow-origin', '*');
        return res.status(200).send(buf);
      } catch (e) {
        lastErr = e;
      } finally {
        clearTimeout(timer);
      }
    }
    return res.status(502).json({ ok: false, error: 'fetch failed', detail: String(lastErr || '') });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
