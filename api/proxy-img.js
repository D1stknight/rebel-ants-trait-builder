// /api/proxy-img.js
// Streams an image back to the browser. If the source is IPFS, try several gateways.
// Accepts:  GET /api/proxy-img?u=<absolute-url-or-ipfs-url>

const ALLOW = new Set([
  // IPFS gateways
  'nftstorage.link',
  'cloudflare-ipfs.com',
  'w3s.link',
  'ipfs.io',
  'gateway.pinata.cloud',
  'ipfs.filebase.io',
  'infura-ipfs.io',
  // Arweave
  'arweave.net',
  // Bueno CDN
  'assets.bueno.art',
]);

function ipfsPath(u) {
  if (!u) return '';
  const s = String(u);
  if (s.startsWith('ipfs://')) return s.slice(7).replace(/^ipfs\//, '');
  const m = s.match(/\/ipfs\/([^?#]+)/i);
  return m ? m[1] : '';
}

function expandCandidates(u) {
  if (!u) return [];
  const p = ipfsPath(u);
  if (p) {
    // Try multiple IPFS gateways in order
    return [
      `https://nftstorage.link/ipfs/${p}`,
      `https://cloudflare-ipfs.com/ipfs/${p}`,
      `https://w3s.link/ipfs/${p}`,
      `https://ipfs.io/ipfs/${p}`,
      `https://gateway.pinata.cloud/ipfs/${p}`,
      `https://ipfs.filebase.io/ipfs/${p}`,
      `https://infura-ipfs.io/ipfs/${p}`,
    ];
  }
  return [u];
}

function isAllowedUrl(raw) {
  try {
    const u = new URL(raw);
    return ALLOW.has(u.hostname.toLowerCase());
  } catch {
    // allow ipfs:// and /ipfs/... too (handled above)
    if (raw.startsWith('ipfs://')) return true;
    if (/\/ipfs\/[^?#]+/i.test(raw)) return true;
    return false;
  }
}

async function fetchWithTimeout(url, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { accept: 'image/avif,image/webp,image/*;q=0.8,*/*;q=0.5' },
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  try {
    const raw = String(req.query.u || '').trim();
    if (!raw) {
      res.status(400).send('missing u');
      return;
    }
    if (!isAllowedUrl(raw)) {
      res.status(400).send('host not allowed');
      return;
    }

    const candidates = expandCandidates(raw);
    let lastErr = 'fetch failed';

    for (const url of candidates) {
      try {
        const r = await fetchWithTimeout(url, 10000);
        if (r && r.ok) {
          const ct = r.headers.get('content-type') || 'application/octet-stream';
          const buf = Buffer.from(await r.arrayBuffer());
          res.status(200);
          res.setHeader('content-type', ct);
          res.setHeader('cache-control', 'no-store');
          res.end(buf);
          return;
        } else {
          lastErr = `status ${r && r.status}`;
        }
      } catch (e) {
        lastErr = String(e && e.message || e);
      }
    }

    res.status(502).send('proxy failed: ' + lastErr);
  } catch (e) {
    res.status(500).send('proxy error: ' + String(e && e.message || e));
  }
}
