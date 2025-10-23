// api/token-media.js
//
// Resolve an NFT's image URL without Reservoir by reading tokenURI/uri on-chain
// and then fetching the metadata (handles ipfs://, data:application/json, Bueno).
//
// Query:
//   /api/token-media?contract=0x...&id=123[&chain=eth|ape]
// Response JSON:
//   { ok: true, chain: "eth"|"ape", tokenURI: "<url or data:json>", image: "<url-or-data-uri>" }

const ETH_RPC = process.env.ETH_RPC || 'https://cloudflare-eth.com';
const APE_RPC = process.env.APECHAIN_RPC || 'https://rpc.apecoinchain.org';

// --- tiny helpers ----------------------------------------------------------
const pad64 = (hex) => hex.replace(/^0x/, '').padStart(64, '0').toLowerCase();
const toHex32 = (id) => '0x' + pad64(BigInt(String(id)).toString(16));

function ipfsToHttp(u) {
  if (!u) return u;
  if (u.startsWith('ipfs://')) {
    let p = u.slice(7);
    if (p.startsWith('ipfs/')) p = p.slice(5);
    return `https://nftstorage.link/ipfs/${p}`;
  }
  return u;
}

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function fetchJSON(url, opt = {}, ms = 7000) {
  const r = await Promise.race([
    fetch(url, opt),
    timeout(ms)
  ]);
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

async function rpcCall(rpc, method, params, ms = 7000) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const r = await Promise.race([
    fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    timeout(ms)
  ]);
  const j = await r.json().catch(() => null);
  if (j && j.result != null) return j.result;
  throw new Error((j && (j.error?.message || j.error)) || 'rpc error');
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

async function contractExists(rpc, addr) {
  try { return (await rpcCall(rpc, 'eth_getCode', [addr, 'latest'])) !== '0x'; }
  catch { return false; }
}

async function detectChain(addr, hint) {
  const a = addr.toLowerCase();
  if (hint === 'eth' || hint === 'ape') return hint;
  // prefer ETH if present
  if (await contractExists(ETH_RPC, a)) return 'eth';
  if (await contractExists(APE_RPC, a)) return 'ape';
  return ''; // unknown
}

// Try ERC‑721 tokenURI
async function tryTokenURI(rpc, addr, tokenId) {
  const sig = '0xc87b56dd'; // keccak256("tokenURI(uint256)")
  const data = sig + toHex32(tokenId).slice(2);
  try {
    const res = await rpcCall(rpc, 'eth_call', [{ to: addr, data }, 'latest']);
    return decodeAbiString(res) || '';
  } catch { return ''; }
}

// Try ERC‑1155 uri(uint256) with {id} placeholders
async function tryUri1155(rpc, addr, tokenId) {
  const sig = '0x0e89341c'; // keccak256("uri(uint256)")
  const data = sig + toHex32(tokenId).slice(2);
  try {
    const res = await rpcCall(rpc, 'eth_call', [{ to: addr, data }, 'latest']);
    const tpl = decodeAbiString(res) || '';
    if (!tpl) return '';

    // Replace common placeholders
    const dec = String(tokenId);
    const hex64 = pad64(BigInt(String(tokenId)).toString(16));
    const hex   = BigInt(String(tokenId)).toString(16);

    return tpl
      .replace(/\{id\}/gi, hex64)
      .replace(/\{tokenId\}/gi, dec)
      .replace(/\{idHex\}/gi, hex)
      .replace(/\{id64\}/gi, hex64);
  } catch { return ''; }
}

// If metadata is inlined as data:application/json,...
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

async function resolveImageFromMetadata(metaURL) {
  if (!metaURL) return '';

  // data:application/json (inlined metadata)
  const inlined = parseDataJSON(metaURL);
  if (inlined) {
    const img = inlined.image || inlined.image_url || inlined.image_original_url || inlined.image_data || '';
    return img.startsWith('data:') ? img : ipfsToHttp(img);
  }

  // Bueno / IPFS / HTTPS metadata
  const url = ipfsToHttp(metaURL);
  const meta = await fetchJSON(url, { cache: 'no-store' }, 7000) || {};

  // common fields
  let img = meta.image || meta.image_url || meta.image_original_url || meta.image_data || '';
  if (!img) return '';

  if (typeof img === 'string' && img.startsWith('<svg')) {
    // inline as data: for svg
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(img);
  }
  return img.startsWith('data:') ? img : ipfsToHttp(img);
}

// --- main handler ----------------------------------------------------------
export default async function handler(req, res) {
  try {
    const contract = String(req.query.contract || '').trim();
    const tokenId  = String(req.query.id || req.query.tokenId || req.query.token || '').trim();
    const hint     = (req.query.chain || '').toLowerCase();

    if (!/^0x[0-9a-fA-F]{40}$/.test(contract) || !/^\d+$/.test(tokenId)) {
      return res.status(400).json({ ok: false, error: 'bad params' });
    }

    const chain = await detectChain(contract, hint);
    if (!chain) return res.status(400).json({ ok: false, error: 'contract not found on ETH or ApeChain' });

    const rpc = chain === 'ape' ? APE_RPC : ETH_RPC;

    // 1) ERC‑721
    let tokenURI = await Promise.race([ tryTokenURI(rpc, contract, tokenId), timeout(6500) ]).catch(() => '');
    // 2) Fall back to ERC‑1155
    if (!tokenURI) {
      tokenURI = await Promise.race([ tryUri1155(rpc, contract, tokenId), timeout(6500) ]).catch(() => '');
    }

    // 3) If still nothing, bail
    if (!tokenURI) {
      return res.status(200).json({ ok: false, chain, tokenURI: '', image: '' });
    }

    // If tokenURI itself is an image, use it; otherwise load metadata
    let image = '';
    if (/^data:image\//i.test(tokenURI) ||
        /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(tokenURI) ||
        tokenURI.startsWith('ipfs://')) {
      image = ipfsToHttp(tokenURI);
    } else {
      image = await resolveImageFromMetadata(tokenURI);
    }

    res.setHeader('cache-control', 'no-store');
    return res.status(200).json({ ok: !!image, chain, tokenURI, image: image || '' });
  } catch (e) {
    // Avoid 502s: always return JSON
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
}
