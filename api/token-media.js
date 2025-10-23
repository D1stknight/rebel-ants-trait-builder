// /api/token-media.js
// Resolve an NFT image URL from contract + tokenId for ETH or ApeChain by reading tokenURI()
// and following metadata (ipfs:, data:, http). Returns { ok, chain, tokenURI, image }.

// NOTE: This version uses CommonJS exports and avoids relying on global fetch/TextDecoder.
// It logs phases to help debug 502s in Vercel logs (Project → Functions → Logs).

const { TextDecoder } = require('util');

module.exports = async (req, res) => {
  const debug = { phase: 'start' };
  try {
    // --- Parse query --------------------------------------------------------
    const url = new URL(req.url, 'http://localhost'); // base only for parsing
    const contract = (url.searchParams.get('contract') || '').trim();
    const tokenId  = (url.searchParams.get('id') || '').trim();

    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      return send(res, 400, { ok:false, error:'bad contract' });
    }
    if (!/^\d+$/.test(tokenId)) {
      return send(res, 400, { ok:false, error:'bad token id' });
    }

    // --- Config -------------------------------------------------------------
    const ETH_RPC = process.env.RA_ETH_RPC || 'https://cloudflare-eth.com';
    const APE_RPC_CANDIDATES = [
      process.env.RA_APE_RPC,
      'https://rpc.apecoinchain.org',
      'https://rpc.apechain.com',
    ].filter(Boolean);

    // --- Helpers ------------------------------------------------------------
    const toHex32 = (nStr) => BigInt(String(nStr)).toString(16).padStart(64, '0');

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
        const jsonText = isB64 ? Buffer.from(payload, 'base64').toString('utf8')
                               : decodeURIComponent(payload);
        return JSON.parse(jsonText);
      } catch { return null; }
    }

    // fetch that also works if global fetch is not present
    async function DO_FETCH(input, init) {
      if (typeof fetch !== 'undefined') return fetch(input, init);
      const { default: nodeFetch } = await import('node-fetch');
      return nodeFetch(input, init);
    }

    async function rpcCall(rpc, method, params) {
      const body = JSON.stringify({ jsonrpc:'2.0', id:1, method, params });
      const r = await DO_FETCH(rpc, { method:'POST', headers:{ 'content-type':'application/json' }, body });
      if (!r.ok) throw new Error(`rpc http ${r.status}`);
      const j = await r.json();
      if (j && j.result != null) return j.result;
      throw new Error(j?.error?.message || 'rpc error');
    }

    async function contractExists(rpc, addr) {
      try {
        const code = await rpcCall(rpc, 'eth_getCode', [addr, 'latest']);
        return code && code !== '0x';
      } catch { return false; }
    }

    async function detectChain(addr) {
      // ETH first
      if (await contractExists(ETH_RPC, addr)) return { chain:'eth', rpc: ETH_RPC };
      // ApeChain next
      for (const cand of APE_RPC_CANDIDATES) {
        try {
          if (await contractExists(cand, addr)) return { chain:'ape', rpc: cand };
        } catch {}
      }
      return { chain:'unknown', rpc:null };
    }

    async function readTokenURI(rpc, addr, id) {
      // tokenURI(uint256)
      const sig  = '0xc87b56dd';
      const data = sig + toHex32(id);
      const result = await rpcCall(rpc, 'eth_call', [{ to: addr, data }, 'latest']);
      if (!result || result === '0x') throw new Error('empty tokenURI');

      // ABI decode dynamic string
      const hex = result.slice(2);

      // read big-endian u256 at offset (nibbles)
      const readU256 = (off) => parseInt(hex.slice(off, off + 64), 16);

      const ofs   = readU256(0) * 2;               // bytes → nibbles
      const len   = readU256(ofs) * 2;
      const strHx = hex.slice(ofs + 64, ofs + 64 + len);

      const bytes = Uint8Array.from(strHx.match(/.{1,2}/g).map(h => parseInt(h, 16)));
      return new TextDecoder('utf-8').decode(bytes);
    }

    async function loadMetadata(metaURL) {
      // data:application/json,...
      const inline = parseDataJSON(metaURL);
      if (inline) return inline;

      // ERC1155-style templates
      let url = metaURL.replace(/\{id\}/gi, toHex32(tokenId))
                       .replace(/\{tokenId\}/gi, toHex32(tokenId));
      url = ipfsToHttp(url);

      const r = await DO_FETCH(url, { cache:'no-store' });
      if (!r.ok) throw new Error(`meta http ${r.status}`);
      return await r.json();
    }

    // --- Resolve ------------------------------------------------------------
    debug.phase = 'detectChain';
    const { chain, rpc } = await detectChain(contract);
    if (!rpc) return send(res, 502, { ok:false, error:'contract not found on ETH or ApeChain' });

    debug.phase = 'tokenURI';
    let tokenURI = await readTokenURI(rpc, contract, tokenId);

    // Short-circuit if tokenURI is already an image/data
    if (/^data:image\//i.test(tokenURI) ||
        /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(tokenURI) ||
        tokenURI.startsWith('ipfs://')) {
      return send(res, 200, { ok:true, chain, tokenURI, image: ipfsToHttp(tokenURI) });
    }

    debug.phase = 'metadata';
    const meta = await loadMetadata(tokenURI);

    // Pick common fields
    const image =
      meta?.image ||
      meta?.image_url ||
      meta?.image_original_url ||
      meta?.image_data || null;

    if (!image) {
      return send(res, 404, {
        ok:false, chain, tokenURI,
        error:'image not found in metadata',
        metaKeys: Object.keys(meta || {}).slice(0, 12)
      });
    }

    return send(res, 200, { ok:true, chain, tokenURI, image: ipfsToHttp(String(image)) });

  } catch (e) {
    return send(res, 500, { ok:false, error:String(e?.message || e), debug });
  }
};

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}
