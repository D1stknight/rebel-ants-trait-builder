// /api/proxy-img.js
// Fetch an image on the server and stream it back from our domain (same-origin).
// Only allows common NFT gateways to avoid abuse.

const ALLOW = new Set([
  'nftstorage.link',
  'ipfs.io',
  'cloudflare-ipfs.com',
  'gateway.pinata.cloud',
  'assets.bueno.art',
  'arweave.net',
  'ipfs.filebase.io',
  'infura-ipfs.io'
]);

export default async function handler(req, res) {
  try {
    const u = String(req.query.u || '').trim();
    if (!u) return res.status(400).send('missing u');

    let url;
    try { url = new URL(u); } catch { return res.status(400).send('bad url'); }

    if (!ALLOW.has(url.hostname)) {
      return res.status(400).send('host not allowed');
    }

    const r = await fetch(url.toString(), {
      headers: { 'user-agent': 'RebelAntsBuilder/1.0 (+https://builder.rebelants.io)' }
    });
    if (!r.ok) return res.status(502).send('upstream ' + r.status);

    const type = r.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return res.status(415).send('not an image');

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('content-type', type);
    res.setHeader('cache-control', 'public, max-age=60');
    res.setHeader('access-control-allow-origin', '*');
    res.status(200).end(buf);
  } catch (e) {
    res.status(500).send('proxy error');
  }
}
