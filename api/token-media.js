// api/token-media.js
// Returns { ok, chain, tokenURI, image } for a given contract + tokenId.
// Supports ERC-721 (tokenURI) and ERC-1155 (uri with {id} template) on ETH & ApeChain.

const ETH_RPC = process.env.ETH_RPC || 'https://cloudflare-eth.com';
const APE_RPC = process.env.APE_RPC || 'https://rpc.apecoinchain.org';

// --------- helpers ---------
const toHex32 = (nStr) => {
  const n = BigInt(String(nStr));
  return n.toString(16).padStart(64, '0'); // lowercase hex, 32 bytes
};

const ipfsToHttp = (u) => {
  if (!u) return u;
  if (u.startsWith('ipfs://')) {
    let p = u.slice(7);
    if (p.startsWith('ipfs/')) p = p.slice(5);
    // nftstorage gateway is reliable and CORS-friendly
    return `https://nftstorage.link/ipfs/${p}`;
  }
  return u;
};

// Decode a Solidity dynamic string return (ABI-encoded) from hex "0x..."
function decodeDynString(hexData) {
  if (!hexData || hexData === '0x') return '';
  const hex = hexData.slice(2);
  const offs = parseInt(hex.slice(0, 64), 16) * 2;
  const len  = parseInt(hex.slice(offs, offs + 64), 16) * 2;
  const strHex = hex.slice(offs + 64, offs + 64 + len);
  return Buffer.from(strHex, 'hex').toString('utf8');
}

async function rpcCall(rpc, method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const j = await r.json().catch(() => null);
  if (!j) throw new Error('rpc: bad json');
  if (j.result != null) return j.result;
  throw new Error(j.error?.message || 'rpc error');
}

async function contractHasCode(rpc, addr) {
  try {
    const code = await rpcCall(rpc, 'eth_getCode', [addr, 'latest']);
    return code && code !== '0x';
  } catch {
    return false;
  }
}

async function detectChain(addr, hint) {
  if (hint === 'eth' || hint === 'ape') return hint;
  // Try ETH first, then ApeChain
  if (await contractHasCode(ETH_RPC, addr)) return 'eth';
  if (await contractHasCode(APE_RPC, addr)) return 'ape';
  return null;
}

// --- Read tokenURI for ERC-721
async function read721(chain, addr, tokenId) {
  const rpc = chain === 'ape' ? APE_RPC : ETH_RPC;
  const data = '0xc87b56dd' + toHex32(tokenId); // tokenURI(uint256)
  const out = await rpcCall(rpc, 'eth_call', [{ to: addr, data }, 'latest']);
  return decodeDynString(out);
}

// --- Read uri for ERC-1155 (and expand {id})
async function read1155(chain, addr, tokenId) {
  const rpc = chain === 'ape' ? APE_RPC : ETH_RPC;
  const data = '0x0e89341c' + toHex32(tokenId); // uri(uint256)
  const out = await rpcCall(rpc, 'eth_call', [{ to: addr, data }, 'latest']);
  let uri = decodeDynString(out);
  if (!uri) return '';

  // ERC‑1155 template replacement: {id} → 64‑char lowercase hex
  const hexId = toHex32(tokenId);
  uri = uri.replace(/\{id\}/g, hexId);        // standard form
  uri = uri.replace(/\{ID\}/g, hexId);        // some use uppercase
  return uri;
}

async function fetchJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('meta http ' + r.status);
  return r.json();
}

function parseDataJson(u) {
  const m = /^data:application\/json(?:;charset=[^;,]*)?(;base64)?,(.*)$/i.exec(String(u) || '');
  if (!m) return null;
  const isB64 = !!m[1];
  const payload = m[2];
  const text = isB64 ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload);
  try { return JSON.parse(text); } catch { return null; }
}

async function resolveImageFromTokenURI(tokenURI) {
  if (!tokenURI) return '';

  // If tokenURI itself is an image URL or data:image,...
  if (/^data:image\//i.test(tokenURI) || /\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(tokenURI)) {
    return ipfsToHttp(tokenURI);
  }

  // data:application/json;... inline metadata
  const inline = parseDataJson(tokenURI);
  if (inline) {
    const img = inline.image || inline.image_url || inline.image_original_url || inline.image_data || '';
    return ipfsToHttp(String(img || ''));
  }

  // Otherwise fetch JSON from URL (including ipfs://)
  const metaURL = ipfsToHttp(tokenURI);
  const meta = await fetchJSON(metaURL).catch(() => null);
  if (!meta) return '';

  const img =
    meta.image ||
    meta.image_url ||
    meta.image_original_url ||
    meta.image_data ||
    '';

  return ipfsToHttp(String(img || ''));
}

// --------- API handler ---------
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const contract = String(req.query.contract || '').trim();
    const id = String(req.query.id || req.query.token || '').trim();
    const chainHint = String(req.query.chain || '').toLowerCase(); // 'eth' | 'ape' (optional)

    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      return res.status(400).json({ ok: false, error: 'bad contract' });
    }
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'bad token id' });
    }

    const chain = await detectChain(contract, (chainHint === 'apechain' ? 'ape' : chainHint));
    if (!chain) {
      return res.status(502).json({ ok: false, error: 'contract not found on ETH or ApeChain' });
    }

    // Try 721 first, then 1155
    let tokenURI = '';
    try { tokenURI = await read721(chain, contract, id); } catch {}
    if (!tokenURI) {
      try { tokenURI = await read1155(chain, contract, id); } catch {}
    }

    // If still empty, return a clear error
    if (!tokenURI) {
      return res.status(200).json({ ok: false, chain, tokenURI: '', image: '' });
    }

    const image = await resolveImageFromTokenURI(tokenURI).catch(() => '');
    return res.status(200).json({ ok: true, chain, tokenURI, image });
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}
