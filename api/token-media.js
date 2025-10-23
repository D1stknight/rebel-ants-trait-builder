// /api/token-media.js
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x'); // Vercel Node uses req.url without origin
    const contract = String(url.searchParams.get('contract') || '').trim();
    const tokenId  = String(url.searchParams.get('tokenId')  || '').trim();

    if (!/^0x[0-9a-fA-F]{40}$/.test(contract) || !tokenId) {
      return json(res, 400, { ok: false, error: 'invalid params' });
    }

    // --- RPC pools with failover ---
    const ETH_RPCS = [
      process.env.RA_ETH_RPC,
      'https://ethereum.publicnode.com',
      'https://cloudflare-eth.com',
    ].filter(Boolean);

    const APE_RPCS = [
      process.env.RA_APE_RPC,
      'https://rpc.apecoinchain.org',
    ].filter(Boolean);

    // JSON-RPC call with timeout
    async function rpcCall(rpc, method, params) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(rpc, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: ctrl.signal
        });
        const j = await r.json().catch(() => null);
        if (j && j.result != null) return j.result;
        throw new Error(j?.error?.message || ('bad rpc: ' + r.status));
      } finally {
        clearTimeout(t);
      }
    }

    // Try several RPCs until one succeeds
    async function tryMany(rpcs, method, params) {
      let lastErr = null;
      for (const rpc of rpcs) {
        try {
          const out = await rpcCall(rpc, method, params);
          return [out, rpc];
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('rpc failed');
    }

    // Does contract exist on these RPCs?
    async function exists(rpcs) {
      try {
        const [code] = await tryMany(rpcs, 'eth_getCode', [contract, 'latest']);
        return code && code !== '0x';
      } catch {
        return false;
      }
    }

    // Detect chain
    let chain = null;
    if (await exists(ETH_RPCS)) chain = 'eth';
    else if (await exists(APE_RPCS)) chain = 'ape';
    if (!chain) return json(res, 404, { ok: false, error: 'contract not found on ETH or ApeChain' });

    const rpcs = chain === 'eth' ? ETH_RPCS : APE_RPCS;

    // tokenURI(uint256)
    const SIG = '0xc87b56dd';
    const idHex = BigInt(tokenId).toString(16).padStart(64, '0');
    const data  = SIG + idHex;

    const [callHex] = await tryMany(rpcs, 'eth_call', [{ to: contract, data }, 'latest']);
    if (!callHex || callHex === '0x') return json(res, 404, { ok: false, error: 'empty tokenURI result', chain });

    // ABI decode dynamic string
    const hex = callHex.slice(2);
    const ofs = parseInt(hex.slice(0, 64), 16) * 2;
    const len = parseInt(hex.slice(ofs, ofs + 64), 16) * 2;
    const strHex = hex.slice(ofs + 64, ofs + 64 + len);
    const bytes = new Uint8Array(strHex.match(/.{1,2}/g).map(h => parseInt(h, 16)));
    const tokenURI = new TextDecoder('utf-8').decode(bytes);

    // Helpers
    const ipfsToHttp = (u) => {
      if (!u) return u;
      if (u.startsWith('ipfs://')) {
        let p = u.slice(7);
        if (p.startsWith('ipfs/')) p = p.slice(5);
        // Use a gateway that’s generally reliable
        return `https://nftstorage.link/ipfs/${p}`;
      }
      return u;
    };

    function tryParseDataJSON(u) {
      try {
        const m = String(u).match(/^data:application\/json(?:;charset=[^;,]*)?(;base64)?,(.*)$/i);
        if (!m) return null;
        const isB64 = !!m[1];
        const payload = m[2];
        const jsonText = isB64 ? Buffer.from(payload, 'base64').toString('utf8')
                               : decodeURIComponent(payload);
        return JSON.parse(jsonText);
      } catch { return null; }
    }

    // tokenURI may already be an image
    if (/^data:image\//i.test(tokenURI) ||
        /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(tokenURI) ||
        tokenURI.startsWith('ipfs://')) {
      return json(res, 200, { ok: true, chain, tokenURI, image: ipfsToHttp(tokenURI) });
    }

    // Otherwise assume metadata JSON (data:… or http/ipfs)
    let meta = tryParseDataJSON(tokenURI);
    if (!meta) {
      const metaURL = ipfsToHttp(tokenURI);
      const r = await fetch(metaURL, { cache: 'no-store' });
      meta = await r.json().catch(() => null);
      if (!meta) return json(res, 502, { ok: false, chain, tokenURI, error: 'metadata fetch failed' });
    }

    const image =
      meta.image ||
      meta.image_url ||
      meta.image_original_url ||
      meta.image_data || '';

    if (!image) return json(res, 200, { ok: true, chain, tokenURI, image: '' });

    return json(res, 200, { ok: true, chain, tokenURI, image: ipfsToHttp(String(image)) });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e && e.message || e) });
  }
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}
