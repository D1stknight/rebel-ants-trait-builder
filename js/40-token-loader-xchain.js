// ============================================================================
// 40-token-loader-xchain.js (renamed from 40-desktop-sticky-columns.js -
// this file is the cross-chain token/NFT loader, not layout code)
// Original app.js lines 7288-8675 (1388 lines)
// ============================================================================



/* ===== RA_TOKEN_LOADER_XCHAIN_V3 — paste at the very bottom of app.js ===== */
;(() => {
  'use strict';
  if (window.__RA_TOKEN_LOADER_XCHAIN_V3__) return;
  window.__RA_TOKEN_LOADER_XCHAIN_V3__ = true;

  // ---------- small helpers ----------
  const getCanvas = () =>
    (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  const $ = (sel, r = document) => r.querySelector(sel);

  // Known collections → {address, chain}
  const KNOWN = {
    // name (lowercase) : { address, chain }
    'rebel ants':   { address:'0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221', chain:'ethereum' },
    'saints of la': { address:'0xb9b8c62590bd0aa759331a1f6cae4c9a1a7c8e1e', chain:'ethereum' }, // Saints of LA | Ascension (post-migration)
    'chumpz':       { address:'0xa9a1d086623475595a02991664742e4a1cbafcb8', chain:'apechain' }
  };

  // Quick map: contract → chain
  const CONTRACT_FOR = {
    '0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221': 'ethereum',
    '0xb9b8c62590bd0aa759331a1f6cae4c9a1a7c8e1e': 'ethereum',
    '0xa9a1d086623475595a02991664742e4a1cbafcb8': 'apechain'
  };

  const normHex = s => (s || '').toLowerCase();
  function slugFromChain(v){
  const x = (v || '').toString().toLowerCase().trim();
  if (x === '0x1'    || x === '1'    || x === 'eth' || x.includes('ether')) return 'ethereum';
  if (x === '0x2105' || x.includes('base'))                                 return 'base';
  if (x === '0x8173' || x.includes('ape'))                                  return 'apechain';
  return x || 'ethereum';
}

  function detectSelectionName(){
    // From status row (if present)
    const st = $('#raColStatus');
    if (st && st.textContent) {
      // "Using: Chumpz (ApeChain)" → "chumpz"
      const name = st.textContent
        .replace(/^.*using:\s*/i,'')
        .split('—')[0]
        .split('(')[0]
        .trim()
        .toLowerCase();
      if (name) return name;
    }
    // From visible select (if present)
    const sel = $('#raColSelect');
    if (sel && sel.selectedOptions && sel.selectedOptions[0]) {
      const t = (sel.selectedOptions[0].textContent || '')
        .split('—')[0].split('(')[0].trim().toLowerCase();
      if (t) return t;
    }
    return null;
  }

  function detectContractAndChain(){
    // Highest priority: URL/query or explicit window overrides
    const q     = new URLSearchParams(location.search);
    const cQ    = q.get('contract') || q.get('c') || '';
    const chQ   = q.get('chain') || q.get('network') || '';
    const cWin  = window.__RA_CONTRACT || window._RA_CONTRACT || '';
    const chWin = window.__RA_CHAIN    || window._RA_CHAIN    || '';
    if (cQ || cWin) {
      const c = normHex(cQ || cWin);
      const ch = slugFromChain(chQ || chWin || CONTRACT_FOR[c]);
      return { contract: c, chain: ch, name: '' };
    }

    // Next: look up by collection name shown in UI
    const name = detectSelectionName();
    if (name && KNOWN[name]) {
      return { contract: normHex(KNOWN[name].address), chain: KNOWN[name].chain, name };
    }

    // Otherwise, do nothing; let the app’s original loader handle it
    return null;
  }

  function readTokenId(){
    const ids = [
      '#tokenId', '#token', '#tokenIdInput',
      'input[name="token"]', 'input[name="tokenId"]',
      'input[placeholder*="Token"]'
    ];
    for (const s of ids){
      const el = $(s);
      const v  = (el && (el.value || '').trim()) || '';
      if (v) return v;
    }
    // Fallback: any input/textarea with "token" in placeholder + a value
    const maybe = Array.from(document.querySelectorAll('input,textarea'))
      .find(el => /token/i.test(el.placeholder || '') && (el.value || '').trim());
    return maybe ? maybe.value.trim() : '';
  }

  function normalizeUrl(u){
    if (!u) return null;
    if (u.startsWith('ipfs://')) return 'https://brown-ready-shark-280.mypinata.cloud/ipfs/' + u.replace('ipfs://','').replace(/^ipfs\//,'');
    if (u.startsWith('ar://'))   return 'https://arweave.net/' + u.replace('ar://','');
    return u;
  }

// Extract IPFS path (CID + optional path) from ipfs://… or …/ipfs/…
function __ipfsPath(u){
  if (!u) return '';
  const s = String(u);
  if (s.startsWith('ipfs://')) return s.slice(7).replace(/^ipfs\//,'');
  const m = s.match(/\/ipfs\/([^?#]+)/i);
  return m ? m[1] : '';
}

// Expand a single ipfs URL or /ipfs/ URL into a list of HTTP gateway candidates
function __expandIpfsCandidates(u){
  const p = __ipfsPath(u);
  if (!p) return u ? [u] : [];
  // Dead public gateways removed (cloudflare-ipfs shut down; nftstorage
  // unreliable). Dedicated Pinata gateway first, generic survivors after.
  const bases = [
    'https://brown-ready-shark-280.mypinata.cloud/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/'
  ];
  return bases.map(b => b + p);
}

// === STABLE VERSION ===
async function reservoirCandidates(contract, tokenId /* chain hint not required */){
  const url = `/api/token-media?contract=${encodeURIComponent(contract)}&id=${encodeURIComponent(tokenId)}`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json().catch(() => null) || {};

    const out = new Set();

    // primary image
    for (const u of __expandIpfsCandidates(j && j.image)) out.add(u);

    // tokenURI sometimes is itself an image; include it too
    if (j && typeof j.tokenURI === 'string') {
      const tu = j.tokenURI;
      const looksLikeImg =
        /^data:image\//i.test(tu) ||
        /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(tu) ||
        tu.startsWith('ipfs://') || /\/ipfs\//i.test(tu);
      if (looksLikeImg) {
        for (const u of __expandIpfsCandidates(tu)) out.add(u);
      }
    }

    // keep order stable; return as array
    return Array.from(out);
  } catch {
    return [];
  }
}
   
function killOldBase(c){
  const objs = (c.getObjects() || []).slice();
  const cw = c.getWidth(), ch = c.getHeight();

  const imgLike = o => o && (o.type === 'image' || o._element);
  const isGroup = o => o && o.type === 'group';

  const boundsArea = o => {
    try {
      const br = o.getBoundingRect(true, true);
      return (br?.width || 0) * (br?.height || 0);
    } catch(_) { return 0; }
  };

  const imageArea = o => {
    const w = (o.getScaledWidth ? o.getScaledWidth() : (o.width||0) * (o.scaleX||1));
    const h = (o.getScaledHeight? o.getScaledHeight(): (o.height||0) * (o.scaleY||1));
    return w * h;
  };

  // Collect all candidates we may want to remove; compute a reasonable threshold
  const imgNonSys = objs.filter(o => imgLike(o) && !o._raSys && !o._raTokenId && !o._isBgRect);
  const maxImageA = imgNonSys.length ? Math.max(...imgNonSys.map(imageArea)) : 0;
  const bigImageThreshold = Math.max(cw * ch * 0.25, maxImageA * 0.75); // robust threshold

  // If the active object is one of the candidates, drop selection first (avoids drawControls errors)
  try {
    const active = c.getActiveObject && c.getActiveObject();
    if (active && (imgNonSys.includes(active) || isGroup(active))) {
      c.discardActiveObject();
    }
  } catch(_) {}

  objs.forEach(o => {
    if (!o) return;
    if (o._isBgRect || o._raSys || o._raTokenId) return;  // never touch bg/sys/label

    let looksLikeBase = false;

    // Explicit flags or fingerprints
    if (o._isBase || o._raBaseSig === 'BASE_V1' || o._tokenContract) {
      looksLikeBase = true;
    }

    // Large non-overlay image = probable base
    if (!looksLikeBase && imgLike(o) && o._kind !== 'overlay') {
      const a = imageArea(o);
      if (a >= bigImageThreshold) looksLikeBase = true;
    }

    // Group base (e.g., old non-token base with corner stamps)
    if (!looksLikeBase && isGroup(o)) {
      if (o._kind !== 'overlay') {
        const A = boundsArea(o);
        const stamps = Array.isArray(o._objects) && o._objects.some(ch => ch && (false || ch.raWM || ch.raPos));
        if (A >= cw * ch * 0.25 || stamps) looksLikeBase = true;
      }
    }

    if (looksLikeBase) {
      try { c.remove(o); } catch(_) {}
    }
  });

  try { c.requestRenderAll(); } catch(_) {}
}

  function fitAndAddAsBase(img){
    const c = getCanvas(); if (!c) return false;
    img.set({ originX:'center', originY:'center' });
    const cw=c.getWidth(), ch=c.getHeight();
    // Fill the canvas at any size (scale up or down; square art => exact fill)
    const sc = Math.min(cw/(img.width||cw), ch/(img.height||ch));
    if (Number.isFinite(sc) && sc>0) img.scale(sc);
    img.left = cw/2; img.top = ch/2; img.setCoords();

    // lock as base
    img._isBase = true;
    img._raBaseSig = 'BASE_V1';     // <-- paste THIS line here (fingerprint)    
    img.selectable=false; img.evented=false; img.hasControls=false;
    img.lockMovementX=img.lockMovementY=img.lockScalingX=img.lockScalingY=img.lockRotation=true;

c.add(img);
// Let the deterministic enforcer set exact indices
try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
c.requestRenderAll();
return true;


  }

  // Re-fit the base image whenever the canvas size changes (e.g. 700 -> 500/900),
  // so the token always fills the canvas at the selected size.
  (function watchCanvasSizeForBaseRefit(){
    let lastW = 0, lastH = 0;
    setInterval(() => {
      try {
        const c = getCanvas(); if (!c) return;
        const cw = c.getWidth(), ch = c.getHeight();
        if (!cw || !ch) return;
        if (cw === lastW && ch === lastH) return;
        lastW = cw; lastH = ch;
        const base = (c.getObjects() || []).find(o => o && o._isBase && !o._isBgRect);
        if (!base) return;
        const sc = Math.min(cw/(base.width||cw), ch/(base.height||ch));
        if (Number.isFinite(sc) && sc > 0) base.scale(sc);
        base.set({ originX: 'center', originY: 'center', left: cw/2, top: ch/2 });
        base.setCoords();
        c.requestRenderAll && c.requestRenderAll();
      } catch(_){}
    }, 500);
  })();

  function annotateBase(meta){
    const c = getCanvas(); if (!c) return;
    const base = (c.getObjects?.()||[]).find(o => o && o._isBase && !o._isBgRect);
    if (!base) return;
    base._tokenContract = normHex(meta.contract || '');
    base._tokenChain    = meta.chain || '';  // 'ethereum' | 'apechain' | 'base'
    base._tokenName     = meta.name || '';
    try { document.dispatchEvent(new CustomEvent('ra-collection-change', { detail: meta })); } catch(_){}
    try { document.dispatchEvent(new Event('ra-wm-recalc')); } catch(_){}
    try { c.requestRenderAll(); } catch(_){}
  }

  function upsertTokenLabel(id){
    const c = getCanvas(); if (!c || !window.fabric) return;
    (c.getObjects()||[]).forEach(o => { if (o && o._raTokenId) c.remove(o); });
    const txt = new fabric.Text('#'+String(id), {
      originX:'center', originY:'top',
      left:c.getWidth()/2, top: 32,
      fontFamily:"Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
      fontSize:48, fill:'#fff', stroke:'transparent', strokeWidth:0,
      selectable:false, evented:false
    });
    txt._raTokenId = true; txt._raSys = true;
    c.add(txt);
    try{ c.bringToFront(txt); }catch(_){}
  }

  async function loadViaDataURL(u){
    return await new Promise(res => {
      fabric.Image.fromURL(u, img => res(img), {}); // dataURL → no crossOrigin needed
    });
  }
  async function loadViaNoCors(u){
    return await new Promise(res => {
      // Intentionally no {crossOrigin:'anonymous'} to avoid blocking where host has no CORS.
      fabric.Image.fromURL(u, img => res(img), {});
    });
  }

  async function runLoader({ contract, chain, name }, tokenId){
    const c = getCanvas(), f = window.fabric;
    if (!c || !f) { alert('Canvas not ready'); return; }

  // 1) Query Reservoir with the correct chain
let urls = await reservoirCandidates(contract, tokenId, chain);

// ApeChain often needs tokenURI → metadata fallback
if ((!urls || !urls.length) && chain === 'apechain' && window.__fetchApechainImageURL){
  try{
    const u = await window.__fetchApechainImageURL(contract, tokenId);
    if (u) urls = [u];
  }catch(_){}
}

// If still nothing, try once more forcing a chain hint
if (!urls || !urls.length) {
  try {
    const chainHint = (String(chain||'').toLowerCase().includes('ape') ? 'ape' : 'eth');
    const forced = await fetch(
      `/api/token-media?contract=${encodeURIComponent(contract)}&id=${encodeURIComponent(tokenId)}&chain=${chainHint}`,
      { cache: 'no-store' }
    ).then(r => r.json());
    if (forced && forced.image) {
      urls = [ `/api/proxy-img?u=${encodeURIComponent(forced.image)}` ];
    }
  } catch {}
}

// Guard: still nothing → bail
if (!urls || !urls.length){
  alert('No image found for that token.');
  return;
}

    // 2) CORS‑safe path first (best for export)
    try { c.discardActiveObject(); } catch(_){}
    killOldBase(c);
for (const u of urls){
  try{
    const data = (typeof u === 'string' && u.startsWith('data:')) ? u : await fetchAsDataURL(u);
    const img  = await loadViaDataURL(data);
    if (img){
      fitAndAddAsBase(img);
      annotateBase({ contract, chain, name: name || '' });
      return;
    }
  }catch(_){}
}

    // 3) Fallback: view‑only (no‑CORS) so it still shows in Admin
const img = await loadViaNoCors(urls[0]);
if (img){
  fitAndAddAsBase(img);
  annotateBase({ contract, chain, name: name || '' });
  // no auto label — user adds it from “Token ID Styles”
  return;
}

    alert('Failed to load token image.');
  }

  // ---------- wire once (capture phase). We only hijack when we know the contract+chain. ----------
  function looksLikeLoadByToken(node){
    if (!node) return false;
    // The collections-card button (#loadByToken / "Load by Token") belongs
    // to the registry-driven collections loader, which resolves through the
    // server and honors the admin Collections editor. Hijacking it here made
    // editor changes irrelevant (this file's KNOWN map won every click).
    if (node.id && /loadbytoken/i.test(node.id)) return false;
    const t0 = (node.textContent || '').toLowerCase().replace(/\s+/g,' ');
    if (/load[^a-z]*by[^a-z]*token/.test(t0)) return false;
    const btn = node.id && /loadtoken/i.test(node.id);
    if (btn) return true;
    return /load[^a-z]*token[^a-z]*id/.test(t0);
  }

 // Helper: find the Token ID Styles card so we can skip hijacking inside it
function findTokenIdStylesCard(){
  const hs = Array.from(document.querySelectorAll('h2,h3,h4,strong,label'));
  const h  = hs.find(x => /token\s*id\s*styles/i.test((x.textContent||'').trim()));
  return h ? (h.closest('.card,section,div') || h.parentElement) : null;
}

function onClick(e){
  const el = e.target && e.target.closest && e.target.closest('button, a');
  if (!el) return;

  // ⛔️ Do NOT hijack clicks in the Token ID Styles card (this button is for the label UI)
  const stylesCard = findTokenIdStylesCard();
  if (stylesCard && stylesCard.contains(el)) return;

  if (!looksLikeLoadByToken(el)) return;

  const tokenId  = readTokenId();
  const detected = detectContractAndChain();

  if (tokenId && detected && detected.contract) {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    runLoader(detected, tokenId);
  }
}

  // Boot
  if (!document.__raTokenLoaderXChainBound){
    document.__raTokenLoaderXChainBound = true;
    document.addEventListener('click', onClick, true); // capture so we can short‑circuit when we have everything
  }
})();

/* ===== RA_TOKEN_ID_STYLE_WIRING_V3 — no auto-create; update only; proper format; de-dupe ===== */
;(() => {
  if (window.__RA_TOKEN_ID_STYLE_WIRING_V3__) return;
  window.__RA_TOKEN_ID_STYLE_WIRING_V3__ = true;

  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function getLabel(){
    const c = C(); if (!c) return null;
    return window.idLabel || (c.getObjects()||[]).find(o => o && o._raTokenId) || null;
  }

  function deDupeLabel(){
    const c = C(); if (!c) return null;
    const labs = (c.getObjects()||[]).filter(o => o && o._raTokenId);
    if (!labs.length) return null;
    const keep = labs[0];
    for (let i = 1; i < labs.length; i++){
      try { c.remove(labs[i]); } catch(_) {}
    }
    window.idLabel = keep;
    return keep;
  }

  // Reformat with your existing formatter if present; else plain
  function formatShown(rawId){
    const fmtSel = document.getElementById('idFormat');
    const fmt = (fmtSel && fmtSel.value) ? fmtSel.value : 'plain';   // <-- pass value, not node
    if (typeof window.formatTokenId === 'function'){
      return window.formatTokenId('#' + String(rawId), fmt);
    }
    return '#'+ String(rawId).replace(/^#+/,'');
  }

  function readTokenIdValue(){
    const sels = [
      '#raTokenIdDisplay','#tokenIdDisplay',
      '#tokenIdInput','#tokenId','#token',
      'input[name="tokenId"]','input[name="token"]',
      'input[placeholder*="Token"]'
    ];
    for (const sel of sels){
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = (el.value ?? el.textContent ?? '').trim();
      const d = (raw.match(/\d+/) || [''])[0];
      if (d) return d;
    }
    return '';
  }

  // Update only an existing label; do not create one if none exists (prevents stray '#')
  function applyStylesToExisting(){
    const c = C(); if (!c) return;
    const l = deDupeLabel() || getLabel();   // if there were dupes, collapse to one
    if (!l) return;   // nothing to update → bail (no auto-create here)

    // Reformat text from the current token id, if present
    const idVal = readTokenIdValue();
    if (idVal){
      const shown = formatShown(idVal);
      if (l.text !== shown){
        l.set({ text: shown });
        try { c.fire('object:modified', { target: l }); } catch(_){}
      }
    }

    // Style controls (size/color/outline/width)
    const size  = document.getElementById('idSize');
    const fill  = document.getElementById('idColor');
    const strk  = document.getElementById('idStrokeColor');
    const sw    = document.getElementById('idStrokeWidth');

    let changed = false;
    if (size && size.value){
      const v = parseInt(size.value,10);
      if (Number.isFinite(v) && v > 0 && l.fontSize !== v){ l.set('fontSize', v); changed = true; }
    }
    if (fill && fill.value){
      if (l.fill !== fill.value){ l.set('fill', fill.value); changed = true; }
    }
    if (strk && strk.value){
      if (l.stroke !== strk.value){ l.set('stroke', strk.value); changed = true; }
    }
    if (sw && sw.value){
      const w = parseInt(sw.value,10);
      if (Number.isFinite(w) && l.strokeWidth !== w){ l.set('strokeWidth', w); changed = true; }
    }

    if (changed){
      l.setCoords();
      try { c.fire('object:modified', { target: l }); } catch(_){}
    }

    // Keep editable and on top (without re-adding)
    l.selectable = true; l.evented = true; l.hasControls = true;
    try { const n=(c.getObjects()||[]).length; c.bringToFront(l); c.moveTo(l, n-1); } catch(_){}
    c.requestRenderAll();
    window.idLabel = l;
  }

  // Always remove exactly one label on Delete Token ID (one click)
  function wireDelete(){
    const btn = document.getElementById('deleteTokenId') ||
                Array.from(document.querySelectorAll('button')).find(b => /delete\s*token\s*id/i.test((b.textContent||'').trim()));
    if (!btn || btn.__raTokDel3) return;
    btn.__raTokDel3 = true;
    btn.addEventListener('click', (e)=>{
      const c = C(); if (!c) return;
      const l = getLabel();
      if (!l) return;
      try {
        c.remove(l);
        window.idLabel = null;
        c.fire('object:modified', { target: l });
        c.requestRenderAll();
      } catch(_) {}
      // do not stop propagation — let any other UI update too
    }, true);
  }

  // Wire style controls (format/size/color/outline/width) to update existing label
  function wireControls(){
    const ids = ['idFormat','idSize','idColor','idStrokeColor','idStrokeWidth'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.__raTokCtl3) return;
      el.__raTokCtl3 = true;
      el.addEventListener('change', applyStylesToExisting);
      el.addEventListener('input',  applyStylesToExisting);
    });
  }

  function boot(){
    if (!C()) return setTimeout(boot, 200);
    wireControls();
    wireDelete();
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', boot, { once:true }); }
  else { boot(); }
})();

// ===== DEBUG: dump current stacking and tags (run in console: raDump()) =====
window.raDump = () => {
  const c = (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  if (!c) { console.log('No canvas'); return; }
  (c.getObjects()||[]).forEach((o,i)=>{
    const t = (o.type||'obj').padEnd(7);
    console.log(
      String(i).padStart(2,' '),
      t,
      (o._isBgRect ? '[BG]'   : '   '),
      (o._isBase   ? '[BASE]' : '     '),
      (o._raSys    ? '[SYS]'  : '    '),
      (o._raTokenId? '[ID]'   : '   '),
      (o._kind ? (`[${o._kind}]`).padEnd(10) : '          '),
      (o._raBaseSig === 'BASE_V1' ? '(fingerprinted)' : ''),
      (o._tokenContract ? '(token)' : '')
    );
  });
};

/* ===== APP_MARKER_0928 ===== */
window.APP_MARKER_0928 = true;
console.log("✅ app.js marker loaded: APP_MARKER_0928");



/* ===== RA_UI_WM_CONTROLLER_FINAL_RULES_2025_09_28 — centralized watermark + footer controller ===== */
;(() => {
  'use strict';
  if (window.__RA_UI_WM_CONTROLLER_FINAL__) return;
  window.__RA_UI_WM_CONTROLLER_FINAL__ = true;

  // --------------- Canvas helpers ---------------
  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function findBase(c){
    const objs = (c && c.getObjects?.()) || [];
    let base = objs.find(o => o && o._isBase && !o._isBgRect) || null;
    if (base) return base;
    const imgs = objs.filter(o => (o && (o.type === 'image' || o._element)) && !o._isBgRect);
    return imgs.length ? imgs[imgs.length - 1] : null;
  }

  // --------------- Collections: Rebel & Friends ---------------
  function getRebelContract(){
    try {
      if (Array.isArray(window.RA_COLLECTIONS)){
        const r = window.RA_COLLECTIONS.find(x => (String(x.tag||x.type||'').toLowerCase() === 'rebel') && (x.address || x.contract));
        if (r) return String(r.address || r.contract).toLowerCase();
      }
      if (typeof window.CONTRACT === 'string' && window.CONTRACT) {
        return window.CONTRACT.toLowerCase();
      }
    } catch(_){}
    return ''; // no rebel fallback
  }

  const FRIEND_FALLBACKS = new Set([
    '0xbed2470ded2519c13eaaf3bd970015ef404d3d20', // Saints (Ethereum)
    '0xa9a1d086623475595a02991664742e4a1cbafcb8'  // Chumpz (ApeChain)
  ]);

  function getFriendContractsSet(){
    const set = new Set();
    try {
      if (Array.isArray(window.RA_COLLECTIONS)){
        window.RA_COLLECTIONS.forEach(x => {
          const tag = String(x.tag||x.type||'').toLowerCase();
          const addr = String(x.address || x.contract || '').toLowerCase();
          if (addr && tag === 'friend') set.add(addr);
        });
      }
    } catch(_){}
    // ensure fallbacks are included
    FRIEND_FALLBACKS.forEach(a => set.add(a));
    return set;
  }

  function isFriendContract(addr){
    if (!addr) return false;
    const a = String(addr).toLowerCase();
    return getFriendContractsSet().has(a);
  }

  // --------------- Current item kind on canvas ---------------
  function detectItemKind(){
    const c = C();
    if (!c) return { kind:'blank', contract:'' };

    const base = findBase(c);
    if (!base) return { kind:'blank', contract:'' };

    const addr = (base._tokenContract || '').toLowerCase();
    if (addr){
      if (addr === getRebelContract())  return { kind:'rebelToken',  contract:addr };
      if (isFriendContract(addr))       return { kind:'friendToken', contract:addr };
      return { kind:'otherToken', contract:addr };
    }
    return { kind:'upload', contract:'' };
  }

  // --------------- Wallet / holder state ---------------
  function userState(){
    const W = window.RA_WALLET_STATE || {};
    const H = window.RA_HOLDER_STATE || {};

    // Prefer an explicit per‑contract map if your holder checker provides one.
    const rawMap =
      (H.friendsOwned && typeof H.friendsOwned === 'object' && H.friendsOwned) ||
      (H.ownedContracts && typeof H.ownedContracts === 'object' && H.ownedContracts) ||
      (H.friendsMap && typeof H.friendsMap === 'object' && H.friendsMap) ||
      {};

    const ownedSet = new Set();
    try {
      Object.keys(rawMap).forEach(k => { if (rawMap[k]) ownedSet.add(k.toLowerCase()); });
    } catch(_){}

    // Also merge any "holds" flags your collections admin block may have set.
    try {
      (window.RA_COLLECTIONS || []).forEach(x => {
        const addr = String(x.address || x.contract || '').toLowerCase();
        const tag  = String(x.tag||x.type||'').toLowerCase();
        const held = !!(x.holds || x.owned || x.isHolder || x.holder);
        if (addr && tag === 'friend' && held) ownedSet.add(addr);
      });
    } catch(_){}

    return {
      connected: !!W.connected,
      hasRebel:  !!H.hasRebel,
      // true if *any* friend is owned (aggregate)
      hasFriend: !!H.hasFriend || ownedSet.size > 0,
      // per‑contract ownership for friends
      friendsOwnedSet: ownedSet
    };
  }

  // --------------- Final Policy (per‑collection gating) ---------------
  function computePolicy(kind, U, contract){
    // Blank canvas → nothing visible
    if (kind === 'blank') return { ring:false, footer:false };

    // 1) Wallet NOT Connected → default watermark + footer
    if (!U.connected) return { ring:true, footer:true };

    // 2) Wallet Connected and owns a Rebel
    if (U.hasRebel){
      if (kind === 'rebelToken') return { ring:false, footer:false }; // clean
      if (kind === 'friendToken') return { ring:false, footer:true  }; // footer only
      if (kind === 'upload')      return { ring:false, footer:true  }; // footer only
      return { ring:false, footer:true }; // other tokens → footer only
    }

    // 3) Wallet Connected but NO Rebel → per‑collection Friend gating
    if (kind === 'friendToken'){
      const owned = !!(contract && U.friendsOwnedSet.has(String(contract).toLowerCase()));
      return { ring: !owned, footer: true }; // owned friend → footer only; not owned → ring+footer
    }

    if (kind === 'rebelToken') return { ring:true, footer:false }; // special case for non‑holders
    if (kind === 'upload')     return { ring:true, footer:true  }; // default for uploads (no Rebel)
    return { ring:true, footer:true }; // other tokens & uploads
  }

  // --------------- Watermark (image) — undo‑safe ---------------
  const WM_URL     = new URL('assets/watermark.png', document.baseURI).toString();
  const WM_SCALE   = 0.85;  // 85% of min(canvas width, height)
  const WM_OPACITY = 0.03;  // very faint

  function getWM(c){
    const objs = (c && c.getObjects?.()) || [];
    return objs.find(o => o && o._raRingOverlay === true) || null;
  }

  function layoutWM(c, img){
    if (!c || !img) return;
    const w = c.getWidth(), h = c.getHeight();
    const target = Math.min(w, h) * WM_SCALE;
    const sx = target / (img.width  || 1);
    const sy = target / (img.height || 1);
    const s  = Math.min(sx, sy);
    img.set({
      left: w/2, top: h/2,
      originX: 'center', originY: 'center',
      scaleX: s, scaleY: s
    });
    img.setCoords();
  }

  function ensureWM(c, done){
    let wm = getWM(c);
    if (wm) { layoutWM(c, wm); done && done(wm); return; }
    if (!window.fabric || !c) { done && done(null); return; }

    if (ensureWM._loading){ setTimeout(() => ensureWM(c, done), 60); return; }
    ensureWM._loading = true;

    fabric.Image.fromURL(WM_URL, (img) => {
      ensureWM._loading = false;
      if (!img) { done && done(null); return; }
      // tag as system so history ignores it (fixes Undo/Redo)
      img._raRingOverlay    = true;
      img._raSys            = true;
      img._kind             = 'wm';
      img.excludeFromExport = true;
      img.set({
        selectable:false, evented:false, hasControls:false,
        opacity: WM_OPACITY,
        globalCompositeOperation: 'source-over',
        perPixelTargetFind: false
      });
      try { c.add(img); } catch(_){}
      layoutWM(c, img);
      done && done(img);
    }, { crossOrigin: 'anonymous' });
  }

  function applyRing(pol){
    const c = C(); if (!c) return;
    const want = !!pol.ring;
    const existing = getWM(c);

    if (want){
      ensureWM(c, (img) => {
        if (!img) return;
        layoutWM(c, img);
        img.visible = true;
        try { img.bringToFront && img.bringToFront(); } catch(_){}
        try { c.requestRenderAll && c.requestRenderAll(); } catch(_){}
      });
    } else if (existing){
      existing.visible = false;  // keep to reuse without touching history
      try { c.requestRenderAll && c.requestRenderAll(); } catch(_){}
    }
  }

  // --------------- Footer — strictly inside canvas wrapper ---------------
  function footerHost(){
    const c = C();
    return (c && c.upperCanvasEl && c.upperCanvasEl.parentElement) || null; // Fabric wrapper (canvas-container)
  }

  function ensureFooter(){
    const host = footerHost();
    // If wrapper not ready yet, bail (caller may re-run on next recompute)
    if (!host) return null;

    let el = document.getElementById('raFooterBarFinal');
    if (!el){
      el = document.createElement('div');
      el.id = 'raFooterBarFinal';
      el.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:8px 12px;font:600 12px/1.2 system-ui,Arial;color:#e8eaed;background:linear-gradient(to top, rgba(0,0,0,.6), rgba(0,0,0,0));text-align:center;pointer-events:none;z-index:9999';
      el.textContent = '— Rebel Studios Builder —';
    }

    // Ensure wrapper is a positioning context and adopt the footer into it.
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    if (el.parentElement !== host){
      try { host.appendChild(el); } catch(_){}
    }
    return el;
  }

  function applyFooter(pol){
    const el = ensureFooter();
    if (!el) return; // wrapper not ready yet
    el.style.display = pol.footer ? '' : 'none';
  }

  // --------------- Recompute (skip during JSON restore) ---------------
  function recompute(){
    if (window.__RA_RESTORING__) return; // avoid fighting Undo/Redo restores
    const info = detectItemKind();
    const u    = userState();
    const pol  = computePolicy(info.kind, u, info.contract);
    applyRing(pol);
    applyFooter(pol);
  }

  // --------------- Bind signals (with ResizeObserver) ---------------
  function bind(){
    if (window.__RA_UI_WM_BIND__) return;
    window.__RA_UI_WM_BIND__ = true;

    // wallet/holder + collection change + restore end
    try { document.addEventListener('ra-holder-update',     recompute); } catch(_){}
    try { document.addEventListener('ra-collection-change', recompute); } catch(_){}
    try { document.addEventListener('ra-wm-recalc',         recompute); } catch(_){}
    try { document.addEventListener('ra-json-restore-end',  recompute); } catch(_){}

    const c = C();
    if (c && c.on){
      c.on('object:added',   recompute);
      c.on('object:removed', recompute);
      window.addEventListener('resize', recompute);

      // Precisely re‑layout on wrapper size changes
      if ('ResizeObserver' in window) {
        try {
          if (c.__wmRO) c.__wmRO.disconnect();
          const ro = new ResizeObserver(() => recompute());
          ro.observe(c.upperCanvasEl);
          c.__wmRO = ro;
        } catch(_){}
      }
    } else {
      // Canvas not ready yet — wait, then wire listeners
      const iv = setInterval(()=>{
        const cc = C();
        if (cc && cc.upperCanvasEl){
          clearInterval(iv);
          recompute();

          try { cc.on && cc.on('object:added',   recompute); } catch(_){}
          try { cc.on && cc.on('object:removed', recompute); } catch(_){}
          try { window.addEventListener('resize', recompute); } catch(_){}

          if ('ResizeObserver' in window) {
            try {
              if (cc.__wmRO) cc.__wmRO.disconnect();
              const ro = new ResizeObserver(() => recompute());
              ro.observe(cc.upperCanvasEl);
              cc.__wmRO = ro;
            } catch(_){}
          }
        }
      }, 500);
    }

    setTimeout(recompute, 0); // initial
  }

  bind();
})();

/* =========================================================
   MOBILE UX — Real Canvas Resize (no CSS transform)
   - Resize the actual Fabric canvas to a viewport‑fit square
   - Size checkerboard wrapper from live CSS (padding+border)
   - Footer centered within wrapper
   - Visibility‑aware + jitter‑guarded reflow (no jumpiness)
   - Quick Dock + Canvas jumper + Del Overlay
   ========================================================= */
;(() => {
  'use strict';
  if (window.__RA_MOBILE_REAL_RESIZE_V1__) return;
  window.__RA_MOBILE_REAL_RESIZE_V1__ = true;
  const IS_COARSE = window.matchMedia('(pointer: coarse)').matches;
  if (!IS_COARSE) return;   // Do not run mobile logic on desktop, ever
   
  /* === MOBILE KNOBS (simple, adjust here) ==================
   * SIDE_MARGIN_X_PX  → horizontal margin around the square
   * VERTICAL_GAP_PX   → extra space above the dock
   * PORTRAIT_FRAC     → fraction of available side to use in portrait
   * LANDSCAPE_FRAC    → fraction of available side to use in landscape
   * MIN_SIDE_PX       → safety floor for the square
   * HEIGHT_JITTER_PX  → ignore tiny height changes from mobile toolbars
   * SMALL_QUERY       → when this matches, mobile logic is active
   * ======================================================= */
  const SIDE_MARGIN_X_PX = 14;
  const VERTICAL_GAP_PX  = 18;
  const PORTRAIT_FRAC    = 0.98;  // make smaller if it touches UI; larger if you want it bigger
  const LANDSCAPE_FRAC   = 1.70;  // use >1.0 to use more of the short edge on landscape
  const MIN_SIDE_PX      = 400;
  const HEIGHT_JITTER_PX = 120;
  const SMALL_QUERY      = '(max-width: 768px), (max-height: 500px)';

  const isSmall    = () => window.matchMedia(SMALL_QUERY).matches;
  const isPortrait = () => window.innerHeight >= window.innerWidth;

  const C  = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  const $I = (id) => document.getElementById(id);

  /* ---------- helpers ---------- */
  function containers(){
    const c = C(); if (!c || !c.upperCanvasEl) return null;
    const container = c.upperCanvasEl.parentElement;                      // .canvas-container
    const wrap = document.querySelector('.canvas-wrap') || container;     // checkerboard frame
    return { c, container, wrap };
  }
  const dockHeight = () => ($I('raMobileDock')?.offsetHeight || 0);

  // Live CSS metrics for wrapper (prevents drift)
  function wrapChrome(wrap){
    const cs = getComputedStyle(wrap);
    const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) || 0;
    const padV = parseFloat(cs.paddingTop)  + parseFloat(cs.paddingBottom) || 0;
    const bH   = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) || 0;
    const bV   = parseFloat(cs.borderTopWidth)  + parseFloat(cs.borderBottomWidth) || 0;
    return { padH, padV, bH, bV };
  }

  /* ---------- stable viewport (ignore toolbar jitter) ---------- */
  let lastW = 0, lastH = 0, lastO = 'p';
  const debounce = (fn, ms=120) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  function significantResize(w, h, o){
    if (o !== lastO) return true;
    if (Math.abs(w - lastW) > 40) return true;
    if (Math.abs(h - lastH) > HEIGHT_JITTER_PX) return true;
    return false;
  }
  function rememberDims(w, h, o){ lastW = w; lastH = h; lastO = o; }

  /* ---------- only reflow when canvas is visible ---------- */
  let io, canvasVisible = true;
  function watchVisibility(){
    const refs = containers(); if (!refs) return;
    if (!('IntersectionObserver' in window)) { canvasVisible = true; return; }
    if (io) io.disconnect();
    io = new IntersectionObserver((entries)=>{
      canvasVisible = entries.some(e => e.isIntersecting && e.intersectionRatio > 0.05);
      if (canvasVisible) reflow();  // snap correct when user returns to canvas
    }, { root: null, threshold: [0, 0.05, 0.5, 1] });
    io.observe(refs.wrap);
  }

  /* ---------- target square side (we resize the real canvas) ---------- */
  function targetSide(){
    const wAvail = window.innerWidth  - SIDE_MARGIN_X_PX*2;
    const hAvail = window.innerHeight - dockHeight() - VERTICAL_GAP_PX;
    let side = Math.min(wAvail, hAvail) * (isPortrait() ? PORTRAIT_FRAC : LANDSCAPE_FRAC);
    side = Math.max(MIN_SIDE_PX, Math.floor(side));
    return side;
  }

  /* ---------- resize canvas + match wrapper to canvas ---------- */
  function sizeCanvasAndWrap(){
    if (!isSmall()) return;
    const refs = containers(); if (!refs) return;
    const { c, wrap } = refs;

    const side = targetSide();

    // Resize the actual Fabric canvas (uses your RA resize helper to scale objects correctly)
    try { (typeof window.setCanvasSize === 'function') ? window.setCanvasSize(side) : c.setWidth(side) & c.setHeight(side); } catch(_){}

    // Match the checkerboard wrapper to the canvas outer size (content + padding + border)
    const { padH, padV, bH, bV } = wrapChrome(wrap);
    wrap.style.width  = (side + padH + bH) + 'px';
    wrap.style.height = (side + padV + bV) + 'px';

    // Footer: ensure inside wrapper and centered
    const footer = document.getElementById('raFooterBarFinal');
    if (footer && footer.parentElement !== wrap){
      try { wrap.appendChild(footer); } catch(_){}
    }
  }

  /* ---------- uploads: cover fill (slight overshoot to avoid slivers) ---------- */
  const isSystem = (o) => !!(o && (o._raSys || o._isBgRect || o._raTokenId || o._rabrandbar));
  const isBaseish = (o) => !!o && (o._isBase || (o.type === 'image' && !isSystem(o)));
  function coverFillBase(o){
    const refs = containers(); if (!refs || !o || !isSmall()) return;
    const { c } = refs; if (!isBaseish(o)) return;

    const cw = c.getWidth()  || 0, ch = c.getHeight() || 0;
    const iw = o.width  || (o._originalElement && o._originalElement.width)  || 1;
    const ih = o.height || (o._originalElement && o._originalElement.height) || 1;
    if (!cw || !ch || !iw || !ih) return;

    const cover = Math.max(cw/iw, ch/ih) * 1.04;  // small fixed overshoot is OK after real resize
    o.set({ originX: 'center', originY: 'center', scaleX: cover, scaleY: cover });
    try {
      if (typeof o.setPositionByOrigin === 'function') {
        o.setPositionByOrigin(new fabric.Point(cw/2, ch/2), 'center', 'center');
      } else { o.left = cw/2; o.top = ch/2; }
      o.setCoords();
      c.requestRenderAll && c.requestRenderAll();
    } catch(_){}
  }

  /* ---------- Quick Dock + Stickies ---------- */
  function clickById(id){ const el = $I(id); if (el) { el.click(); return true; } return false; }
  function call(fn, ...args){ try { return (typeof fn === 'function') ? fn(...args) : false; } catch(_){ return false; } }
  function scrollToSel(sel){ const el = document.querySelector(sel); if (el) el.scrollIntoView({ behavior:'smooth', block:'start' }); }
  function scrollToTextPanel(){
    const candidates = ['#customText','#textPanel','#textTools','#customTextPanel','[data-panel="text"]','.text-tools','.text-panel'];
    for (const sel of candidates){ const el = document.querySelector(sel); if (el){ el.scrollIntoView({ behavior:'smooth', block:'start' }); return true; } }
    return false;
  }

  function buildDock(){
    if (!isSmall() || $I('raMobileDock')) return;
    const dock = document.createElement('div');
    dock.id = 'raMobileDock';
    dock.className = 'ra-mobile-dock';

    const mk = (label, onTap) => { const b = document.createElement('button'); b.type='button'; b.textContent=label; b.addEventListener('click', e=>{e.preventDefault();e.stopPropagation();onTap();}); return b; };

    dock.append(
      mk('Undo',     () => clickById('raUndoBtn')  || call(window.raHistory?.undo)),
      mk('Redo',     () => clickById('raRedoBtn')  || call(window.raHistory?.redo)),
      mk('Text',     () => scrollToTextPanel() || clickById('addTextBtn') || call(window.raAddTextPrime)),
      mk('Overlays', () => scrollToSel('#overlayGrid, .overlay-grid, .grid')),
      mk('Upload',   () => clickById('baseUpload')),
      mk('Export',   () => clickById('exportPng')  || call(window.raOpenNewTabViewer)),
      mk('Clear',    () => clickById('clearCanvas')|| call(window.raSafeClear, true))
    );
    document.body.appendChild(dock);
  }
  function syncDock(){
    const exists = !!$I('raMobileDock');
    if (isSmall() && !exists) buildDock();
    if (!isSmall() && exists) $I('raMobileDock')?.remove();
  }

  function ensureBackToCanvas(){
    if (!isSmall()) return null;
    let btn = $I('raBackToCanvas');
    if (!btn){
      btn = document.createElement('button');
      btn.id = 'raBackToCanvas';
      btn.className = 'ra-back-to-canvas';
      btn.type = 'button';
      btn.textContent = 'Canvas';
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const refs = containers(); if (!refs) return;
        refs.wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      document.body.appendChild(btn);
    }
    return btn;
  }
  function toggleBackToCanvas(){
    const btn = ensureBackToCanvas(); if (!btn) return;
    const refs = containers(); if (!refs) { btn.classList.remove('show'); return; }
    const r = refs.wrap.getBoundingClientRect();
    const fullyVisible = r.top >= 0 && r.bottom <= window.innerHeight;
    if (fullyVisible) btn.classList.remove('show'); else btn.classList.add('show');
  }

  function ensureDelOverlay(){
    if (!isSmall()) return null;
    let btn = $I('raDelOverlayBtn');
    if (!btn){
      btn = document.createElement('button');
      btn.id = 'raDelOverlayBtn';
      btn.className = 'ra-del-overlay';
      btn.type = 'button';
      btn.textContent = 'Del Overlay';
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const c = C(); if (!c) return;

        const isOverlayCandidate = (o) =>
          !!o && !isSystem(o) && !o._isBase && o.type !== 'line' && o.type !== 'circle';

        let targets = (typeof c.getActiveObjects === 'function') ? c.getActiveObjects() : [];
        targets = (targets || []).filter(isOverlayCandidate);

        if (!targets.length){
          const objs = (c.getObjects() || []).filter(isOverlayCandidate);
          if (objs.length) targets = [objs[objs.length - 1]];
        }

        if (!targets.length) return;

        try { targets.forEach(t => c.remove(t)); } catch(_){}
        try { c.discardActiveObject && c.discardActiveObject(); } catch(_){}
        try { c.requestRenderAll && c.requestRenderAll(); } catch(_){}
      });
      document.body.appendChild(btn);
    }
    return btn;
  }
  function showDelOverlay(always=true){
    const btn = ensureDelOverlay(); if (!btn) return;
    if (always) { btn.classList.add('show'); return; }
    const c = C(); if (!c) { btn.classList.remove('show'); return; }
    const hasUserObj = (c.getObjects() || []).some(o => !isSystem(o) && !o._isBase);
    if (hasUserObj) btn.classList.add('show'); else btn.classList.remove('show');
  }

  /* ---------- reflow ---------- */
  function reflow(){
    if (!isSmall()) return;
    sizeCanvasAndWrap();
    toggleBackToCanvas();
    showDelOverlay();
  }

  function boot(){
    if (!isSmall()) return;     // desktop untouched
    buildDock();
    ensureBackToCanvas();
    ensureDelOverlay();
    watchVisibility();

    reflow();
    setTimeout(reflow, 250);
    setTimeout(reflow, 600);

    const refs = containers(); const c = refs && refs.c;
    if (c && c.on){
      c.on('object:added',   e => { if (e && e.target) coverFillBase(e.target); setTimeout(reflow, 0); });
      c.on('object:removed', () => setTimeout(reflow, 0));
      c.on('object:modified',() => setTimeout(reflow, 0));
    }

    try { document.addEventListener('ra-json-restore-end',  () => setTimeout(reflow, 0)); } catch(_){}
    try { document.addEventListener('ra-collection-change', () => setTimeout(reflow, 0)); } catch(_){}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Only reflow on meaningful viewport changes
  const onResizeStable = debounce(() => {
    if (!isSmall()) return;
    const w = window.innerWidth, h = window.innerHeight, o = isPortrait() ? 'p' : 'l';
    if (significantResize(w, h, o) && canvasVisible) {
      rememberDims(w, h, o);
      reflow();
    }
  }, 120);

  rememberDims(window.innerWidth, window.innerHeight, isPortrait() ? 'p' : 'l');

  window.addEventListener('resize', onResizeStable);
  window.addEventListener('orientationchange', () => {
    rememberDims(window.innerWidth, window.innerHeight, isPortrait() ? 'p' : 'l');
    setTimeout(() => { if (canvasVisible) reflow(); }, 220);
  });
  // Scroll: only toggle helper, no resize
  window.addEventListener('scroll', () => toggleBackToCanvas(), { passive: true });
})();

/* ============================================================
   RA_DESKTOP_STICKY_COLUMNS_V1
   Variant B (sticky side panels + internally scrolling middle)
   + canvas unfix (prevents overlapping) + horizontal no‑collapse row.
   Desktop only (pointer:fine). Mobile code remains untouched.
   Revert:  desktopLayoutRevert()
   Reapply: desktopLayoutApply()
   ============================================================ */
(function RA_DESKTOP_STICKY_COLUMNS_V1(){
  if (window.__RA_DESKTOP_STICKY_COLUMNS_V1__) return;
  window.__RA_DESKTOP_STICKY_COLUMNS_V1__ = true;

  // Abort for real mobile / touch devices
  if (matchMedia('(pointer: coarse)').matches) return;

  var SNAP = {
    parent:null,parentStyle:'',
    stage:null, stageStyle:'',
    left:null,  leftStyle:'',
    right:null, rightStyle:'',
    canvasCard:null, canvasCardStyle:'',
    mobileStyles:[],
    cssTag:null,
    resizeHandler:null,
    orientHandler:null
  };

  var MOBILE_STYLE_IDS = ['ra-mobile-flow-css-v29','ra-mobile-css-fit-v4-style'];
  var CSS_ID = 'deskStickyColumnsCSS_V1';

  function disableMobileCSS(){
    MOBILE_STYLE_IDS.forEach(function(id){
      var el = document.getElementById(id);
      if (el && !el.__deskDisabled){
        el.__deskDisabled = { disabled: el.disabled };
        el.disabled = true;
        SNAP.mobileStyles.push(el);
      }
    });
  }
  function restoreMobileCSS(){
    SNAP.mobileStyles.forEach(function(el){
      if (el.__deskDisabled){
        el.disabled = el.__deskDisabled.disabled;
        delete el.__deskDisabled;
      }
    });
  }

  function unfixCanvas(){
    if (window.__RA_UNFIX_CANVAS){
      try { window.__RA_UNFIX_CANVAS(); return; } catch(_){}
    }
    var c = document.getElementById('c');
    if (!c) return;
    var card = c.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper');
    if (card){
      if (!SNAP.canvasCard){
        SNAP.canvasCard = card;
        SNAP.canvasCardStyle = card.getAttribute('style') || '';
      }
      ['position','top','left','right','width','zIndex','transform','margin'].forEach(function(p){
        card.style[p]='';
      });
      var ghost = document.getElementById('raCanvasGhost');
      if (ghost) ghost.remove();
    }
  }

  function findNodes(){
    var stage = document.querySelector('main.stage');
    if (!stage) return null;
    var left  = document.querySelector('aside.panel.left');
    var right = document.querySelector('aside.panel.right');
    var parent = stage.parentElement;

    // Ascend if side panels not siblings of stage
    if (parent && (left || right)){
      var up = parent;
      while (up && up !== document.body){
        var ok = true;
        [stage,left,right].forEach(function(n){
          if (n && !up.contains(n)) ok=false;
        });
        if (ok) { parent = up; break; }
        up = up.parentElement;
      }
    }
    return { parent:parent, stage:stage, left:left, right:right };
  }

  function injectCSS(){
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID;
    st.textContent =
      '/* Desktop sticky three-column layout */' +
      '.desk-flex-host{display:flex!important;flex-wrap:nowrap!important;align-items:flex-start;gap:16px;overflow-x:auto;overflow-y:visible;}' +
      '.desk-flex-host>aside.panel.left,.desk-flex-host>aside.panel.right{' +
      'flex:0 0 280px;min-width:260px;max-width:320px;box-sizing:border-box;position:sticky;top:8px;' +
      'max-height:calc(100vh - 16px);overflow:auto;scrollbar-width:thin;' +
      '}' +
      '.desk-flex-host>main.stage{' +
      'flex:1 1 auto;min-width:600px;box-sizing:border-box;position:relative;' +
      'overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;max-height:calc(100vh - 12px);' +
      '}' +
      '@media (pointer: fine){#ra-mobile-stage-host,#ra-mobile-stage-frame{display:none!important;}}';
    document.head.appendChild(st);
    SNAP.cssTag = st;
  }

  function applyLayout(){
    var nodes = findNodes();
    if (!nodes || !nodes.parent || !nodes.stage) return;

    SNAP.parent = nodes.parent;
    SNAP.stage  = nodes.stage;
    SNAP.left   = nodes.left;
    SNAP.right  = nodes.right;

    if (SNAP.parentStyle === '') SNAP.parentStyle = SNAP.parent.getAttribute('style') || '';
    if (SNAP.stageStyle  === '') SNAP.stageStyle  = SNAP.stage.getAttribute('style')  || '';
    if (SNAP.left && SNAP.leftStyle === '')   SNAP.leftStyle  = SNAP.left.getAttribute('style')  || '';
    if (SNAP.right && SNAP.rightStyle === '') SNAP.rightStyle = SNAP.right.getAttribute('style') || '';

    SNAP.parent.classList.add('desk-flex-host');
    SNAP.parent.style.alignItems = 'flex-start';

    SNAP.stage.setAttribute('data-mid','1');
    SNAP.stage.style.maxHeight = 'calc(100vh - 12px)';
    SNAP.stage.style.overflowY = 'auto';
    SNAP.stage.style.overflowX = 'hidden';
    SNAP.stage.style.position  = SNAP.stage.style.position || 'relative';

    if (SNAP.left){
      SNAP.left.setAttribute('data-side','1');
      SNAP.left.style.maxHeight = 'calc(100vh - 16px)';
      SNAP.left.style.overflowY = 'auto';
    }
    if (SNAP.right){
      SNAP.right.setAttribute('data-side','1');
      SNAP.right.style.maxHeight = 'calc(100vh - 16px)';
      SNAP.right.style.overflowY = 'auto';
    }
    updateHeights();
  }

  function updateHeights(){
    if (SNAP.stage && SNAP.stage.getAttribute('data-mid')==='1'){
      SNAP.stage.style.maxHeight = 'calc(100vh - 12px)';
    }
    if (SNAP.left && SNAP.left.getAttribute('data-side')==='1'){
      SNAP.left.style.maxHeight = 'calc(100vh - 16px)';
    }
    if (SNAP.right && SNAP.right.getAttribute('data-side')==='1'){
      SNAP.right.style.maxHeight = 'calc(100vh - 16px)';
    }
  }

  function bindResize(){
    if (SNAP.resizeHandler) return;
    SNAP.resizeHandler = function(){ updateHeights(); };
    SNAP.orientHandler = function(){ setTimeout(updateHeights, 120); };
    window.addEventListener('resize', SNAP.resizeHandler, { passive:true });
    window.addEventListener('orientationchange', SNAP.orientHandler, { passive:true });
  }

  function applyAll(){
    // (Optional width threshold – uncomment if you only want below a size)
    // if (window.innerWidth > 1400) return; 

    disableMobileCSS();
    unfixCanvas();
    injectCSS();
    applyLayout();
    bindResize();
  }

  function revertAll(){
    window.removeEventListener('resize', SNAP.resizeHandler || function(){});
    window.removeEventListener('orientationchange', SNAP.orientHandler || function(){});

    if (SNAP.stage){
      if (SNAP.stageStyle === '') SNAP.stage.removeAttribute('style');
      else SNAP.stage.setAttribute('style', SNAP.stageStyle);
      SNAP.stage.removeAttribute('data-mid');
    }
    if (SNAP.left){
      if (SNAP.leftStyle === '') SNAP.left.removeAttribute('style');
      else SNAP.left.setAttribute('style', SNAP.leftStyle);
      SNAP.left.removeAttribute('data-side');
    }
    if (SNAP.right){
      if (SNAP.rightStyle === '') SNAP.right.removeAttribute('style');
      else SNAP.right.setAttribute('style', SNAP.rightStyle);
      SNAP.right.removeAttribute('data-side');
    }
    if (SNAP.parent){
      SNAP.parent.classList.remove('desk-flex-host');
      if (SNAP.parentStyle === '') SNAP.parent.removeAttribute('style');
      else SNAP.parent.setAttribute('style', SNAP.parentStyle);
    }
    if (SNAP.canvasCard){
      if (SNAP.canvasCardStyle === '') SNAP.canvasCard.removeAttribute('style');
      else SNAP.canvasCard.setAttribute('style', SNAP.canvasCardStyle);
    }
    restoreMobileCSS();
  }

  window.desktopLayoutRevert = revertAll;
  window.desktopLayoutApply  = applyAll;

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyAll, { once:true });
  } else {
    applyAll();
  }
})();