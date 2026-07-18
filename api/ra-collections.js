// /api/ra-collections.js
// Stores & serves your “collections to check” list.
// Uses the same KV/Upstash env vars as your other endpoints:
//
// - UPSTASH_REDIS_REST_URL   (or KV_REST_API_URL)
// - UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_TOKEN)
//
// GET  -> { ok:true, collections:[...] }
// POST -> body: { collections:[{name,address,chainId,tag,rpcUrl?}, ...] }

module.exports = async (req, res) => {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL;

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    res.status(500).json({ ok:false, error:'Missing UPSTASH/KV env vars' });
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${url}/get/ra:collections`, { headers });
      const j = await r.json().catch(()=>({}));
      let saved = [];
      try { saved = JSON.parse(j.result || '[]'); } catch { saved = []; }

      // If old rows didn’t have chainId, assume Ethereum mainnet (0x1)
      const norm = normalizeList(saved.length ? saved : seedList());
      return res.status(200).json({ ok:true, collections: norm });
    }

    if (req.method === 'POST') {
      // Read body safely
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}
      const incoming = Array.isArray(body) ? body : (body.collections || []);
      const norm = normalizeList(incoming);

      const value = encodeURIComponent(JSON.stringify(norm));
      const r = await fetch(`${url}/set/ra:collections/${value}`, { method:'POST', headers });
      const j = await r.json().catch(()=>({}));
      return res.status(200).json({ ok:true, collections: norm, upstash:j });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });

  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
};

function seedList(){
  // Safe defaults you can edit later in the admin box
  return [
    { name:'Rebel Ants',          address:'0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221', chainId:'0x1',    tag:'rebel'  },
    { name:'Saints of LA',        address:'0xb9b8c62590Bd0aa759331A1F6Cae4c9a1a7c8E1e', chainId:'0x1',    tag:'friend' },
    { name:'Chumpz (ApeChain)',   address:'0xa9a1d086623475595a02991664742e4a1cbafcb8', chainId:'0x8173', tag:'friend',
      rpcUrl:'https://apechain.calderachain.xyz/http' } // public RPC from ApeChain docs
  ];
}

function normalizeList(arr){
  const out = [];
  for (const raw of (arr||[])) {
    const name = String(raw.name||'').trim().slice(0,80);
    const address = normAddr(raw.address);
    const chainId = normChain(raw.chainId);
    const tag = (String(raw.tag||'friend').toLowerCase()==='rebel') ? 'rebel' : 'friend';
    const rpcUrl = normUrl(raw.rpcUrl);

    if (name && address && chainId) {
      out.push({ name, address, chainId, tag, ...(rpcUrl?{rpcUrl}:{}) });
    }
  }
  return out;
}

function normAddr(v){
  if (!v) return '';
  const s = String(v).trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s) ? s.toLowerCase() : '';
}

function normChain(v){
  if (!v && v!==0) return '';
  let s = String(v).trim();
  // Accept decimal like "1" and convert → "0x1"
  if (/^[0-9]+$/.test(s)) {
    try { s = '0x' + BigInt(s).toString(16); } catch { return ''; }
  }
  if (!/^0x[0-9a-fA-F]+$/.test(s)) return '';
  return s.toLowerCase();
}

function normUrl(v){
  if (!v) return '';
  const s = String(v).trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : '';
}
