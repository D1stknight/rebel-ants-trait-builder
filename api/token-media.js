// /api/token-media.js
// Resolve an NFT's image URL without Reservoir by reading tokenURI/uri on-chain (server-side).
// Supports ETH + ApeChain. Handles ipfs://, data:application/json, Bueno, 721 + 1155.
// Query:  /api/token-media?contract=0x...&id=123[&chain=eth|ape]
// Also accepts ?tokenId=123 or ?token=123
// Response: { ok: boolean, chain: "eth"|"ape", tokenURI: string, image: string, error?: string }

const ETH_RPCS = [
  process.env.RA_ETH_RPC,
  'https://ethereum.publicnode.com',
  'https://eth.llamarpc.com',
  'https://cloudflare-eth.com',
].filter(Boolean);

const APE_RPCS = [
  process.env.RA_APE_RPC,
  'https://rpc.apecoinchain.org',
].filter(Boolean);

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}

const pad64 = (hex) => String(hex).replace(/^0x/, '').padStart(64, '0').toLowerCase();
const toHex32 = (id) => '0x' + pad64(BigInt(String(id)).toString(16));
const isAddr = v => /^0x[0-9a-fA-F]{40}$/.test(String(v||''));
const isDec  = v => /^\d+$/.test(String(v||''));

const ipfsToHttp = (u) => {
  if (!u) return u;
  if (u.startsWith('ipfs://')) {
    let p = u.slice(7);
    if (p.startsWith('ipfs/')) p = p.slice(5);
    return `https://nftstorage.link/ipfs/${p}`;
  }
  return u;
};

function parseDataJSON(u) {
  try {
    const m = String(u).match(/^data:application\/json(?:;charset=[^;,]*)?(;base64)?,(.*)$/i);
    if (!m) return null;
    const isB64 = !!m[1];
    const payload = m[2];
    const text = isB64 ? Buffer.from(payload, 'base64').toString('utf8')
                       : decodeURIComponent(payload);
    return JSON.parse(text);
  } catch { return null; }
}

async function fetchJSON(url, opt = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opt, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } finally { clearTimeout(t); }
}

async function rpcCall(rpc, method, params, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: ctrl.signal
    });
    const j = await r.json().catch(() => null);
    if (j && j.result != null) return j.result;
    throw new Error(j?.error?.message || ('rpc ' + r.status));
  } finally { clearTimeout(t); }
}

async function tryMany(rpcs, fn) {
  let lastErr = null;
  for (const rpc of rpcs) {
    try { return await fn(rpc); }
    catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all rpcs failed');
}

async function contractExists(rpcs, addr) {
  try {
    const code = await tryMany(rpcs, (rpc) => rpcCall(rpc, 'eth_getCode', [addr, 'latest']));
    return code && code !== '0x';
  } catch { return false; }
}

async function detectChain(addr, hint) {
  const a = addr.toLowerCase();
  if (hint === 'eth' || hint === 'ape') return hint;
  if (await contractExists(ETH_RPCS, a)) return 'eth';
  if (await contractExists(APE_RPCS, a)) return 'ape';
  return '';
}

function decodeAbiString(callResult) {
  if (!callResult || callResult === '0x') return '';
  const hex = callResult.slice(2);
  if (hex.length < 64) return '';
  const off = parseInt(hex.slice(0, 64), 16) * 2;
  if (!Number.isFinite(off) || off + 64 > hex.length) return '';
  const len = parseInt(hex.slice(off, off + 64), 16) * 2;
  if (!Number.isFinite(len) || off + 64 + len > hex.length) return '';
  const data = hex.slice(off + 64, off + 64 + len);
  const bytes = new Uint8Array(data.match(/.{1,2}/g).map(h => parseInt(h, 16)));
  return new TextDecoder('utf-8').decode(bytes);
}

// 721 tokenURI(uint256)
async function call721(rpcs, addr, tokenId) {
  const data = '0xc87b56dd' + toHex32(tokenId).slice(2);
  const out  = await tryMany(rpcs, (rpc) => rpcCall(rpc, 'eth_call', [{ to: addr, data }, 'latest']));
  return decodeAbiString(out) || '';
}

// 1155 uri(uint256) with placeholders
async function call1155(rpcs, addr, tokenId) {
  const data = '0x0e89341c' + toHex32(tokenId).slice(2);
  const out  = await tryMany(rpcs, (rpc) => rpcCall(rpc, 'eth_call', [{ to: addr, data }, 'latest']));
  const tpl  = decodeAbiString(out) || '';
  if (!tpl) return '';
  const dec   = String(tokenId);
  const hex   = BigInt(dec).toString(16);
  const hex64 = pad64(hex);
  return tpl
    .replace(/\{id\}/gi, hex64)
    .replace(/\{tokenId\}/gi, dec)
    .replace(/\{idHex\}/gi, hex)
    .replace(/\{id64\}/gi, hex64);
}

async function resolveImage(metaURL) {
  if (!metaURL) return '';

  // inlined metadata
  const inlined = parseDataJSON(metaURL);
  if (inlined) {
    const i = inlined.image || inlined.image_url || inlined.image_original_url || inlined.image_data || '';
    if (!i) return '';
    if (typeof i === 'string' && i.startsWith('<svg')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(i);
    }
    return i.startsWith('data:') ? i : ipfsToHttp(i);
  }

  // http/ipfs metadata
  const url  = ipfsToHttp(metaURL);
  const meta = await fetchJSON(url, { cache: 'no-store' }, 8000) || {};
  let i = meta.image || meta.image_url || meta.image_original_url || meta.image_data || '';
  if (!i) return '';
  if (typeof i === 'string' && i.startsWith('<svg')) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(i);
  }
  return i.startsWith('data:') ? i : ipfsToHttp(i);
}

export default async function handler(req, res) {
  try {
    // accept id | tokenId | token
    const contract = String(req.query.contract || '').trim();
    const tokenId  = String(req.query.id || req.query.tokenId || req.query.token || '').trim();
    const hint     = (req.query.chain || '').toLowerCase();

    if (!isAddr(contract) || !isDec(tokenId)) {
      return json(res, 400, { ok: false, error: 'bad params' });
    }

    const chain = await detectChain(contract, hint);
    if (!chain) return json(res, 404, { ok: false, error: 'contract not found on ETH or ApeChain' });

    const rpcs = (chain === 'eth') ? ETH_RPCS : APE_RPCS;

    // Try 721 then 1155
    let tokenURI = '';
    try { tokenURI = await call721(rpcs, contract, tokenId); } catch {}
    if (!tokenURI) { try { tokenURI = await call1155(rpcs, contract, tokenId); } catch {} }

    if (!tokenURI) return json(res, 200, { ok: false, chain, tokenURI: '', image: '' });

    let image = '';
    if (/^data:image\//i.test(tokenURI) ||
        /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(tokenURI) ||
        tokenURI.startsWith('ipfs://')) {
      image = ipfsToHttp(tokenURI);
    } else {
      image = await resolveImage(tokenURI);
    }

    return json(res, 200, { ok: !!image, chain, tokenURI, image: image || '' });
  } catch (e) {
    return json(res, 200, { ok: false, error: String(e?.message || e) });
  }
}
