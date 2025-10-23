// /api/proxy-img.js
// Returns { ok, dataUrl, contentType, size, from } for an image URL.
// Works with http(s) and ipfs:// (multi-gateway fallback). Always JSON.

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

const GATEWAYS = [
  'https://nftstorage.link/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://w3s.link/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.filebase.io/ipfs/',
  'https://infura-ipfs.io/ipfs/',
];

function ipfsPath(u) {
  if (!u) return '';
  const s = String(u);
  if (s.startsWith('ipfs://')) return s.slice(7).replace(/^ipfs\//, '');
  const m = s.match(/\/ipfs\/([^?#]+)/i);
  return m ? m[1] : '';
}
function expand(u) {
  const p = ipfsPath(u);
  return p ? GATEWAYS.map(g => g + p) : [u];
}
function isAllowed(raw) {
  // ipfs:// and /ipfs/... are allowed (we’ll expand)
  if (raw.startsWith('ipfs://') || /\/ipfs\/[^?#]+/i.test(raw)) return true;
  try {
    const u = new URL(raw);
    return ALLOW.has(u.hostname.toLowerCase());
  } catch { return false; }
}
async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: { accept: 'image/avif,image/webp,image/*;q=0.8,*/*;q=0.5' },
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
}

export default async function handler(req, res) {
  try {
    const raw = String(req.query.u || '').trim();
    if (!raw) return res.status(400).json({ ok:false, error:'missing u' });
    if (!isAllowed(raw)) return res.status(400).json({ ok:false, error:'host not allowed' });

    let lastErr = 'failed';
    for (const url of expand(raw)) {
      try {
        const r = await fetchWithTimeout(url);
        if (r && r.ok) {
          const ct = (r.headers.get('content-type') || '').split(';')[0] || 'image/png';
          const ab = await r.arrayBuffer();
          const b64 = Buffer.from(ab).toString('base64');
          const dataUrl = `data:${ct};base64,${b64}`;
          return res.status(200).json({ ok:true, dataUrl, contentType: ct, size: ab.byteLength, from: url });
        } else {
          lastErr = `status ${r && r.status}`;
        }
      } catch (e) {
        lastErr = String(e && e.message || e);
      }
    }
    return res.status(502).json({ ok:false, error:'proxy failed: '+lastErr });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e && e.message || e) });
  }
}
