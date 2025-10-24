// /api/proxy-img.js
// Proxies an image URL and returns raw image bytes with correct headers.
// Supports ipfs:// and /ipfs/... by trying several gateways.

export const config = {
  api: { bodyParser: false, responseLimit: '16mb' }
};

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

    // Only allow http/https/ipfs
    if (!/^https?:\/\//i.test(raw) && !raw.startsWith('ipfs://') && !raw.includes('/ipfs/')) {
      return res.status(400).send('bad scheme');
    }

    // Build candidate URLs (multiple IPFS gateways if needed)
    const candidates = [];
    const p = ipfsPath(raw);
    if (p) {
      const bases = [
        'https://nftstorage.link/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/',
        'https://w3s.link/ipfs/',
        'https://ipfs.io/ipfs/',
        'https://gateway.pinata.cloud/ipfs/'
      ];
      for (const b of bases) candidates.push(b + p);
    } else {
      candidates.push(raw);
    }

    let lastErr = null;
    for (const u of candidates) {
      try {
        const r = await fetch(u, {
          headers: { 'accept': 'image/*,*/*;q=0.8', 'user-agent': 'RebelAnts-Proxy/1.0' },
          cache: 'no-store'
        });
        if (!r.ok) { lastErr = new Error('status ' + r.status); continue; }

        // If the origin mislabeled the content-type, we still pass bytes through.
        const ct = r.headers.get('content-type') || 'application/octet-stream';
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);

        res.setHeader('content-type', ct);
        res.setHeader('cache-control', 'public, max-age=3600, s-maxage=3600');
        res.setHeader('access-control-allow-origin', '*');
        return res.status(200).send(buf);
      } catch (e) {
        lastErr = e;
      }
    }

    return res.status(502).json({ ok:false, error:'fetch failed', detail: String(lastErr || '') });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
