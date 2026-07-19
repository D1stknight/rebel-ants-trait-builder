// ============================================================================
// 31-collections-loader.js
// Original app.js lines 6131-6563 (433 lines)
// ============================================================================


/* ========== RA_COLLECTIONS_RESET_v1 — single dropdown + clean CSS + multi-collection loader ========== */
(()=>{
  // ----- config (no changes needed) -----
  const ROW_ID = 'raColRow';
  const SELECT_ID = 'raColSelect';
  const STATUS_ID = 'raColStatus';
  const REFRESH_ID = 'raColRefresh';

  // Tiny CSS to make the row look right and full-width inside the Upload card
  try{
    if (!document.getElementById('raColCss')){
      const st = document.createElement('style');
      st.id = 'raColCss';
      st.textContent = `
  #${ROW_ID}{display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:8px;}
  #${ROW_ID} label{flex:1 1 auto; min-width:76px; opacity:.75}
  #${ROW_ID} button{height:32px; padding:0 10px;}
  #${ROW_ID} select{flex:1 1 100%; height:32px; border:1px solid #313131; background:#121212; color:#fff; border-radius:6px; padding:4px 8px;}
  #${STATUS_ID}{flex-basis:100%; display:block; margin-top:6px; font-size:12px; opacity:.66;}
`;
      document.head.appendChild(st);
    }
  }catch(_){}

  const S = { list:[], selectedKey:null };

  // --- helpers ---
  const $ = (id)=>document.getElementById(id);

 function normalizeChainId(v){
  if (v == null) return null;
  if (typeof v === 'number') return '0x' + v.toString(16);
  if (typeof v === 'string'){
    if (/^0x/i.test(v)) return v.toLowerCase();
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return '0x' + n.toString(16);
  }
  return null;
}
function chainSlugFromId(cidHex){
  const c = (cidHex||'').toLowerCase();
  if (c === '0x1')    return 'ethereum';
  if (c === '0x2105') return 'base';
  if (c === '0x8173') return 'apechain';
  return 'ethereum'; // safe default
}
function netNameFromChainId(cidHex){
  const c = (cidHex||'').toLowerCase();
  if (c === '0x1')    return 'Ether';
  if (c === '0x2105') return 'Base';
  if (c === '0x8173') return 'ApeChain';
  return 'Unknown';
}

 async function fetchCollections(){
  try{
    const r = await fetch('/api/ra-collections');
    const j = await r.json();
    const arr = (j && (j.collections||j.data||[])) || [];
    const out = arr
      .map((x,i)=>{
        const chainId = normalizeChainId(x.chainId || x.chain || x.network || x.net) || '0x1';
        return {
          key:     x.key || x.slug || (x.name||'col')+'_'+i,
          name:    (x.name || x.label || 'Unnamed').trim(),
          address: (x.address || x.contract || '').trim(),
          chainId,
          slug:    chainSlugFromId(chainId), // 'ethereum' | 'base' | 'apechain'
          tag:     (x.tag==='rebel' ? 'rebel' : 'friend')
        };
      })
      .filter(x => x.address);

    // Make Rebel the default/first, then the rest
    out.sort((a,b)=>{
      if (a.tag==='rebel' && b.tag!=='rebel') return -1;
      if (b.tag==='rebel' && a.tag!=='rebel') return 1;
      return a.name.localeCompare(b.name);
    });
    return out;
  }catch(_){
    // Safe fallback
    return [
      { key:'rebel-eth',  name:'Rebel Ants',   address:'0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221', chainId:'0x1', slug:'ethereum', tag:'rebel'  },
      { key:'sola-eth',   name:'Saints of LA', address:'0xbEd2470deD2519c13EaaF3Bd970015ef404d3D20', chainId:'0x1', slug:'ethereum', tag:'friend' }
    ];
  }
}

  function currentCol(){
    if (!S.list.length) return null;
    if (S.selectedKey){
      const found = S.list.find(c=>c.key===S.selectedKey);
      if (found) return found;
    }
    return S.list[0] || null;
  }

  function findTokenIdInput(){
    return $('tokenId') ||
           document.querySelector('input#token') ||
           document.querySelector('input[name="token"]') ||
           document.querySelector('input[placeholder*="Token"]');
  }

  async function ensureUI(){
    // Anchor under the Token ID row
    const tokenInput = findTokenIdInput();
    if (!tokenInput || !tokenInput.parentElement) return;

    // Create row once
    let row = $(ROW_ID);
    if (!row){
      row = document.createElement('div');
      row.id = ROW_ID;
      row.innerHTML = `
  <label>Collection</label>
  <button id="${REFRESH_ID}" type="button">Refresh</button>
  <select id="${SELECT_ID}"></select>
  <span id="${STATUS_ID}"></span>
`;
      // Put it as a sibling right under the token input’s container
      const anchor = tokenInput.parentElement;
      (anchor.parentElement || anchor).appendChild(row);
    }

    // Fill options
    const sel = $(SELECT_ID);
    sel.innerHTML = '';
    S.list.forEach(c=>{
      const o = document.createElement('option');
      o.value = c.key;
      o.textContent = `${c.name} — ${netNameFromChainId(c.chainId)}`;
      sel.appendChild(o);
    });
    // Restore/choose selection
    if (S.selectedKey && Array.from(sel.options).some(o => o.value === S.selectedKey)) {
  sel.value = S.selectedKey;
} else {
  S.selectedKey = sel.options[0] ? sel.options[0].value : null;
  sel.value = S.selectedKey || '';
}

    // Status text
    const st = $(STATUS_ID);
    const col = currentCol();
    if (st) st.textContent = col ? `Using: ${col.name}` : '';

   sel.onchange = ()=>{
  S.selectedKey = sel.value;
  const col = currentCol();
  if ($(STATUS_ID)) $(STATUS_ID).textContent = col ? `Using: ${col.name}` : '';
  try { document.dispatchEvent(new CustomEvent('ra-collection-change', { detail: col })); } catch(_){}
};

    const ref = $(REFRESH_ID);
    if (ref) ref.onclick = async ()=>{
      S.list = await fetchCollections();
      await ensureUI();
    };
  }

  // Use Reservoir tokens API (same one you already use for Rebels) but with the selected contract
  function normalizeUrl(u){
  if (!u) return null;
  if (u.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + u.slice(7);
  return u;
}
function annotateBase(meta){
  const c = window.canvas; if (!c) return;
  // Try to find the base image/group
  const objs = c.getObjects ? c.getObjects() : [];
  let base = objs.find(o => o && o._isBase && !o._isBgRect) || null;
  if (!base){
    // Fallback: last image on canvas
    const imgs = objs.filter(o => (o.type === 'image' || o._element) && !false);
    base = imgs[imgs.length-1] || null;
  }
  if (!base) return;
  base._tokenContract = (meta.contract||'').toLowerCase();
  base._tokenChain    = meta.chain;
  base._tokenName     = meta.name;
  try { document.dispatchEvent(new CustomEvent('ra-collection-change', { detail: meta })); } catch(_){}
  try { c.requestRenderAll(); } catch(_){}
}

// Robust token media resolver with fallback to tokenURI
async function resolveTokenMedia(contract, tokenId, col) {
  const slug = col.slug || chainSlugFromId(col.chainId) || 'ethereum';
  const tokenKey = `${contract}:${tokenId}`;
  
  // Step A: Try Reservoir first
  const reservoirUrl = `https://api.reservoir.tools/tokens/v7?tokens=${encodeURIComponent(tokenKey)}&chain=${encodeURIComponent(slug)}&includeAttributes=false&limit=1`;
  
  try {
    const r = await fetch(reservoirUrl, { headers: { 'accept': 'application/json' }, cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const t = j?.tokens?.[0]?.token || {};
      const media = t.media || {};
      const img = normalizeUrl(
        (media.original && (media.original.url || media.original.mediaUrl)) ||
        t.imageLarge || t.image || t.imageSmall
      );
      if (img) return img; // Success with Reservoir
    }
  } catch (err) {
    console.warn('Reservoir lookup failed:', err);
  }

  // Step B: Fallback to tokenURI via RPC
  try {
    const rpcUrl = col.rpcUrl || getRpcForChain(col.chainId);
    if (!rpcUrl) throw new Error('No RPC URL available for chain');

    // Call tokenURI(tokenId) on the contract
    const tokenUriResult = await callTokenURI(contract, tokenId, rpcUrl);
    if (!tokenUriResult) throw new Error('No tokenURI returned');

    // Step C: Resolve metadata URL schemes and extract image
    const metadataUrl = normalizeMetadataUrl(tokenUriResult);
    const metadata = await fetchMetadataWithTimeout(metadataUrl);
    
    const imageUrl = normalizeUrl(
      metadata.image || metadata.image_url || metadata.imageURI
    );
    
    if (imageUrl) return imageUrl;
    
  } catch (err) {
    console.warn('TokenURI fallback failed:', err);
  }

  throw new Error('No image found via Reservoir or tokenURI fallback');
}

// Get RPC URL for chain ID
function getRpcForChain(chainId) {
  const normalizedChainId = normalizeChainId(chainId);
  if (normalizedChainId === '0x1') return 'https://rpc.ankr.com/eth';
  if (normalizedChainId === '0x8173') return window.__APECHAIN_RPC || 'https://rpc.apecoinchain.org';
  if (normalizedChainId === '0x2105') return 'https://mainnet.base.org';
  return null;
}

// Call tokenURI via RPC with timeout
async function callTokenURI(contract, tokenId, rpcUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    // ERC-721 tokenURI function signature: 0xc87b56dd
    const data = '0xc87b56dd' + parseInt(tokenId, 10).toString(16).padStart(64, '0');
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: contract, data }, 'latest'],
        id: 1
      }),
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`RPC call failed: ${response.status}`);
    
    const result = await response.json();
    if (result.error) throw new Error(`RPC error: ${result.error.message}`);
    
    // Decode hex string result (skip first 64 chars for offset, next 64 for length)
    const hexResult = result.result;
    if (!hexResult || hexResult === '0x') return null;
    
    const dataStart = 2 + 64 + 64; // Skip 0x + offset + length  
    const hexData = hexResult.slice(dataStart);
    return hexData ? Buffer.from(hexData, 'hex').toString('utf8').replace(/\0/g, '') : null;
    
  } finally {
    clearTimeout(timeoutId);
  }
}

// Normalize metadata URL schemes
function normalizeMetadataUrl(uri) {
  if (!uri) return null;
  
  // Handle data URLs (base64 JSON)
  if (uri.startsWith('data:')) return uri;
  
  // Handle IPFS
  if (uri.startsWith('ipfs://')) {
    return 'https://brown-ready-shark-280.mypinata.cloud/ipfs/' + uri.replace('ipfs://', '').replace(/^ipfs\//, '');
  }
  
  // Handle Arweave
  if (uri.startsWith('ar://')) {
    return 'https://arweave.net/' + uri.replace('ar://', '');
  }
  
  // Handle HTTP/HTTPS
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  
  return uri;
}

// Fetch metadata with timeout and parse JSON
async function fetchMetadataWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    // Handle data URLs
    if (url.startsWith('data:')) {
      const base64Data = url.split(',')[1];
      const jsonStr = Buffer.from(base64Data, 'base64').toString('utf8');
      return JSON.parse(jsonStr);
    }

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Metadata fetch failed: ${response.status}`);
    
    return await response.json();
    
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadTokenFromCollection(tokenId, col){
  const contract = (col && col.address) || '';
  if (!contract){ alert('No contract for selected collection.'); return; }

  try {
    const img = await resolveTokenMedia(contract, tokenId, col);
    if (!img) { 
      alert('No image found for that token.'); 
      return; 
    }

    // Use your existing base loader
    if (typeof window.loadBaseImage === 'function') {
      await window.loadBaseImage(img, /*isToken*/ true);
    } else if (typeof window.loadBase === 'function') {
      await window.loadBase(img);
    } else {
      // very safe fallback
      const i = new Image();
      i.crossOrigin = 'anonymous';
      await new Promise((res,rej)=>{ i.onload=res; i.onerror=rej; i.src=img; });
      const base = new fabric.Image(i, { selectable:false, evented:false, _isBase:true });
      const c = window.canvas; c && c.clear(); c && c.add(base); c && c.requestRenderAll();
    }
  
  } catch (error) {
    console.error('Token loading failed:', error);
    alert(error.message || 'Failed to load token image');
    return;
  }

  function autoFitBase(){
    const c = window.canvas; if (!c) return;
    const base = (c.getObjects?.() || []).find(o => o && o._isBase && !o._isBgRect);
    if (!base || !base.width || !base.height) return;

    const maxW = c.getWidth(), maxH = c.getHeight();
    const scale = Math.min(maxW / base.width, maxH / base.height);

    base.set({
      scaleX: scale, scaleY: scale,
      left: (maxW - base.width * scale) / 2,
      top:  (maxH - base.height * scale) / 2
    });
    base.setCoords();
    try{ c.requestRenderAll(); }catch(_){}
  }

  const slug = col.slug || chainSlugFromId(col.chainId) || 'ethereum';
  annotateBase({ contract, chain: slug, name: col.name });
  autoFitBase();
}

  function hookLoadByToken(){
    // Button
    const btn = $('loadByToken') ||
                Array.from(document.querySelectorAll('button')).find(b=>/load by token/i.test(b.textContent||''));
    if (!btn) return;

  const handler = async (e)=>{
  try{ e.preventDefault(); e.stopImmediatePropagation(); }catch(_){}
  const inp = findTokenIdInput();
  const tokenId = (inp && inp.value || '').trim();
  if (!tokenId){ alert('Enter a token ID first.'); return; }
  const col = currentCol();
  if (!col){ alert('Pick a collection first.'); return; }

  const st = document.getElementById('raColStatus');
  if (st) st.textContent = `Fetching ${col.name} #${tokenId}…`;

  try{
    await loadTokenFromCollection(tokenId, col);
    if (st) st.textContent = `Loaded ${col.name} #${tokenId}`;
  }catch(_){
    if (st) st.textContent = `Failed to load ${col.name} #${tokenId}`;
  }
};
    // Bind in capture mode so we override earlier listeners that hard‑coded Rebels
    btn.addEventListener('click', handler, true);

    // Also bind Enter on the token id input
    const inp = findTokenIdInput();
    if (inp){
      inp.addEventListener('keydown', (e)=>{ if (e.key === 'Enter'){ handler(e); }});
    }
  }

  async function boot(){
    S.list = await fetchCollections();
    await ensureUI();
    hookLoadByToken();
  }

  // kick off
  boot();
})();