// Vercel serverless endpoint for managing NFT collections + chains.
// Uses the same env vars as your other KV endpoint:
//
//  - UPSTASH_REDIS_REST_URL  or  KV_REST_API_URL
//  - UPSTASH_REDIS_REST_TOKEN or KV_REST_API_TOKEN
//
// GET  /api/ra-collections    -> { ok:true, items:[...] }
// POST /api/ra-collections    -> body: { items:[...] }  (overwrites)

module.exports = async (req, res) => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL;        // Vercel KV alias

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    res.status(500).json({ ok:false, error:'Missing UPSTASH/KV env vars' });
    return;
  }
  const headers = { Authorization: `Bearer ${token}` };

  const KEY = 'ra:collections';

  try {
    if (req.method === 'GET') {
      // Read
      const r = await fetch(`${url}/get/${encodeURIComponent(KEY)}`, { headers });
      const j = await r.json();
      let saved = [];
      try { saved = JSON.parse(j.result || '[]'); } catch { saved = []; }

      // If empty, return defaults prefilled from your message (lowercased)
      if (!Array.isArray(saved) || !saved.length) saved = defaults();

      return res.status(200).json({ ok:true, items: normalizeAll(saved) });
    }

    if (req.method === 'POST') {
      // Read JSON body
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}

      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length || items.length > 100) {
        return res.status(400).json({ ok:false, error:'items must be 1..100' });
      }

      const safe = normalizeAll(items);
      // Basic validation
      for (const it of safe) {
        if (![1,33139].includes(it.chainId)) {
          return res.status(400).json({ ok:false, error:`Unsupported chainId ${it.chainId}` });
        }
        if (!/^0x[0-9a-f]{40}$/.test(it.contract)) {
          return res.status(400).json({ ok:false, error:`Bad contract ${it.contract}` });
        }
        if (!it.label || !it.slug) {
          return res.status(400).json({ ok:false, error:'label/slug required' });
        }
      }

      const value = encodeURIComponent(JSON.stringify(safe));
      const r = await fetch(`${url}/set/${encodeURIComponent(KEY)}/${value}`, { method:'POST', headers });
      const j = await r.json();
      return res.status(200).json({ ok:true, items: safe, upstash:j });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });

  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e && e.message || e) });
  }

  function normalizeAll(arr){ return arr.map(nItem).filter(Boolean); }

  function nItem(s){
    if (!s) return null;
    const label = String(s.label||'').trim();
    const chainId = Number(s.chainId||0);
    const contract = String(s.contract||'').trim().toLowerCase();
    const slug = String(s.slug || slugify(label)).trim().toLowerCase();
    const group = String(s.group||'').trim().toLowerCase(); // use 'rebel-ants' to group ETH+Ape as one entitlement
    return { slug, label, chainId, contract, group };
  }

  function slugify(t){ return String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }

  function defaults(){
    return normalizeAll([
      { label:'Rebel Ants (ETH)',    chainId:1,     contract:'0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221', group:'rebel-ants' },
      // Add Rebel Ants (ApeChain) later when you have it:
      // { label:'Rebel Ants (ApeChain)', chainId:33139, contract:'0x________', group:'rebel-ants' },
      { label:'Saints of LA (ETH)', chainId:1,     contract:'0xbed2470ded2519c13eaaf3bd970015ef404d3d20', group:'saints' },
      { label:'Chumpz (ApeChain)',  chainId:33139, contract:'0xa9a1d086623475595a02991664742e4a1cbafcb8', group:'chumpz' },
    ]);
  }
};
