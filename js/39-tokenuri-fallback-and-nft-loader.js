// ============================================================================
// 39-tokenuri-fallback-and-nft-loader.js
// Original app.js lines 7234-7287 (54 lines)
// ============================================================================


/* ===== RA_TOKENURI_FALLBACK_FOR_APECHAIN ===== */
(function(){
  if (window.__RA_APE_RPC_FALLBACK__) return;
  window.__RA_APE_RPC_FALLBACK__ = true;

  // We set a safe default earlier in CONFIG. You can still override window.__APECHAIN_RPC at runtime if needed.

  async function jsonRpc(url, body){
    const r = await fetch(url, {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('rpc http '+r.status);
    const j = await r.json();
    if (j.error) throw new Error('rpc error '+(j.error.message||''));
    return j.result;
  }

  function ipfsToHttp(u){
    if (!u) return u;
    if (u.startsWith('ipfs://ipfs/')) return 'https://gateway.pinata.cloud/ipfs/'+u.slice(12);
    if (u.startsWith('ipfs://'))      return 'https://gateway.pinata.cloud/ipfs/'+u.slice(7);
    return u;
  }

  window.__fetchApechainImageURL = async function(contract, tokenId){
    const rpc = window.__APECHAIN_RPC;  // now guaranteed to exist
    if (!rpc) return null;

    // tokenURI(uint256) = 0xc87b56dd
    const idHex = '0x' + BigInt(String(tokenId).replace(/[^0-9]/g,'')||'0').toString(16);
    const data  = '0xc87b56dd' + idHex.replace(/^0x/,'').padStart(64,'0');
    const call  = { to: contract, data };

    const res = await jsonRpc(rpc, { jsonrpc:'2.0', id:1, method:'eth_call', params:[call, 'latest'] });

    // decode ABI string result
    const hex = (res||'').replace(/^0x/,'');
    if (hex.length < 128) return null;
    const len = parseInt(hex.slice(64,128),16);
    const dataHex = hex.slice(128, 128+len*2);
    let uri = '';
    for (let i=0;i<dataHex.length;i+=2) uri += String.fromCharCode(parseInt(dataHex.slice(i,i+2),16));

    // fetch metadata → image
    const metaUrl = ipfsToHttp(uri);
    const mRes = await fetch(metaUrl, {cache:'no-store'});
    if (!mRes.ok) return null;
    const meta = await mRes.json().catch(()=>null);
    return ipfsToHttp(meta && (meta.image || meta.image_url || meta.imageUrl));
  };
})();