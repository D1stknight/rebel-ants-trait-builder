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
  // rpc.apecoinchain.org is dead (connection refused as of 2026-07). Caldera is
  // ApeChain's canonical RPC host; rpc.apechain.com is the official alias.
  'https://apechain.calderachain.xyz/http',
  'https://rpc.apechain.com/http',
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
  // Use our dedicated Pinata gateway by default. The frontend has its own
  // fallback chain in case this gateway has issues for a specific request.
  let s = String(u);
  if (s.startsWith('ipfs://ipfs/')) s = s.slice('ipfs://ipfs/'.length);
  else if (s.startsWith('ipfs://')) s = s.slice('ipfs://'.length);
  else return u;
  return 'https://brown-ready-shark-280.mypinata.cloud/ipfs/' + s;
};

// Resolve an ipfs:// URL to the first gateway that actually serves it.
// The dedicated Pinata gateway is fastest for our own pins but returns 403
// for CIDs not pinned in our account (e.g. friend collections), so we
// verify with a HEAD request and fall through to public gateways.
async function pickWorkingIpfsUrl(u) {
  if (!u || !/^ipfs:\/\//i.test(String(u))) return u;
  const s = String(u).replace(/^ipfs:\/\/(ipfs\/)?/i, '');
  const gws = [
    'https://brown-ready-shark-280.mypinata.cloud',
    'https://ipfs.io',
    'https://gateway.pinata.cloud',
    'https://cloudflare-ipfs.com',
    'https://w3s.link',
    'https://nftstorage.link',
  ];
  for (const gw of gws) {
    const url = gw + '/ipfs/' + s;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return url;
    } catch {}
  }
  return ipfsToHttp(u);
}

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
    let r;
    try {
      r = await fetch(url, { ...opt, signal: ctrl.signal });
    } catch (_) {
      return null;                 // ← catch network/timeout errors and return null
    }
    if (!r || !r.ok) return null;  // non-200 → null
    try {
      return await r.json();
    } catch {
      return null;                 // bad JSON → null
    }
  } finally {
    clearTimeout(t);
  }
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
  const h = (hint || '').toLowerCase();

  // Accept common synonyms as an explicit hint
  if (['eth','ethereum','1','0x1'].includes(h)) return 'eth';
  if (['ape','apechain','apecoin','apecoinchain','8173','0x8173'].includes(h)) return 'ape';

  // Auto-detect if no usable hint
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

  // Inline data:application/json
  const inlined = parseDataJSON(metaURL);
  if (inlined) {
    let i = inlined.image || inlined.image_url || inlined.image_original_url || inlined.image_data || '';
    if (!i) return '';
    if (typeof i === 'string' && i.startsWith('<svg')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(i);
    }
    return i.startsWith('data:') ? i : ipfsToHttp(i);
  }

  // Helper to extract ipfs path
  const ipfsPath = (() => {
    const s = String(metaURL);
    if (s.startsWith('ipfs://')) return s.slice(7).replace(/^ipfs\//,'');
    const m = s.match(/\/ipfs\/([^?#]+)/i);
    return m ? m[1] : '';
  })();

  // Try multiple gateways for metadata JSON
  const RA_DEDICATED_GW = 'https://brown-ready-shark-280.mypinata.cloud';
  // For each gateway we try BOTH the bare path AND the path with .json appended,
  // because some collections (after migrating to Pinata) have files named '1.json' not '1'.
  const metaCandidates = (() => {
    if (!ipfsPath) return [ metaURL ];
    const gateways = [
      RA_DEDICATED_GW,
      'https://nftstorage.link',
      'https://cloudflare-ipfs.com',
      'https://w3s.link',
      'https://ipfs.io',
      'https://gateway.pinata.cloud'
    ];
    const out = [];
    for (const gw of gateways) {
      out.push(gw + '/ipfs/' + ipfsPath);
      // Only add .json variant if path does not already have an extension
      if (!/\.[a-z0-9]{2,5}$/i.test(ipfsPath)) {
        out.push(gw + '/ipfs/' + ipfsPath + '.json');
      }
    }
    return out;
  })();

  let meta = null;
  for (const u of metaCandidates) {
    meta = await fetchJSON(u, { cache: 'no-store' }, 8000);
    if (meta) break;
  }
  if (!meta) return '';

  let i = meta.image || meta.image_url || meta.image_original_url || meta.image_data || '';
  if (!i) return '';
  if (typeof i === 'string' && i.startsWith('<svg')) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(i);
  }
  return i.startsWith('data:') ? i : await pickWorkingIpfsUrl(i);
}

// Marketplace fallback: when IPFS metadata is unreachable (unpinned friend
// collections), ask OpenSea for the token and use their cached CDN image.
// Requires OPENSEA_API_KEY env var; silently skipped if not set.
async function openseaImage(chain, contract, tokenId) {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) return '';
  const slug = (chain === 'ape') ? 'ape_chain' : 'ethereum';
  const url = 'https://api.opensea.io/api/v2/chain/' + slug + '/contract/' + contract + '/nfts/' + tokenId;
  const data = await fetchJSON(url, { headers: { 'X-API-KEY': key, accept: 'application/json' } }, 8000);
  if (!data || !data.nft) return '';
  return data.nft.display_image_url || data.nft.image_url || '';
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

   // Prefer resolving metadata first unless tokenURI is clearly an image by extension/data:
let image = '';
if (/^data:image\//i.test(tokenURI) ||
    /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(tokenURI)) {
  image = tokenURI;
} else {
  // Try to read metadata (handles ipfs:// and Bueno)
  image = await resolveImage(tokenURI);

  // Marketplace fallback: unpinned IPFS content that OpenSea has cached
  if (!image) {
    try { image = await openseaImage(chain, contract, tokenId); } catch {}
  }

  // As a last resort, treat tokenURI itself as the image (some contracts point directly to an image)
  if (!image && (/^ipfs:\/\//i.test(tokenURI) || /^https?:\/\//i.test(tokenURI))) {
    image = await pickWorkingIpfsUrl(tokenURI);
  }
}

    return json(res, 200, { ok: !!image, chain, tokenURI, image: image || '' });
  } catch (e) {
    return json(res, 200, { ok: false, error: String(e?.message || e) });
  }
}
