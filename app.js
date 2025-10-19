;
/* ===============================
   CONFIG (Phase 2 safe minimal)
   =============================== */
;(() => {
  if (window.__RA_WM_CONFIG_MIN__) return;
  window.__RA_WM_CONFIG_MIN__ = true;

  const qs = new URLSearchParams(location.search);

  const CONTRACT =
    qs.get('contract') ||
    (window._RA_CONTRACT && String(window._RA_CONTRACT)) ||
    "0x96C1469c1C76E3Bb0e37c23a830d0Eea6BCf9221";

  const RESERVOIR = "https://api.reservoir.tools/tokens/v7?media=true&tokens=";

  if (!window.__APECHAIN_RPC) {
    window.__APECHAIN_RPC = "https://rpc.apecoinchain.org";
  }

  // overlay / ring image source
  const qsWM = qs.get('wm');
  let candidate = isAllowedAssetURL(qsWM) ? qsWM : "/assets/overlay.png?v=wm10";
  const FALLBACK = "/overlay.png?v=wm10";

  function validateAndExport(src){
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      window.WM_SRC = src;
      window.dispatchEvent(new CustomEvent('ra-wm-src-ready', { detail:{ src, ok:true } }));
    };
    img.onerror = () => {
      if (src !== FALLBACK) {
        validateAndExport(FALLBACK);
      } else {
        window.WM_SRC = FALLBACK;
        window.dispatchEvent(new CustomEvent('ra-wm-src-ready', { detail:{ src: FALLBACK, ok:false } }));
      }
    };
    img.src = src + (src.includes("?") ? "&" : "?") + "t=" + Date.now();
  }

  validateAndExport(candidate);

  // Export environment snapshot
  window.RA_ENV = Object.freeze({
    contract: CONTRACT,
    reservoirAPI: RESERVOIR,
    apechainRPC: window.__APECHAIN_RPC
  });
})(); // end CONFIGG

  // ===============================
  //  FABRIC DEFAULTS
  // ===============================
  if (window.fabric) {
    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.cornerStyle = "circle";
    fabric.Object.prototype.cornerColor = "#22d3ee";
    fabric.Object.prototype.cornerStrokeColor = "#0b0c10";
    fabric.Object.prototype.cornerSize = 9;
    fabric.Object.prototype.borderColor = "#22d3ee";
    fabric.Object.prototype.borderScaleFactor = 1.2;
    fabric.Object.prototype.rotatingPointOffset = 20;
  }

  // ===============================
  //  STATE
  // ===============================
  let canvas, backgroundRect=null, overlayList=[], idLabel=null, baseGroup=null;
  let zoom=1;

  // ===============================
//  HELPERS
// ===============================
function $(id){ return document.getElementById(id); }
function safeAddListener(id, ev, fn){ const el = $(id); if (el) el.addEventListener(ev, fn); }

async function fileToDataURL(file){
  // Hard cap: 15 MB per image (tweak if you want)
  const MAX = 15 * 1024 * 1024;
  if (file && file.size > MAX){
    alert("That file is too large (max ~15 MB).");
    throw new Error("file-too-large");
  }
  return await new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

async function fetchAsDataURL(url){
  // Safety: block disallowed schemes *again* (defense-in-depth)
  if (!isAllowedAssetURL(url)) throw new Error("Blocked URL scheme");
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(), 12000); // 12s timeout
  try{
    const r = await fetch(url, { mode:"cors", signal: ac.signal, cache:"no-store" });
    if(!r.ok) throw new Error("Fetch failed");
    const b = await r.blob();
    return await new Promise((res, rej)=>{
      const fr = new FileReader();
      fr.onload = ()=>res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(b);
    });
  } finally {
    clearTimeout(t);
  }
}

function normalize(u){
  if (!u) return null;
  if (u.startsWith("ipfs://"))
    return "https://cloudflare-ipfs.com/ipfs/"+u.replace("ipfs://","").replace(/^ipfs\//,"");
  if (u.startsWith("ar://"))
    return "https://arweave.net/"+u.replace("ar://","");
  return u;
}


/* [REMOVED duplicate Non-token ring overlay helper] */
;
/* ===== RA_TOKEN_ID_DEBUG_AND_FORCE ===== */
(function(){
  if (window.__RA_TOKEN_ID_DEBUG_AND_FORCE__) return;
  window.__RA_TOKEN_ID_DEBUG_AND_FORCE__ = true;

  // Find the styles panel "Token ID" card by heading text
  function findTokenIdCard(){
    const hs = Array.from(document.querySelectorAll('h2,h3,h4,h5'));
    const h  = hs.find(n => /token\s*id/i.test((n.textContent||'').trim()));
    return h ? (h.closest('.card, .panel, section, form, div') || h.parentElement) : null;
  }

  // Read value from the common places (includes #tokenIdDisplay which often shows "#123")
  function readTokenIdValue(){
    const candidates = [
      '#tokenIdDisplay',
      '#tokenIdInput', '#tokenId', '#token',
      'input[name="tokenId"]', 'input[name="token"]',
      'input[placeholder*="Token"]', 'input[placeholder*="ID"]'
    ];
    for (const sel of candidates){
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = (el.value ?? el.textContent ?? '').trim();
      if (!raw) continue;
      const digits = (raw.match(/\d+/) || [''])[0]; // accept "#15" or "15"
      if (digits) return digits;
    }
    return '';
  }

  // Ensure label exists, is non-interactive, and sits at the very top
  function ensureLabelOnTop(idStr){
    try {
      if (!window.addOrUpdateTokenLabel) return false;
      window.addOrUpdateTokenLabel(String(idStr));
      if (window.idLabel && window.canvas){
        const c = window.canvas;
        const objs = c.getObjects() || [];
        try { window.idLabel.selectable=false; window.idLabel.evented=false; window.idLabel.hasControls=false; } catch(_){}
        try { c.bringToFront(window.idLabel); c.moveTo(window.idLabel, objs.length-1); } catch(_){}
        try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
        try { c.requestRenderAll(); } catch(_){}
      }
      return true;
    } catch(_) { return false; }
  }

  function wire(){
    const card = findTokenIdCard();
    if (!card){ setTimeout(wire, 250); return; }

    Array.from(card.querySelectorAll('button, input[type="button"], input[type="submit"], a')).forEach(btn=>{
      if (btn.__raTokIdWired) return;
      const txt = (btn.textContent || btn.value || '').toLowerCase().trim();
      if (!/^(load|place|show)\s*token\s*id$/.test(txt)) return;

      btn.__raTokIdWired = true;
      btn.addEventListener('click', (e)=>{
        const t = (e?.target?.textContent || e?.target?.value || '').toLowerCase();
        if (/load\s+by\s+token/.test(t)) return;

        const v = readTokenIdValue();
        try { console.log('[TokenID] button click -> value:', v); } catch(_){}
        if (!v) return;

        e.preventDefault();
        e.stopPropagation();
        ensureLabelOnTop(v);
      }, true);
    });
  }

  // Run now and again after small DOM changes
  wire();
  const obs = new MutationObserver(()=>wire());
  obs.observe(document.body, { childList:true, subtree:true });
})();   // <-- THIS is the missing part

  /* ===== RA_SAFE_CLEAR ===== */
function raSafeClear(keepBg=true){
  const c = window.canvas; if (!c) return;
  // if your UI wants a true reset, pass keepBg=false
  if (keepBg && typeof backgroundRect !== 'undefined' && backgroundRect){
    // remove everything except backgroundRect
    c.getObjects().slice().forEach(o=>{ if(o!==backgroundRect) c.remove(o); });
    c.requestRenderAll();
  } else {
    // do a real clear (history ops will immediately load JSON)
    try { c.clear(); } catch(_){}
  }
}

// ——— Security helpers ———
function isAllowedAssetURL(u){
  if (!u) return false;
  // Hard-block dangerous schemes up front
  if (/^\s*(javascript:|data:|blob:)/i.test(String(u))) return false;
  try{
    const url = new URL(u, location.origin);
    // Allow: same-origin relative URLs, http(s)
    return url.protocol === 'http:' || url.protocol === 'https:' || !/^[a-z][a-z0-9+\-.]*:/i.test(u);
  }catch(_){
    // If URL() fails, treat as a relative path (allowed) unless it *looks* like a scheme
    return !/^[a-z][a-z0-9+\-.]*:/i.test(String(u));
  }
}

async function fetchImageByTokenId(contract, tokenId){
  const u = RESERVOIR + encodeURIComponent(`${contract}:${tokenId}`);
  const r = await fetch(u,{headers:{'accept':'application/json'}, cache:'no-store'});
  if(!r.ok) return null;
  const j = await r.json();
  const t = j.tokens && j.tokens[0] && j.tokens[0].token;
  if(!t) return null;
  const m = t.media || {};
  const candidates = [
    (m.original && (m.original.url || m.original.mediaUrl)),
    t.imageLarge, t.image, t.imageUrl, t.imageSmall
  ].filter(Boolean).map(normalize);
  return candidates[0] || null;
}

async function fabricFromURL(url){
  return await new Promise((res)=>{
    const opts = /^data:|^blob:/i.test(url) ? {} : { crossOrigin:"anonymous" };
    fabric.Image.fromURL(url, img=>res(img), opts);
  });
}

// (single consolidated helper) keep label above other UI if present
function bringInterfaceToFront(){
  try {
    if (typeof idLabel !== 'undefined' && idLabel && canvas) {
      canvas.bringToFront(idLabel);
    }
  } catch(_){}
}

function initBackgroundRect(fill){
  backgroundRect = new fabric.Rect({
    left:0, top:0, width:canvas.getWidth(), height:canvas.getHeight(),
    fill:fill, selectable:false, evented:false, hasControls:false
  });
  backgroundRect._isBgRect = true;
  canvas.add(backgroundRect);
  canvas.sendToBack(backgroundRect);
}

function setCanvasSize(size){
  const prevW = canvas.getWidth() || size, prevH = canvas.getHeight() || size;
  const sx = size / prevW, sy = size / prevH;
  canvas.setWidth(size); canvas.setHeight(size);
  if (backgroundRect){
    backgroundRect.set({ width:size, height:size });
    canvas.sendToBack(backgroundRect);
  }
  canvas.getObjects().forEach(o=>{
    if (o === backgroundRect) return;
    o.scaleX *= sx; o.scaleY *= sy; o.left *= sx; o.top *= sy; o.setCoords();
  });
  canvas.setViewportTransform([1,0,0,1,0,0]);
  canvas.requestRenderAll();

// Phase 2: legacy 'ra-wm-recalc' event removed. Ring resizing handled by ResizeObserver.
try {
  /* no-op (legacy hook removed) */
} catch (_) {}
}

function setZoom(v){
  zoom = Math.max(0.25, Math.min(6, v));
  canvas.setZoom(zoom);
  const zv = $("zoomVal"); if (zv) zv.textContent = Math.round(zoom*100) + "%";
  canvas.requestRenderAll();
}

function lockBaseObject(o){
  if (!o) return;
  o._isBase = true;
  o.selectable = false;
  o.evented = false;
  o.hasControls = false;
  o.lockMovementX = o.lockMovementY = true;
  try { canvas.sendToBack(o); } catch(_){}
}

function clearBaseOnly(){
  canvas.getObjects().slice().forEach(o=>{ if (o._isBase) canvas.remove(o); });
  baseGroup = null; canvas.requestRenderAll();
}
// Return only the main image globally (no corner stamps)
async function makeStampedGroup(img /*, bw, bh, wmWidthRatio */){
 // Phase 2: corner-stamp logic removed – just center origin
img.set({ originX:"center", originY:"center" });
return img;
}

async function loadBaseImage(dataUrl, isToken){
  clearBaseOnly();

  if (isToken) {
    try {
      const os = canvas.getObjects() || [];
      os.forEach(o => {
        if (o && (false === true || false === true || false === true)) {
          canvas.remove(o);
        }
      });
    } catch (_) {}
  }

  const img = await fabricFromURL(dataUrl);
  img.set({ originX:"center", originY:"center" });

  // fit to canvas (no upscaling)
  const cw = canvas.getWidth(), ch = canvas.getHeight();
  const sc = Math.min(cw / img.width, ch / img.height, 1);
  img.scale(sc);

  let obj;
  if (isToken) {
    img._isBase = true;
    lockBaseObject(img);
    img.set({ left:cw/2, top:ch/2 }); img.setCoords();
    obj = img;
  } else {
    const group = await makeStampedGroup(img, img.width*sc, img.height*sc, 0.15);
    group._isBase = true;
    lockBaseObject(group);
    group.set({ left:cw/2, top:ch/2 }); group.setCoords();
    obj = group;

  // Optional: legacy hook removed
try {
  /* no-op */
} catch (_) {}
}

canvas.add(obj);
baseGroup = obj;
bringInterfaceToFront();
canvas.requestRenderAll();
}

async function addOverlayToCanvas(src, isPermanent){
  const img = await fabricFromURL(src);
  img.set({ originX:"center", originY:"center" });

  // initial scale ~ 60% of canvas' smaller side
  const cw = canvas.getWidth(), ch = canvas.getHeight();
  const maxDim = Math.min(cw, ch) * 0.60;
  const iw = img.width || maxDim, ih = img.height || maxDim;
  const sc = Math.min(1, maxDim / Math.max(iw, ih));
  if (isFinite(sc) && sc > 0) img.scale(sc);

  let obj;
  if (isPermanent) {
    img._kind = "overlay";
    obj = img;
  } else {
    const group = await makeStampedGroup(img, (img.width||maxDim)*sc, (img.height||maxDim)*sc, 0.08);
    group._kind = "overlay";
    obj = group;
  }

  canvas.add(obj);
  obj.set({ left:canvas.getWidth()/2, top:canvas.getHeight()/2 }); obj.setCoords();
  canvas.setActiveObject(obj);
  bringInterfaceToFront();
  canvas.requestRenderAll();
  return obj;
}

function renderOverlayGrid(){
  const grid = $("overlayGrid"); if (!grid) return;
  grid.innerHTML = "";
  overlayList.forEach((item, idx)=>{
    const tile = document.createElement("div");
    tile.className = "tile" + (item.perm ? " perm" : "");
    tile.style.cursor = "pointer";

    const img = document.createElement("img");
    img.src = item.src; img.alt = item.name || ""; img.title = item.name || (item.perm ? "" : "");
    img.style.maxWidth = "100%"; img.style.display = "block";
    img.addEventListener("click", async ()=>{ await addOverlayToCanvas(item.src, item.perm); });

    tile.appendChild(img);

    const cap = document.createElement("div");
    cap.style.fontSize = "11px"; cap.style.color = "#9ca3af"; cap.style.marginTop = "4px";
    cap.textContent = item.name || "overlay";
    tile.appendChild(cap);

    if (!item.perm){
      const x = document.createElement("div");
      x.textContent = "×"; x.title = "Remove";
      x.style.cssText = "position:absolute;top:4px;right:6px;cursor:pointer;color:#bbb";
      x.addEventListener("click",(e)=>{ e.stopPropagation(); overlayList.splice(idx,1); renderOverlayGrid(); });
      tile.style.position = "relative";
      tile.appendChild(x);
    }
    grid.appendChild(tile);
  });
}

function reorderOverlay(dir){
  const o = canvas.getActiveObject(); if (!o || o._kind !== "overlay") return;
  const objs = canvas.getObjects();
  const overlays = objs.filter(x=>x._kind === "overlay");
  if (overlays.length <= 1) return;

  const overlayIndices = overlays.map(x=>objs.indexOf(x)).sort((a,b)=>a-b);
  const topIdx    = overlayIndices[overlayIndices.length-1];
  const bottomIdx = overlayIndices[0];

  if (dir === "front"){
    canvas.moveTo(o, topIdx + 1);
  } else if (dir === "back"){
    canvas.moveTo(o, bottomIdx);
    const baseIdx = objs.findIndex(x=>x._isBase);
    const idx = objs.indexOf(o);
    if (baseIdx >= 0 && idx <= baseIdx){ canvas.moveTo(o, baseIdx + 1); }
  }
  bringInterfaceToFront();
  canvas.requestRenderAll();
}

// === REPLACE addOrUpdateTokenLabel WITH THIS EDITABLE + UNDO-FRIENDLY VERSION ===
function addOrUpdateTokenLabel(id){
  const c = (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  if (!c || !window.fabric) return;

  // Update the small display box if present
  try {
    const display = document.getElementById('tokenIdDisplay') || document.getElementById('raTokenIdDisplay');
    if (display) display.value = '#' + String(id).replace(/^#+/,'');
  } catch(_) {}

  // Use your formatter if present; else plain "#123"
  const fmtSel = document.getElementById('idFormat');
  const shown = (typeof window.formatTokenId === 'function')
    ? window.formatTokenId('#'+String(id), fmtSel)
    : '#'+String(id).replace(/^#+/,'');

  // Find existing label or create one
  let l = window.idLabel || (c.getObjects()||[]).find(o => o && o._raTokenId) || null;

  if (!l){
    // create once — EDITABLE by default
    l = new fabric.Text(shown, {
      originX:'center', originY:'top',
      left: c.getWidth()/2, top: 32,
      fontFamily:"Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
      fontSize: 48,
      fill: '#ffffff',
      stroke: '#000000',
      strokeWidth: 2,
      strokeUniform: true,
      selectable: true,   // allow move/resize
      evented:   true,
      hasControls: true
    });
    l._raTokenId = true;
    l._raSys     = true;
    c.add(l);
    try { c.setActiveObject(l); } catch(_){}
  } else {
    // update in-place (no remove/add → no blink)
    const before = l.text;
    l.set({ text: shown, selectable:true, evented:true, hasControls:true });
    l.setCoords();
    try { c.setActiveObject(l); } catch(_){}
    // Tell Undo recorder the object changed so Undo actually reverts
    if (before !== shown) {
      try { c.fire('object:modified', { target: l }); } catch(_){}
    }
  }

  // Keep the label on top without re-adding
  try {
    const objs = c.getObjects() || [];
    c.bringToFront(l); c.moveTo(l, objs.length - 1);
  } catch(_){}

  // Let your layer enforcer tidy stack, then render
  try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
  c.requestRenderAll();

  window.idLabel = l; // remember it
}

function formatTokenId(displayVal, fmt){
  let num = parseInt(String(displayVal).replace(/[^0-9]/g,''),10);
  if (Number.isNaN(num)) return String(displayVal);
  switch(fmt){
    case "roman":  return toRoman(num);
    case "hex":    return "0x"+num.toString(16).toUpperCase();
    case "binary": return "0b"+num.toString(2);
    case "leading":return "#"+String(num).padStart(4,'0');
    default:       return "#"+num;
  }
}

function toRoman(num){
  if (num <= 0) return String(num);
  const map = [['M',1000],['CM',900],['D',500],['CD',400],['C',100],['XC',90],['L',50],['XL',40],['X',10],['IX',9],['V',5],['IV',4],['I',1]];
  let out = '';
  for (const [sym,val] of map){ while(num >= val){ out += sym; num -= val; } }
  return out;
}

// (… earlier helpers / config / functions …)

/* Cleanup: remove any lingering HTML references to the legacy overlay asset */
;(() => {
  const kill = sel => document.querySelectorAll(sel).forEach(n => n.remove());
  document.addEventListener('DOMContentLoaded', () => {
    kill('img[src*="assets/overlay.png"]');
    kill('link[rel="preload"][href*="assets/overlay.png"]');
    kill('meta[content*="assets/overlay.png"]');
  }, { once: true });
})();

/* Favicon: inject one if the site doesn't provide it (prevents 404 /favicon.ico) */
;(() => {
  if (!document.querySelector('link[rel="icon"]')) {
    const l = document.createElement('link');
    l.rel = 'icon';
    l.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#0d0e13"/></svg>';
    document.head.appendChild(l);
  }
})();

// ===============================
//  DOM READY
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  if (window.__RA_CANVAS_BOOTED__) return;
  window.__RA_CANVAS_BOOTED__ = true;

  if (!window.fabric) {
    alert("fabric.js failed to load. Open via a local server or check internet.");
    return;
  }

  // Create Fabric canvas
  canvas = new fabric.Canvas("c", {
    backgroundColor: "transparent",
    preserveObjectStacking: true,
    enableRetinaScaling: true,
    selectionBorderColor: '#22d3ee',
    selectionColor: 'rgba(34,211,238,.08)'
  });
  window.canvas = canvas;

  // Background and initial size
  initBackgroundRect("#0d0e13");
  const sizeEl = $("canvasSize");
  const initialSize = parseInt(sizeEl ? sizeEl.value : "700", 10) || 700;
  if (sizeEl) sizeEl.value = String(initialSize);
  setCanvasSize(initialSize);
  setZoom(1);

  // Ensure faint ring (legacy hook removed)
  try { /* no-op */ } catch (_) {}

  // When WM / ring asset resolves, re-ensure (first load scenario)
  window.addEventListener('ra-wm-src-ready', () => {
    try { /* no-op (legacy hook removed) */ } catch (_) {}
  }, { once: false });

  // Layer order helper
  function enforce(){
    try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch (_) {}
  }

  // Run once right after initial layout
  enforce();

  // Keep layers sane after canvas changes
  try {
    canvas.on('object:added',    enforce);
    canvas.on('object:modified', enforce);
    canvas.on('object:removed',  enforce);
  } catch (_) {}

  // Permanents → embed to the grid (filter out the legacy overlay.png asset)
overlayList = (window.__EMBED_OVERLAYS__ || [])
  .filter(m => m && !/(^|\/)overlay\.png(?:$|\?)/i.test(String(m.src || '')))
  .map(m => ({ name: m.name, src: m.src, perm: true }));

renderOverlayGrid();

  // -------- Base image: local upload
  safeAddListener("baseUpload", "change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const data = await fileToDataURL(f);
    await loadBaseImage(data, false); // non-token => ring overlay
    // Re-ensure ring (in case a token was previously loaded & removed it)
    try { /* no-op (legacy hook removed) */ } catch (_) {}
  });

  safeAddListener("clearUpload", "click", () => {
    const inp = $("baseUpload"); if (inp) inp.value = "";
    clearBaseOnly();
    // After clearing base we may still want a faint ring visible
    try { /* no-op (legacy hook removed) */ } catch (_) {}
  });

  // ... any other startup listeners, buttons, etc. ...
});  // end DOMContentLoaded

/* ===== RA_TOKEN_ID_WIRING — place/update on-canvas Token ID label ===== */
;(() => {
  if (window.__RA_WIRE_TOKENID_BTN__) return;
  window.__RA_WIRE_TOKENID_BTN__ = true;

  // Scope to the Token ID Styles card (reduces false positives)
  function findTokenIdCard(){
    const hs = Array.from(document.querySelectorAll('h2,h3,h4,h5'));
    const h  = hs.find(n => /token\s*id/i.test((n.textContent||'').trim()));
    return h ? (h.closest('.card, .panel, section, form, div') || h.parentElement) : document.body;
  }

  // Prefer the styles panel display, then other inputs, then last loaded token memory
  function readTokenInputValue(){
    // 1) Styles panel display (often shows "#123")
    const display = document.querySelector('#tokenIdDisplay');
    const rawDisp = (display && (display.value ?? display.textContent) || '').trim();
    const digitsDisp = (rawDisp.match(/\d+/) || [''])[0];

    // 2) Other common inputs
    const fallbacks = [
      '#tokenIdInput', '#tokenId', '#token',
      'input[name="tokenId"]', 'input[name="token"]',
      'input[placeholder*="Token"]', 'input[placeholder*="ID"]'
    ];
    let digitsFB = '';
    for (const sel of fallbacks){
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = (el.value ?? el.textContent ?? '').trim();
      const d = (raw.match(/\d+/) || [''])[0];
      if (d){ digitsFB = d; break; }
    }

    // 3) Last loaded token remembered by the image loader
    const mem = (window.__raTokenMemory || '').trim();

    return digitsDisp || digitsFB || mem || '';
  }

  function placeLabelOnTop(idStr){
    try {
      if (typeof window.addOrUpdateTokenLabel !== 'function') return;
      window.addOrUpdateTokenLabel(String(idStr));
      const c = window.canvas, l = window.idLabel;
      if (c && l){
        // ensure it sits at the very top
        const n = (c.getObjects()||[]).length;
        try { c.bringToFront(l); c.moveTo(l, n-1); } catch(_){}
        try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
        try { c.requestRenderAll(); } catch(_){}
      }
    } catch(_){}
  }

  const handler = (e)=>{
    // Ignore the *image* loader button; we only place the TEXT label here
    const t = (e?.target?.textContent || e?.target?.value || '').toLowerCase();
    if (/load\s+by\s+token/.test(t)) return;

    const idStr = readTokenInputValue();
    if (!idStr) return;

    e.preventDefault?.();
    e.stopPropagation?.();
    placeLabelOnTop(idStr);
  };

  // 1) Bind by common button IDs (if they exist)
  ['loadTokenId','loadTokenID','tokenIdLoad','placeTokenId'].forEach(id=>{
    const el = document.getElementById(id);
    if (el && !el.__raTokIdWired){
      el.__raTokIdWired = true;
      el.addEventListener('click', handler, true);
    }
  });

  // 2) Fallback: bind by visible text inside the Token ID Styles card
  const scope = findTokenIdCard();
  scope.addEventListener('click', (e)=>{
    const btn = e.target && e.target.closest && e.target.closest('button, a, input[type="button"], input[type="submit"]');
    if (!btn || !scope.contains(btn)) return;
    const txt = (btn.textContent || btn.value || '').toLowerCase().trim();
    if (/^(load\s*token\s*id|place\s*token\s*id|show\s*token\s*id)$/.test(txt)){
      handler(e);
    }
  }, true);
})();
  
/* ===== RA_JSON_RESTORE_GUARD (Phase 2 aware) ===== */
(function RA_JSON_RESTORE_GUARD(){
  if (window.__RA_JSON_RESTORE_GUARD__) return;
  window.__RA_JSON_RESTORE_GUARD__ = true;

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  function patch(c){
    if (!c || c.__raPatchedLoadJSON) return;
    const orig = c.loadFromJSON.bind(c);

    c.loadFromJSON = function(json, cb, reviver){
      const userCb = (typeof cb === 'function') ? cb : function(){};
      // Set both legacy + Phase 2 restore guards
      window.__raLoadingJSON = true;
      window.__RA_RESTORING__ = true;
      try {
        document.dispatchEvent(new CustomEvent('ra-json-restore-start'));
        return orig(json, () => {
          try {
            window.__raLoadingJSON = false;
            window.__RA_RESTORING__ = false;
            try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch (_){}
            try { var cc = C(); cc && cc.requestRenderAll && cc.requestRenderAll(); } catch (_){}
            document.dispatchEvent(new CustomEvent('ra-json-restore-end'));
            // Re-ensure faint ring (legacy hook removed)
            try { /* no-op */ } catch (_){}
          } finally {
            try { userCb(); } catch (_){}
          }
        }, reviver);
      } catch (e){
        window.__raLoadingJSON = false;
        window.__RA_RESTORING__ = false;
        throw e;
      }
    };

    c.__raPatchedLoadJSON = true;
  }

  (function wait(){
    const c = C();
    if (!c) return setTimeout(wait, 120);
    patch(c);
  })();
})();

/* -------- Base image: load by token (multi-collection) -------- */
safeAddListener("loadToken","click", async ()=>{
  const statusEl = $("tokenStatus");
  const tokenIdRaw  = (($("tokenIdInput")||{}).value || "").trim();
  if (!tokenIdRaw){ if (statusEl) statusEl.textContent = "Enter a token ID."; return; }

  try { window.__raTokenMemory = String(tokenIdRaw).replace(/[^0-9]/g,''); } catch(_){}

  function selectedContract(){
    const sel = $("collectionSelect") || $("collectionKey") || document.querySelector("[data-ra-collection-select]");
    const opt = sel?.selectedOptions?.[0];
    const fromData = opt?.dataset?.contract || opt?.getAttribute?.("data-contract");
    const val = (fromData || sel?.value || "").trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(val)) return val;
    const list = (window.RA_COLLECTIONS && Array.isArray(window.RA_COLLECTIONS)) ? window.RA_COLLECTIONS : [];
    const hit  = list.find(x => x.key===val || x.slug===val || x.name===val);
    if (hit && (hit.address || hit.contract)) return (hit.address || hit.contract);
    return (typeof CONTRACT === "string" && CONTRACT) ? CONTRACT : "0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221";
  }

  const contract = selectedContract();
  if (statusEl) statusEl.textContent = "Fetching token…";

  try{
    const imgUrl = await fetchImageByTokenId(contract, tokenIdRaw);
    if (!imgUrl){ if (statusEl) statusEl.textContent = "No image URL found."; return; }

    if (statusEl) statusEl.textContent = "Downloading image…";
    const data = await fetchAsDataURL(imgUrl);

    await loadBaseImage(data, true); // token => no ring

    // Tag base with contract
    try{
      const base = (canvas.getObjects()||[]).find(o => o._isBase && !o._isBgRect);
      if (base) base._tokenContract = contract;
      window.__raLastTokenContract = contract;
    }catch(_){}

    if (statusEl) statusEl.textContent = "Loaded 👍";

    // Ensure ring stays hidden (safety; loadBaseImage already removed it)
    try {
      (canvas.getObjects()||[]).forEach(o=>{
        if (o && (false || false || false)) o.visible = false;
      });
      canvas.requestRenderAll();
    } catch(_){}
  }catch(_){
    if (statusEl) statusEl.textContent = "Failed to load token.";
  }
});

/* -------- Canvas controls -------- */
safeAddListener("zoomIn","click",  ()=> setZoom(zoom*1.1));
safeAddListener("zoomOut","click", ()=> setZoom(zoom/1.1));
safeAddListener("zoomReset","click", ()=>{
  setZoom(1);
  canvas.setViewportTransform([1,0,0,1,0,0]);
});

safeAddListener("canvasSize","change", (e)=>{
  const v = parseInt(e.target.value, 10);
  if (!isNaN(v)) setCanvasSize(v);
});

safeAddListener("clearBase","click", clearBaseOnly);

safeAddListener("clearCanvas","click", ()=>{
  raSafeClear(true);          // keep backgroundRect, clear everything else
  idLabel = null; 
  baseGroup = null;
  // Re-create faint ring (non-token mode) if appropriate
  try { /* no-op (legacy hook removed) */ } catch (_) {}
  // Re-enforce layer order after a short delay so undo/restore ops aren't racing
  setTimeout(()=>{
    try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch (_) {}
  }, 60);
});

/* -------- Token ID style live controls (if present) -------- */
["change","input"].forEach(ev=>{
  safeAddListener("idFormat", ev, ()=>{
    if (idLabel){
      idLabel.text = formatTokenId((($("tokenIdDisplay")||{}).value)||"", (($("idFormat")||{}).value)||"plain");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("idSize", ev, ()=>{
    if (idLabel){
      idLabel.set('fontSize', parseInt((($("idSize")||{}).value)||"52",10));
      canvas.requestRenderAll();
    }
  });
  safeAddListener("idColor", ev, ()=>{
    if (idLabel){
      idLabel.set('fill', (($("idColor")||{}).value)||"#fff");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("idStrokeColor", ev, ()=>{
    if (idLabel){
      idLabel.set('stroke', (($("idStrokeColor")||{}).value)||"transparent");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("idStrokeWidth", ev, ()=>{
    if (idLabel){
      idLabel.set('strokeWidth', parseInt((($("idStrokeWidth")||{}).value)||"0",10));
      canvas.requestRenderAll();
    }
  });
});
safeAddListener("deleteTokenId","click", ()=>{
  if (idLabel){ canvas.remove(idLabel); idLabel=null; canvas.requestRenderAll(); }
});

/* -------- Custom text (optional UI) -------- */
safeAddListener("addCustomText","click", ()=>{
  const val = (($("customText")||{}).value||"").trim(); if (!val) return;

  // Use IText (editable single-line) → tight bounds, no forced width
  const txt = new fabric.IText(val, {
    left: canvas.getWidth()/2,
    top:  canvas.getHeight()/2,
    originX: "center",
    originY: "center",
    textAlign: "left",
    fontFamily: (($("fontFamily")||{}).value) || "Arial, sans-serif",
    fontSize: parseInt((($("fontSize")||{}).value)||"48",10),
    fill: (($("fontColor")||{}).value) || "#ffffff",
    stroke: (($("strokeColor")||{}).value) || "transparent",
    strokeWidth: parseInt((($("strokeWidth")||{}).value)||"0",10),
    strokeUniform: true,
    paintFirst: "stroke",
    objectCaching: false,
    perPixelTargetFind: true
    // editable: true is default for IText
  });

  // Tighten bounds (ensure no cached wide box)
  txt.set({ width: undefined });
  if (txt.initDimensions) txt.initDimensions();
  txt.setCoords();

  txt._kind = 'customText';
  canvas.add(txt);
  canvas.setActiveObject(txt);
  bringInterfaceToFront();
  canvas.requestRenderAll();
});

["change","input"].forEach(ev=>{
  safeAddListener("fontFamily", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind==='customText'){
      o.set('fontFamily', (($("fontFamily")||{}).value)||o.fontFamily||"Arial, sans-serif");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("fontSize", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind === 'customText') {
      o.set('fontSize', parseInt((($("fontSize")||{}).value)||"48",10));
      canvas.requestRenderAll();
    }
  });
  safeAddListener("fontColor", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind==='customText'){
      o.set('fill', (($("fontColor")||{}).value)||o.fill||"#ffffff");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("strokeColor", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind==='customText'){
      o.set('stroke', (($("strokeColor")||{}).value)||o.stroke||"transparent");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("strokeWidth", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind === 'customText') {
      o.set('strokeWidth', parseInt((($("strokeWidth")||{}).value)||"0",10));
      canvas.requestRenderAll();
    }
  });
});

safeAddListener("delSelectedText","click", ()=>{
  const o=canvas.getActiveObject();
  if (o && o._kind==='customText'){ canvas.remove(o); canvas.requestRenderAll(); }
});

safeAddListener("delAllText","click", ()=>{
  canvas.getObjects().slice().forEach(o=>{ if (o._kind==='customText') canvas.remove(o); });
  canvas.requestRenderAll();
});

/* -------- Selection tools -------- */
safeAddListener("duplicate","click", ()=>{
  const o = canvas.getActiveObject(); if (!o) return;
  o.clone(c=>{
    c.set({ left:(o.left||0)+20, top:(o.top||0)+20 });
    
    // Preserve permanence flag from original
    if (typeof o?._isPermanent !== 'undefined') {
      c._isPermanent = o._isPermanent;
    }

    // Force the clone and its children to be treated as overlays
    function setOverlayKindDeep(obj) {
      if (!obj) return;

      const isSystem =
        obj._raSys || false || false || obj._isBgRect || obj._isBase || false || obj._raTokenId;

      if (!isSystem) {
        obj._kind = 'overlay';
      }

      const children = (typeof obj.getObjects === 'function' ? obj.getObjects() : obj._objects) || [];
      children.forEach(setOverlayKindDeep);
    }
    setOverlayKindDeep(c);
    
    canvas.add(c).setActiveObject(c);
    canvas.requestRenderAll();
  });
});

safeAddListener("delete","click", ()=>{
  if (!window.canvas) return;
  const c = window.canvas;
  const o = c.getActiveObject && c.getActiveObject();
  if (!o) return;

  // Never delete background, base, or system items from this button
  if (o._isBgRect || o._isBase || o._raSys) return;

  // If it’s the Token-ID label, clear the pointer so it won’t come back
  try { if (o._raTokenId) { window.idLabel = null; } } catch(_) {}

  try { c.discardActiveObject(); } catch(_) {}
  try { c.remove(o); } catch(_) {}
  try { c.requestRenderAll(); } catch(_) {}
});

// -------- Keyboard Delete/Backspace (same rules as Selection → Delete)
document.addEventListener('keydown', (e)=>{
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (e.target?.isContentEditable || /^(input|textarea|select)$/.test(tag)) return;

  const isDeleteKey = (e.key === 'Delete') || (e.key === 'Backspace');
  if (!isDeleteKey) return;

  const c = window.canvas;
  if (!c) return;
  const o = c.getActiveObject && c.getActiveObject();
  if (!o) return;

  if (o._isBgRect || o._isBase || o._raSys) { e.preventDefault(); return; }

  try { if (o._raTokenId) { window.idLabel = null; } } catch(_) {}

  try { c.discardActiveObject(); } catch(_) {}
  try { c.remove(o); } catch(_) {}
  try { c.requestRenderAll(); } catch(_) {}

  e.preventDefault();
}, true);

safeAddListener("opacity","input", (e)=>{
  const o=canvas.getActiveObject(); if(!o) return;
  o.set('opacity', parseFloat(e.target.value||"1"));
  canvas.requestRenderAll();
});

safeAddListener("blendMode","change", (e)=>{
  const o = canvas.getActiveObject(); if (!o) return;
  o.globalCompositeOperation = (e.target.value === "normal") ? null : e.target.value;
  canvas.requestRenderAll();
});

safeAddListener("bringFront","click", ()=> reorderOverlay('front'));
safeAddListener("sendBack","click",  ()=> reorderOverlay('back'));

safeAddListener("flipX","click", ()=>{
  const o=canvas.getActiveObject(); if(!o) return;
  o.toggle && o.toggle('flipX'); canvas.requestRenderAll();
});

safeAddListener("flipY","click", ()=>{
  const o=canvas.getActiveObject(); if(!o) return;
  o.toggle && o.toggle('flipY'); canvas.requestRenderAll();
});

safeAddListener("lock","click", ()=>{
  const o = canvas.getActiveObject(); if (!o) return;
  o.set({
    selectable:false, evented:false, hasControls:false,
    lockMovementX:true, lockMovementY:true,
    lockScalingX:true, lockScalingY:true,
    lockRotation:true
  });
  canvas.requestRenderAll();
});

// ---- FIXED: do not unlock backgroundRect or _isBase objects ----
safeAddListener("unlockAll","click", ()=>{
  const c = window.canvas; if (!c) return;
  const objs = c.getObjects() || [];

  const bg = objs.find(o => o && o._isBgRect);
  if (bg) {
    bg.selectable = false; bg.evented = false; bg.hasControls = false;
    bg.lockMovementX = bg.lockMovementY = bg.lockScalingX = bg.lockScalingY = bg.lockRotation = true;
    try { c.moveTo(bg, 0); } catch(_) {}
  }

  const active = c.getActiveObject && c.getActiveObject();
  if (active && active._isBgRect) {
    try { c.discardActiveObject(); } catch(_) {}
  }

  objs.forEach(o => {
    if (!o) return;
    if (o._isBgRect || o._isBase || o._raSys || o._raTokenId) return;
    o.set({
      selectable: true, evented: true, hasControls: true,
      lockMovementX: false, lockMovementY: false,
      lockScalingX:  false, lockScalingY:  false,
      lockRotation:  false
    });
  });

  c.requestRenderAll();
});

safeAddListener("clearAllOverlays", "click", () => {
  const isSystem = (o) =>
    o?._raSys || o?.false || o?.false || o?._isBgRect || o?._isBase || o?.false || o?._raTokenId;

  const isRemovableOverlay = (o) =>
    o && o._kind === "overlay" && !o._isPermanent && !isSystem(o);

  function removeChildFromGroup(group, child) {
    if (typeof group.removeWithUpdate === "function") {
      group.removeWithUpdate(child);
    } else if (typeof group.remove === "function") {
      group.remove(child);
      group._calcBounds?.();
      group.setCoords?.();
    } else if (Array.isArray(group._objects)) {
      group._objects = group._objects.filter((o) => o !== child);
      group._calcBounds?.();
      group.setCoords?.();
    }
  }

  function pruneGroupRecursive(obj) {
    if (!obj || typeof obj.getObjects !== "function") return;
    const children = (obj.getObjects?.() || obj._objects || []).slice();

    children.forEach((child) => {
      if (isRemovableOverlay(child)) {
        removeChildFromGroup(obj, child);
      } else if (typeof child.getObjects === "function" || child.type === "group") {
        pruneGroupRecursive(child);
        const remaining = child.getObjects?.() || child._objects || [];
        if (remaining.length === 0 && !child._isPermanent) {
          removeChildFromGroup(obj, child);
        }
      }
    });
  }

  (canvas.getObjects?.() || []).slice().forEach((o) => {
    if (isRemovableOverlay(o)) {
      canvas.remove(o);
    } else if (typeof o.getObjects === "function" || o.type === "group") {
      pruneGroupRecursive(o);
      const remaining = o.getObjects?.() || o._objects || [];
      if (remaining.length === 0 && (o._kind === "overlay" || !o._isPermanent)) {
        canvas.remove(o);
      }
    }
  });

  canvas.discardActiveObject?.();
  canvas.requestRenderAll?.();
});

/* -------- Overlays panel & uploads -------- */
safeAddListener("overlayUpload","change", async (e)=>{
  const files=Array.from(e.target.files||[]);
  for(const f of files){
    const data=await fileToDataURL(f);
    overlayList.unshift({name:f.name, src:data, perm:false});
    await addOverlayToCanvas(data,false);
  }
  renderOverlayGrid(); e.target.value="";
});

safeAddListener("clearOverlayGrid","click", ()=>{
  overlayList = overlayList.filter(o=>o.perm);
  renderOverlayGrid();
});

// -------- Keyboard helpers (duplicate + nudge only; delete handled elsewhere) --------
document.addEventListener("keydown", (e)=>{
  const tag = (e.target && e.target.tagName || "").toLowerCase();
  if (e.target?.isContentEditable || /^(input|textarea|select)$/.test(tag)) return;

  const c = window.canvas; if (!c) return;
  const o = c.getActiveObject && c.getActiveObject();
  if (!o) return;

  // Duplicate (Cmd/Ctrl + D)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
    // Never duplicate system/base/bg/token-id items
    if (o._isBgRect || o._isBase || o._raSys || o._raTokenId || false || false || false) {
      e.preventDefault();
      return;
    }
    try {
      o.clone(cl => {
        cl.set({ left:(o.left||0)+10, top:(o.top||0)+10 });

        function markAsOverlayDeep(node){
          if (!node) return;
            // Skip if system-ish
            if (!(node._isBgRect || node._isBase || node._raSys || node._raTokenId || false || false || false)) {
              node._kind = 'overlay';
            }
            const kids = (typeof node.getObjects === 'function' ? node.getObjects() : node._objects) || [];
            kids.forEach(markAsOverlayDeep);
        }
        markAsOverlayDeep(cl);

        c.add(cl);
        c.setActiveObject(cl);
        c.requestRenderAll();
      });
    } catch(_) {}
    e.preventDefault();
    return;
  }

  // Arrow key nudge (Shift = 10px)
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {

    if (o._isBgRect || o._isBase || o._raSys || o._raTokenId || false || false || false) {
      e.preventDefault();
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft")  o.left -= step;
    if (e.key === "ArrowRight") o.left += step;
    if (e.key === "ArrowUp")    o.top  -= step;
    if (e.key === "ArrowDown")  o.top  += step;
    o.setCoords();
    c.requestRenderAll();
    e.preventDefault();
    return;
  }
});

/* -------- SNAP + ALIGN UI (v2 – robust bounding box snapping) -------- */
(function snapAlignV2(){
  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function ensureUI(){
    let row = document.getElementById("raSnapRow");
    if (!row){
      const header = Array.from(document.querySelectorAll("h3,h2")).find(h => (h.textContent||"").trim().toLowerCase()==="selection");
      const holder = header ? header.parentNode : document.body;
      row = document.createElement("div");
      row.id = "raSnapRow";
      row.style.cssText = "margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center";
      row.innerHTML = `
        <button class="btn small" id="raCenterH">Center H</button>
        <button class="btn small" id="raCenterV">Center V</button>
        <button class="btn small" id="raCenterHV">Center HV</button>
        <button class="btn small" id="raSnapToggle">Snap: On</button>
        <div style="opacity:.65;font-size:11px">Arrows=1px · Shift+Arrows=10px · Cmd/Ctrl+D duplicate</div>
      `;
      holder.appendChild(row);
      document.getElementById("raCenterH").onclick  = ()=>center("H");
      document.getElementById("raCenterV").onclick  = ()=>center("V");
      document.getElementById("raCenterHV").onclick = ()=>center("HV");
    }
    const toggle = document.getElementById("raSnapToggle");
    if (toggle && !toggle.__wired){
      toggle.__wired = true;
      toggle.onclick = ()=>{
        window.__snapOn = !window.__snapOn;
        toggle.textContent = "Snap: " + (window.__snapOn ? "On" : "Off");
      };
    }
  }

  function center(which){
    const c = C(); if (!c) return;
    const o = c.getActiveObject(); if(!o) return;

    if (o._raSys || false || false || false || o._isBgRect || o._isBase || o._raTokenId) return;
    const cw = c.getWidth(), ch = c.getHeight();
    if (which==="H" || which==="HV") o.left = cw/2;
    if (which==="V" || which==="HV") o.top  = ch/2;
    o.setCoords(); c.requestRenderAll();
  }

  function isSnapTarget(o){
    if (!o) return false;

    if (o._raSys || false || false || false || o._isBgRect || o._isBase || o._raTokenId) return false;
    const kind = (o._kind||'').toLowerCase();
    const t = (o.type||'').toLowerCase();
    return kind==='overlay' || kind==='sticker' || kind==='icon' || kind==='customtext' ||
           t==='textbox' || t==='i-text' || t==='text';
  }

  function snapObject(o){
    if (!window.__snapOn || !isSnapTarget(o)) return;
    const c = C(); if (!c) return;
    let br;
    try { br = o.getBoundingRect(true, true); } catch(_){ return; }

    const cw = c.getWidth(), ch = c.getHeight();
    const tol = 8;

    const centerX = br.left + br.width / 2;
    const centerY = br.top  + br.height / 2;

    let dx = 0, dy = 0;

    // Center lines
    if (Math.abs(centerX - cw/2) <= tol) dx += (cw/2 - centerX);
    if (Math.abs(centerY - ch/2) <= tol) dy += (ch/2 - centerY);

    // Edges
    if (Math.abs(br.left - 0) <= tol) dx += (0 - br.left);
    if (Math.abs(br.top - 0) <= tol) dy += (0 - br.top);
    if (Math.abs((br.left + br.width) - cw) <= tol) dx += (cw - (br.left + br.width));
    if (Math.abs((br.top + br.height) - ch) <= tol) dy += (ch - (br.top + br.height));

    if (dx || dy){
      o.left += dx;
      o.top  += dy;
      o.setCoords();
    }
  }

  function wireSnap(){
    const c = C(); if (!c){ setTimeout(wireSnap,120); return; }
    if (c.__snapV2Wired) return;
    c.__snapV2Wired = true;

    if (typeof window.__snapOn === 'undefined') window.__snapOn = true;

    function handler(e){
      const o = e && e.target;
      if (!o) return;
      snapObject(o);
    }

    c.on('object:moving',   handler);
    c.on('object:scaling',  handler);
    c.on('object:rotating', handler);

    c.on('mouse:up', ()=>{
      const o = c.getActiveObject();
      if (o){ snapObject(o); c.requestRenderAll(); }
    });
  }

  ensureUI();
  wireSnap();
})();

/* -------- ADMIN PORTAL (toggle with ?admin=1) -------- */
(function adminDock(){
  const isAdmin = /\badmin=1\b/i.test(location.search);
  if (!isAdmin) { renderPublishedShelf(); return; }

  if ($("raAdminDock2")) { renderPublishedShelf(); return; }

  function fileToDataURL2(file){
    return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });
  }
  function getShelf(){ try{ return JSON.parse((localStorage||sessionStorage).getItem('ra2_published')||'[]'); }catch(_){ return []; } }
  function setShelf(arr){ try{ (localStorage||sessionStorage).setItem('ra2_published', JSON.stringify(arr||[])); }catch(_){} }
  function setMsg(t){ const el=$("ra2Msg"); if (el) el.textContent=t||''; }

  const dock = document.createElement('div');
  dock.id = 'raAdminDock2';
  dock.style.cssText = 'position:fixed;right:16px;bottom:16px;width:300px;background:#0e0f13;border:1px solid #2a2a2e;border-radius:12px;box-shadow:0 10px 24px rgba(0,0,0,.45);color:#e7e7ea;font:13px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;z-index:999999';
  dock.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #222">
      <strong>Admin Overlays</strong>
      <div style="display:flex;gap:6px;align-items:center;">
        <button id="ra2Export"  style="background:#10b981;border:0;border-radius:8px;color:#08130e;padding:6px 10px;cursor:pointer">Export pack</button>
        <button id="ra2Hide"    style="background:#1b1c22;border:1px solid #2a2a2e;border-radius:6px;color:#e7e7ea;padding:4px 8px;cursor:pointer">Hide</button>
      </div>
    </div>
    <div id="ra2Body" style="padding:10px 12px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
        <button id="ra2Add"   style="background:#3b82f6;border:0;border-radius:8px;color:#fff;padding:6px 10px;cursor:pointer">Add PNGs</button>
        <button id="ra2Clear" style="background:#2a2a2e;border:0;border-radius:8px;color:#ccc;padding:6px 10px;cursor:pointer">Clear</button>
        <div id="ra2Msg" style="opacity:.75;min-height:18px"></div>
      </div>
      <div id="ra2Grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:260px;overflow:auto;"></div>
      <div style="opacity:.55;margin-top:8px">Use <em>Publish</em> to add items to the shelf below for everyone.</div>
    </div>
  `;
  document.body.appendChild(dock);

  $("ra2Hide").onclick = ()=>{
    const b=$("ra2Body"); const btn=$("ra2Hide");
    const h = b.style.display==='none'; b.style.display=h?'block':'none'; btn.textContent=h?'Hide':'Show';
  };
  $("ra2Export").onclick = ()=>{
    const blob = new Blob([JSON.stringify({version:1,items:getShelf()})], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='overlays.json'; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 200);
  };
  $("ra2Add").onclick = ()=>{
    const inp=document.createElement('input');
    inp.type='file'; inp.accept='image/png'; inp.multiple=true; inp.style.display='none';
    inp.onchange = async (e)=>{
      const files = Array.from(e.target.files||[]);
      files.forEach(async f=>{
        const dataURL = await fileToDataURL2(f);
        addTile({ name: f.name.replace(/\.png$/i,'').replace(/[_-]+/g,' '), dataURL });
      });
      inp.remove();
    };
    document.body.appendChild(inp); inp.click();
  };
  $("ra2Clear").onclick = ()=>{
    const g=$("ra2Grid"); if (g) g.innerHTML='';
    setMsg('Cleared');
    setTimeout(()=>setMsg(''), 800);
  };

  function addTile(item){
    const grid=$("ra2Grid"); if (!grid) return;
    const tile=document.createElement("div");
    tile.style.cssText='position:relative;border:1px solid #2a2a2e;border-radius:8px;background:#15161c;padding:6px;text-align:center;';
    tile.innerHTML = `
      <div style="height:80px;display:flex;align-items:center;justify-content:center;">
        <img src="${item.dataURL}" alt="${item.name||''}" style="max-width:100%;max-height:80px;"/>
      </div>
      <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name||''}</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;">
        <button data-act="publish" class="raTinyBtn2">Publish</button>
        <button data-act="add"      class="raTinyBtn2">Add</button>
        <button data-act="del"      class="raTinyBtn2" title="Remove">×</button>
      </div>
    `;
    tile.querySelectorAll('.raTinyBtn2').forEach(b=>{
      b.style.cssText='background:#2a2a2e;border:0;border-radius:6px;color:#ddd;padding:3px 8px;cursor:pointer;font-size:12px;';
    });
    tile.addEventListener("click", (ev)=>{
      const btn=ev.target.closest("button"); if(!btn) return;
      const act=btn.getAttribute("data-act");
      if (act==="del"){ tile.remove(); return; }
      if (act==="publish"){
        const arr=getShelf(); arr.push({ name:item.name, dataURL:item.dataURL }); setShelf(arr);
        setMsg(`Published: ${item.name}`); setTimeout(()=>setMsg(''), 800);
      }
      if (act==="add"){ addOverlayToCanvas(item.dataURL,false); setMsg(`Added: ${item.name}`); setTimeout(()=>setMsg(''), 800); }
    });
    grid.appendChild(tile);
  }

  renderPublishedShelf();
})();

/* -------- Render Published shelf (visible for everyone) -------- */
function renderPublishedShelf(){
  function getShelf(){ try{ return JSON.parse((localStorage||sessionStorage).getItem('ra2_published')||'[]'); }catch(_){ return []; } }
  function ensureShelf(){
    if ($("ra2Shelf")) return true;
    const h3 = Array.from(document.querySelectorAll('h3')).find(h => (h.textContent||'').trim().toLowerCase()==='overlays');
    const card = h3 ? h3.parentNode : null; if (!card) return false;
    const wrap = document.createElement('div'); wrap.id='ra2Shelf'; wrap.style.marginTop='8px';
    wrap.innerHTML = `
      <div style="font-weight:600;opacity:.85;margin-bottom:6px">Published Overlays</div>
      <div id="ra2ShelfGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:240px;overflow:auto;"></div>
    `;
    card.appendChild(wrap); return true;
  }
  function addToCanvas(src){ addOverlayToCanvas(src,false); }
  function draw(){
    if (!ensureShelf()) { setTimeout(draw,300); return; }
    const grid=$("ra2ShelfGrid"); if (!grid) return;
    grid.innerHTML='';
    getShelf().forEach(item=>{
      const tile = document.createElement('div');
      tile.style.cssText = 'position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;text-align:center;cursor:pointer;';

      const frame = document.createElement('div');
      frame.style.cssText = 'height:80px;display:flex;align-items:center;justify-content:center;';
      const img = document.createElement('img');
      img.src = item.dataURL;
      img.alt = item.name || '';
      img.style.cssText = 'max-width:100%;max-height:80px;';
      frame.appendChild(img);

      const cap = document.createElement('div');
      cap.style.cssText = 'font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      cap.textContent = item.name || '';

      tile.appendChild(frame);
      tile.appendChild(cap);
      tile.addEventListener('click', ()=> addToCanvas(item.dataURL));
      grid.appendChild(tile);
    });
  }
  draw();
}

// ===============================
//  EXPORT (optional UI IDs: exportPng / openNewTab)
//  — self-contained: includes the New Tab viewer (fit ↔ actual size)
// ===============================
document.addEventListener("DOMContentLoaded", ()=>{
  // Make sure the UI button can’t submit a surrounding <form>
  const openBtn = $("openNewTab");
  if (openBtn && openBtn.tagName === "BUTTON") openBtn.setAttribute("type","button");

  // Regular PNG download
  safeAddListener("exportPng","click",()=> doExport(false));

  // New-tab viewer (Safari/Chrome safe)
safeAddListener("openNewTab", "click", (e) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  e.stopPropagation();
  window.raOpenNewTabViewer();
});

  // High-quality PNG export used by both paths
  function doExport(openTab){
    if (!window.canvas) return;
    const rawMult = parseInt((($("exportMultiplier")||{}).value) || "2", 10);
    const mult    = Math.max(1, Math.min(4, isFinite(rawMult) ? rawMult : 2));

    let dataURL;
    try{
      dataURL = canvas.toDataURL({format:"png", enableRetinaScaling:true, multiplier:mult});
    }catch(_){
      alert("Export blocked (CORS). Use images with CORS headers or same-origin.");
      return;
    }
    const prev = $("exportPreview"); if (prev) prev.src = dataURL;

    // Manual “save last export” link (if present in UI)
    const manual = $("manualLink");
    if (manual){ manual.href = dataURL; manual.textContent = "Open last export (manual save)"; }

    if (openTab) {
      fetch(dataURL).then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank", "noopener");
        if (!w) {
          // Popup blocked → trigger a download instead of navigating away
          const a = document.createElement("a");
          a.href = url;
          a.download = "rebel-ant-overlay.png";
          document.body.appendChild(a);
          a.click();
          setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1500);
        }
      });
    } else {
      const a = document.createElement("a");
      a.href = dataURL; a.download = "rebel-ant-overlay.png";
      document.body.appendChild(a); a.click(); a.remove();
    }
  }

 // ---- New Tab viewer (opens via blob URL; works in Safari & Chrome) ----
window.raOpenNewTabViewer = function raOpenNewTabViewer(){
  if (!window.canvas){ alert("Canvas not ready"); return; }

  // Read export multiplier from UI (1..8), default 2
  const multEl = document.getElementById("exportMultiplier") || document.getElementById("exportQuality");
  let mult = 2;
  if (multEl){
    const v = parseInt((multEl.value||multEl.textContent||"").replace(/\D+/g,""),10);
    if (v && v>=1 && v<=8) mult = v;
  }

  let dataUrl;
  try{
    dataUrl = canvas.toDataURL({ format:"png", multiplier: mult, enableRetinaScaling:true });
  }catch(_){
    alert("Export blocked (CORS). Use images with CORS headers or same-origin.");
    return;
  }

  // Minimal HTML viewer with Fit ↔ Actual toggle
  const html = [
    "<!doctype html><html><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width, initial-scale=1'>",
    "<title>Export</title>",
    "<style>",
    "html,body{height:100%;margin:0;background:#0b0c10;overflow:auto}",
    ".viewer{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0c10}",
    "img#raImg{display:block;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);width:auto;height:auto;box-shadow:0 8px 24px rgba(0,0,0,.5);border-radius:8px;image-rendering:auto}",
    ".hud{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);color:#e5e7eb;opacity:.75;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:rgba(0,0,0,.35);padding:6px 8px;border-radius:6px;user-select:none}",
    "</style></head><body>",
    "<div class='viewer'><img id='raImg' alt='export'/></div>",
    "<div class='hud'>Click image to toggle: Fit ↔ Actual size</div>",
    "<script>",
    "var img=document.getElementById('raImg');",
    "img.src=", JSON.stringify(dataUrl), ";",
    "var fit=true;",
    "function apply(){",
    " if(fit){img.style.maxWidth='calc(100vw - 32px)';img.style.maxHeight='calc(100vh - 32px)';img.style.width='auto';img.style.height='auto';}",
    " else{img.style.maxWidth='none';img.style.maxHeight='none';img.style.width='auto';img.style.height='auto';}",
    "}",
    "img.addEventListener('click',function(){fit=!fit;apply();});",
    "apply();",
    "</script>",
    "</body></html>"
  ].join("");

  // Open viewer via blob URL + anchor (user-initiated navigation)
  const viewerBlob = new Blob([html], { type: "text/html" });
  const viewerUrl  = URL.createObjectURL(viewerBlob);

  const a = document.createElement("a");
  a.href = viewerUrl;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => { URL.revokeObjectURL(viewerUrl); a.remove(); }, 60000);
};
});  // <-- closes DOMContentLoaded


(function RA_CANVAS_RESIZE_SYNC_ONLY_V8(){
  if (window.__RA_RESIZE_V8_INIT__) return;
  window.__RA_RESIZE_V8_INIT__ = true;

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  // Config flags (tweak if desired)
  const SCALE_BASE      = true;   // scale base image/group when resizing
  const SCALE_OVERLAYS  = true;   // scale user overlays
  const SCALE_TOKEN_ID  = false;  // keep token ID label size constant (position shifts)
  const MIN_SIZE = 400, MAX_SIZE = 2000;

  function isoverlay(o){
    return !!(o && (false || false || false));
  }
  function isSystem(o){
    return !!(o && (o._raSys || o._isBgRect || isoverlay(o)));
  }
  function isTokenIdLabel(o){
    return !!(o && o._raTokenId);
  }
  function shouldScale(o){
    if (!o) return false;
    if (isSystem(o)) return false;
    if (isTokenIdLabel(o)) return SCALE_TOKEN_ID;
    if (o._isBase) return SCALE_BASE;
    if (o._kind === 'overlay') return SCALE_OVERLAYS;
    // Default: scale only if it's not an excluded category
    return true;
  }

  function resizeCanvasAndScale(newSize){
    const c = C(); if (!c) return;
    let target = parseInt(newSize, 10);
    if (!isFinite(target)) return;
    target = Math.max(MIN_SIZE, Math.min(MAX_SIZE, target));

    const oldW = c.getWidth(), oldH = c.getHeight();
    if (!oldW || !oldH) return;
    if (oldW === target && oldH === target){
      // Just normalize transform
      try { c.setViewportTransform([1,0,0,1,0,0]); } catch(_) {}
      try { c.requestRenderAll(); } catch(_) {}
      return;
    }

    const s = target / oldW; // square assumption
    const oldCenter = new fabric.Point(oldW/2, oldH/2);
    const newCenter = new fabric.Point(target/2, target/2);

    // Snapshot object center + original scale for objects we will transform
    const objs = (c.getObjects() || []).slice();
    const info = objs.map(o => ({
      o,
      ctr: (typeof o.getCenterPoint === 'function')
            ? o.getCenterPoint()
            : new fabric.Point(o.left||0, o.top||0),
      sx: o.scaleX || 1,
      sy: o.scaleY || 1,
      doScale: shouldScale(o)
    }));

    // Resize canvas
    c.setWidth(target);
    c.setHeight(target);

    // Adjust backgroundRect (no uniform scale; direct size)
    const bgRect = (window.backgroundRect && typeof window.backgroundRect.set === 'function') ? window.backgroundRect : null;
    if (bgRect) {
      try {
        bgRect.set({ width: target, height: target, left: 0, top: 0 });
        c.sendToBack(bgRect);
        bgRect.setCoords();
      } catch(_) {}
    }

    // Transform eligible objects
    info.forEach(({o, ctr, sx, sy, doScale}) => {
      try {
        const offsetX = ctr.x - oldCenter.x;
        const offsetY = ctr.y - oldCenter.y;
        const nx = newCenter.x + offsetX * s;
        const ny = newCenter.y + offsetY * s;

        if (doScale){
          o.set({ scaleX: sx * s, scaleY: sy * s });
        }
        // Always reposition to keep relative placement
        if (typeof o.setPositionByOrigin === 'function') {
          o.setPositionByOrigin(new fabric.Point(nx, ny), 'center', 'center');
        } else {
          o.left = nx; o.top = ny;
        }
        o.setCoords();
      } catch(_) {}
    });

    // Normalize viewport
    try { c.setViewportTransform([1,0,0,1,0,0]); } catch(_) {}
    const zEl = document.getElementById('zoomVal'); if (zEl) zEl.textContent = '100%';

    // Legacy ring hook removed
    try { /* no-op */ } catch(_) {}
    try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_) {}

    try { c.requestRenderAll(); } catch(_) {}
  }

  // Expose globally (overrides earlier Phase 2 setCanvasSize)
  window.raResizeCanvasAndScale = resizeCanvasAndScale;
  window.setCanvasSize = resizeCanvasAndScale;

  function wireSizeInput(){
    const el = document.getElementById('canvasSize');
    if (el && !el.__raBoundV8) {
      el.__raBoundV8 = true;
      el.addEventListener('change', (e)=> {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v)) resizeCanvasAndScale(v);
      });
    }
  }

  function wireQuickButtons(){
    if (document.__raSizeCaptureOnlyV8) return;
    document.__raSizeCaptureOnlyV8 = true;
    document.addEventListener('click', function(ev){
      const btn = ev.target && ev.target.closest && ev.target.closest('button');
      if (!btn) return;
      const t = (btn.textContent||'').trim();
      if (/^(700|900|1024|1200)$/i.test(t)) {
        ev.preventDefault(); ev.stopImmediatePropagation(); ev.stopPropagation();
        const v = parseInt(t, 10);
        resizeCanvasAndScale(v);
        const sizeInput = document.getElementById('canvasSize');
        if (sizeInput) sizeInput.value = v;
      }
    }, true);
  }

  function boot(){
    wireSizeInput();
    wireQuickButtons();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* ==========================================================
   RA_FIXED_CENTER_CANVAS_V2 (Phase 2 aware)
   - Fixes ghost dimension staleness
   - Optional true viewport centering (config)
   - Throttled reposition
   - Safe cleanup + re-init guard
   ========================================================== */
(function RA_FIXED_CENTER_CANVAS_V2(){
  if (window.__RA_FIXED_CENTER_INIT__) return;
  window.__RA_FIXED_CENTER_INIT__ = true;

  // Config flags (tweak as desired)
  const TRUE_VIEWPORT_CENTER = true;   // if false: keep original column X position
  const MIN_TOP              = 12;     // clamp so it never hugs the very top
  const DISABLE_MOBILE_MAX_W = 640;    // disable on very narrow viewports (set null to always enable)
  const Z_INDEX              = 40;     // slightly above typical UI, below modals you might set later

  function byId(id){ return document.getElementById(id); }
  function getCanvasCard(){
    const c = byId('c');
    if (!c) return null;
    return c.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper') || c.parentElement;
  }

  function install(){
    const card = getCanvasCard();
    if (!card) { setTimeout(install, 180); return; }
    if (card.__raFixedCenterApplied) return;
    card.__raFixedCenterApplied = true;

    // Respect mobile disable
    if (DISABLE_MOBILE_MAX_W && window.innerWidth <= DISABLE_MOBILE_MAX_W) {
      return; // leave in flow
    }

    // Create/update ghost placeholder
    const ghost = document.createElement('div');
    ghost.id = 'raCanvasGhost';
    ghost.setAttribute('aria-hidden','true');
    ghost.style.visibility = 'hidden';
    ghost.style.pointerEvents = 'none';
    ghost.style.width  = card.offsetWidth + 'px';
    ghost.style.height = card.offsetHeight + 'px';

    // Insert ghost just before card so layout stays
    card.parentNode.insertBefore(ghost, card);

    // Capture initial flow rect for column anchoring
    let initialRect = ghost.getBoundingClientRect();

    Object.assign(card.style, {
      position: 'fixed',
      zIndex: String(Z_INDEX),
      margin: 0,
      left: '0px',
      top:  '0px',
      right:'auto',
      transform: 'none'
    });

    // Throttle reposition inside rAF
    let pending = false;
    function requestPlace(){
      if (pending) return;
      pending = true;
      requestAnimationFrame(()=>{
        pending = false;
        place();
      });
    }

    function updateGhostSize(){
      // Keep ghost dimension synced in case card interior changed
      try {
        ghost.style.width  = card.offsetWidth + 'px';
        ghost.style.height = card.offsetHeight + 'px';
      } catch(_) {}
    }

    function place(){
      if (!document.body.contains(card)) return; // removed
      updateGhostSize();
      const gRect = ghost.getBoundingClientRect();

      // Column X origin (from initialRect, to maintain original horizontal alignment if not centering)
      if (!initialRect || !initialRect.width) initialRect = gRect;

      const cardHeight = card.offsetHeight || gRect.height;
      let top = Math.max(MIN_TOP, Math.round((window.innerHeight - cardHeight) / 2));

      // On very tall layouts you may prefer not to overly center—optionally clamp
      // Example: if (cardHeight > window.innerHeight * 0.9) top = MIN_TOP;

      let left;
      if (TRUE_VIEWPORT_CENTER){
        // Fully center in viewport horizontally
        const cardWidth = card.offsetWidth || gRect.width;
        left = Math.max(0, Math.round((window.innerWidth - cardWidth) / 2));
      } else {
        // Maintain column alignment using original flow X
        left = Math.round(gRect.left);
      }

      card.style.top  = top  + 'px';
      card.style.left = left + 'px';
      card.style.width = gRect.width + 'px';
    }

    // Observers
    let roCard, roGhost;
    try {
      roCard = new ResizeObserver(()=> requestPlace());
      roCard.observe(card);
    } catch(_) {}
    try {
      roGhost = new ResizeObserver(()=> requestPlace());
      roGhost.observe(ghost);
    } catch(_) {}

    window.addEventListener('scroll', requestPlace, { passive: true });
    window.addEventListener('resize', requestPlace);

    document.addEventListener('ra:canvas-ready', requestPlace);

    // Public cleanup if needed
    window.__RA_UNFIX_CANVAS = function(){
      try {
        window.removeEventListener('scroll', requestPlace);
        window.removeEventListener('resize', requestPlace);
        roCard && roCard.disconnect();
        roGhost && roGhost.disconnect();
      } catch(_) {}
      if (card && document.body.contains(card)){
        card.style.position = '';
        card.style.top = '';
        card.style.left = '';
        card.style.width = '';
        card.style.zIndex = '';
      }
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      card && (card.__raFixedCenterApplied = false);
      window.__RA_FIXED_CENTER_INIT__ = false;
    };

    place();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();

/* =========================================
   RA_MOBILE_FLOW_v29  — MOBILE ONLY (≤900px)
   - Canvas/Stage enters normal page flow above "Rebel Ant"
   - Hides original Konva container (removes stray checkerboard)
   - Scales via stage.scale (no CSS transforms) + syncs DOM size
   - Debounced resize/orientation handling
   - Clean teardown when leaving mobile breakpoint
   ========================================= */
(() => {
  const MEDIA_Q = '(max-width: 900px)';
  const CSS = `
    @media ${MEDIA_Q}{
      #ra-mobile-stage-host{
        order:-1;
        width:100%;
        display:flex;
        justify-content:center;
        margin:12px 0 8px;
      }
      #ra-mobile-stage-frame{
        width: min(92vw, 620px);
        aspect-ratio: 1 / 1;
        position: relative;
        border-radius: 12px;
        overflow: hidden;
        background:#0d0e13;
      }
      #ra-mobile-checker{
        position:absolute; inset:0; border-radius:inherit; pointer-events:none;
        background-image:
          linear-gradient(45deg, rgba(0,0,0,.35) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(0,0,0,.35) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(0,0,0,.35) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(0,0,0,.35) 75%);
        background-size: 24px 24px;
        background-position: 0 0, 0 12px, 12px -12px, -12px 0px;
      }
      #ra-mobile-stage-frame > .konvajs-content,
      #ra-mobile-stage-frame > canvas{
        position:absolute; top:0; left:0; border-radius:inherit;
      }
      .ra-canvas-floater,[data-ra-role="stage-floater"]{ display:none !important; }
    }`;

  const mq = window.matchMedia(MEDIA_Q);
  let applied = false;
  let styleEl, host, frame, checker, live, origRoot, origRootDisplay, mo;
  let rafPending = false;

  function $(q){ return document.querySelector(q); }
  function $$(q){ return Array.from(document.querySelectorAll(q)); }

  function findKonvaContent(){
    // Prefer window.stage.getContent if stage exists
    if (window.stage && typeof window.stage.getContent === 'function') {
      return window.stage.getContent();
    }
    // Fallback: first konvajs-content that is not obviously Fabric
    const candidates = $$('.konvajs-content');
    if (candidates.length) return candidates[0];
    return null;
  }

  function findUploadCard(){
    const h = $$('h1,h2,h3').find(n => /rebel\s*ant/i.test((n.textContent||'')));
    return h ? (h.closest('.card, .panel, section, form, div') || h.parentElement) : null;
  }

  function debounced(fn){
    return function(){
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(()=>{
        rafPending = false;
        fn();
      });
    };
  }

  const fitStageIntoFrame = debounced(function fit(){
    if (!mq.matches || !applied || !frame) return;
    if (!window.stage){
      // Retry shortly until stage is ready
      setTimeout(fitStageIntoFrame, 120);
      return;
    }
    try {
      const content = window.stage.getContent?.() || live;
      if (!content) return;

      // Logical base size (assumes square or uses max dimension)
      const baseW = window.stage.width();
      const baseH = window.stage.height();
      const logicalSide = Math.max(baseW, baseH) || 1024;

      const targetPx = frame.clientWidth; // square frame width

      // Scale the stage itself (Konva coordinate system remains logical)
      const scale = targetPx / logicalSide;
      window.stage.scale({ x: scale, y: scale });
      window.stage.position({ x: 0, y: 0 });

      // Reflect visual size in DOM for proper pointer mapping
      content.style.width  = `${targetPx}px`;
      content.style.height = `${targetPx}px`;

      // Optionally you could also do: window.stage.batchDraw();
      window.stage.draw();
    } catch(_) {}
  });

  function apply(){
    if (!mq.matches || applied) return;
    // Guard: only proceed if we have a Konva environment (avoid hijacking Fabric canvas)
    const konvaContent = findKonvaContent();
    if (!konvaContent) return;

    live = konvaContent;
    origRoot = live.parentElement;
    if (!origRoot) return;

    host = document.createElement('div');
    host.id = 'ra-mobile-stage-host';
    frame = document.createElement('div');
    frame.id = 'ra-mobile-stage-frame';
    checker = document.createElement('div');
    checker.id = 'ra-mobile-checker';
    frame.appendChild(checker);
    host.appendChild(frame);

    const card = findUploadCard();
    const container = card?.parentElement || document.body;
    if (card) container.insertBefore(host, card); else container.prepend(host);

    frame.appendChild(live);

    origRootDisplay = origRoot.style.display;
    origRoot.style.display = 'none';

    try { window.stage?.draggable(false); } catch(_) {}

    fitStageIntoFrame();
    applied = true;
  }

  function cleanup(){
    if (!applied) return;
    try {
      if (live && origRoot) origRoot.appendChild(live);
      if (origRoot) origRoot.style.display = origRootDisplay || '';
      host?.remove();
    } catch(_) {}
    applied = false;
  }

  function kick(){
    if (mq.matches) {
      apply();
      fitStageIntoFrame();
    } else {
      cleanup();
    }
  }

  // Inject CSS once
  styleEl = document.getElementById('ra-mobile-flow-css-v29');
  if (!styleEl){
    styleEl = document.createElement('style');
    styleEl.id = 'ra-mobile-flow-css-v29';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  // Observe DOM to catch late stage creation (e.g., async mount)
  if (!mo){
    mo = new MutationObserver(() => {
      if (mq.matches && !applied) apply();
    });
    mo.observe(document.documentElement, { childList:true, subtree:true });
  }

  window.addEventListener('resize', fitStageIntoFrame, {passive:true});
  window.addEventListener('orientationchange', () => setTimeout(fitStageIntoFrame, 200), {passive:true});
  mq.addEventListener?.('change', kick);

  // Expose manual toggles if needed
  window.__RA_MOBILE_STAGE_REFRESH = fitStageIntoFrame;
  window.__RA_DISABLE_MOBILE_FLOW = function(){
    cleanup();
    mq.removeEventListener?.('change', kick);
    window.removeEventListener('resize', fitStageIntoFrame);
    window.removeEventListener('orientationchange', fitStageIntoFrame);
    mo && mo.disconnect();
  };

  kick();
})();

/* ====================== RA_MOBILE_CSS_FIT_V4 (MOBILE ONLY) ======================
   Coexists with RA_MOBILE_FLOW_v29:
   - If Konva mobile flow (v29) is active, this script no-ops.
   - Otherwise (e.g., Fabric-only), it fits the main canvas via CSS without changing intrinsic size.
   - Hides fixed-center ghost & stray checkerboard siblings once.
   ============================================================================== */
(() => {
  const MQ = '(max-width: 920px)';
  if (!window.matchMedia(MQ).matches) return;
  if (window.__RA_MOBILE_CSS_FIT_V4__) return;
  window.__RA_MOBILE_CSS_FIT_V4__ = true;

  // If Konva mobile flow script is present (v29), it manages layout itself.
  if (window.__RA_MOBILE_STAGE_REFRESH || document.getElementById('ra-mobile-stage-frame')) {
    // Konva flow active → bail
    return;
  }

  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const  $ = (s, r=document)=>r.querySelector(s);

  function isLikelyOffscreenUtilityCanvas(c){
    // Heuristic: extremely small or 0-sized logical canvases used for measurement
    return (c.width <= 2 && c.height <= 2);
  }

  function findStageCanvas(){
    // Prefer a Fabric canvas (id="c") if present
    const primary = $('#c');
    if (primary && primary.width && primary.height) return primary;

    // Otherwise pick the largest non-trivial canvas
    const all = $$('canvas').filter(c => !isLikelyOffscreenUtilityCanvas(c));
    if (!all.length) return null;
    return all.reduce((a,b)=> (b.width * b.height > (a?.width||0)*(a?.height||0) ? b : a), null);
  }

  function hideGhostsAndStrips(wrap){
    const ghost = document.getElementById('raCanvasGhost');
    if (ghost && ghost.getAttribute('data-ra-hidden-gap') !== '1'){
      ghost.style.display = 'none';
      ghost.style.height  = '0px';
      ghost.style.margin  = '0';
      ghost.style.padding = '0';
      ghost.setAttribute('data-ra-hidden-gap', '1');
    }

    [wrap?.previousElementSibling, wrap?.nextElementSibling].forEach(el => {
      if (!el || el.getAttribute('data-ra-hidden-gap') === '1') return;
      const cs = getComputedStyle(el);
      const looksChecker = (cs.backgroundImage||'').includes('linear-gradient')
                        || (cs.backgroundImage||'').includes('repeating');
      const looksEmpty = el.getBoundingClientRect().height < 12 || !(el.textContent||'').trim();
      if (looksChecker || looksEmpty){
        el.style.display = 'none';
        el.style.height  = '0';
        el.style.margin  = '0';
        el.style.padding = '0';
        el.setAttribute('data-ra-hidden-gap', '1');
      }
    });
  }

  let rafPending = false;
  function cssFit(){
    if (!window.matchMedia(MQ).matches) return;
    // Skip if Konva stage is present (let RA_MOBILE_FLOW handle)
    if (window.stage && typeof window.stage.getContent === 'function') return;

    const stage = findStageCanvas();
    if (!stage) return;
    const wrap = stage.parentElement || stage;

    const W = Math.max(1, stage.width);
    const H = Math.max(1, stage.height);

    const host  = wrap.parentElement || document.body;
    const hostW = Math.max(320, host.clientWidth || window.innerWidth);
    const sidePad = 28;
    const targetW = Math.min(W, hostW - sidePad);
    const scale   = Math.min(1, targetW / W);
    const dW      = Math.round(W * scale);
    const dH      = Math.round(H * scale);

    Object.assign(wrap.style, {
      width: dW + 'px',
      height: dH + 'px',
      maxWidth: '100%',
      margin: '0 auto 16px auto',
      position: 'relative'
    });

    $$('canvas', wrap).forEach(c => {
      c.style.width    = dW + 'px';
      c.style.height   = dH + 'px';
      c.style.maxWidth = '100%';
      c.style.display  = 'block';
    });

    hideGhostsAndStrips(wrap);
  }

  function scheduleFit(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      cssFit();
    });
  }

  function bindLoadTriggers(){
    const markers = $$('section,div').filter(n => (n.innerText||'').toLowerCase().includes('rebel ant'));
    markers.forEach(card => {
      $$('button', card).forEach(btn => {
        const t = (btn.textContent||'').toLowerCase().trim();
        if (['load', 'load by token', 'clear upload'].includes(t)){
          if (!btn.__raFitBound){
            btn.__raFitBound = true;
            btn.addEventListener('click', () => setTimeout(scheduleFit, 60), {passive:true});
          }
        }
      });
      const file = $('input[type="file"]', card);
      if (file && !file.__raFitBound){
        file.__raFitBound = true;
        file.addEventListener('change', () => setTimeout(scheduleFit, 60), {passive:true});
      }
    });
  }

  // MutationObserver to refit on dynamic UI changes
  const mo = new MutationObserver(() => {
    if (!window.matchMedia(MQ).matches) return;
    // Skip if Konva stage logic appears later
    if (window.stage && typeof window.stage.getContent === 'function') return;
    bindLoadTriggers();
    scheduleFit();
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('resize',           scheduleFit, {passive:true});
  window.addEventListener('orientationchange',() => setTimeout(scheduleFit, 150), {passive:true});

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { bindLoadTriggers(); scheduleFit(); }, {once:true});
  } else {
    bindLoadTriggers(); scheduleFit();
  }

  const styleId = 'ra-mobile-css-fit-v4-style';
  if (!document.getElementById(styleId)){
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      @media ${MQ} {
        [data-ra-hidden-gap="1"] { display:none !important; height:0 !important; margin:0 !important; padding:0 !important; }
      }
    `;
    document.head.appendChild(s);
  }

  // Public disable if needed
  window.__RA_DISABLE_MOBILE_CSS_FIT = function(){
    mo.disconnect();
    window.removeEventListener('resize', scheduleFit);
    window.removeEventListener('orientationchange', scheduleFit);
  };
})();

/* ==================== RA_AI_QUOTE_v1 — “✨ Inspire me” (motivational quotes) ====================
   What this adds:
   • A button “✨ Inspire me” near your Custom Text controls
   • Each click adds (or replaces) a motivational quote on the canvas
   • Quotes are varied and avoid recent repeats (remembers 40 recent in localStorage)
   • Text is centered, wrapped to 80% of canvas width, with a readable outline
   • Uses your existing text controls (font, size, color, stroke) after insertion
   ============================================================================================== */
(() => {
  const RECENT_KEY = 'ra_ai_quotes_recent_v1';

  // ——— Small helpers ———
  const $  = (sel, r=document) => r.querySelector(sel);
  const $$ = (sel, r=document) => Array.from(r.querySelectorAll(sel));

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
  }
  function pushRecent(q) {
    const arr = getRecent();
    arr.unshift(String(q).trim());
    // keep only the latest 40 unique
    const seen = new Set();
    const dedup = [];
    for (const s of arr) { if (!seen.has(s)) { seen.add(s); dedup.push(s); } }
    dedup.length = Math.min(dedup.length, 40);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(dedup)); } catch (_) {}
  }

  // ——— Quote generator (lightweight, but varied) ———
  const COMMANDS = [
    "Keep going", "Stay hungry", "Trust the process", "Outwork yesterday",
    "Start before you're ready", "Consistency compounds", "Progress over perfection",
    "Ship it", "Make it simple", "Play the long game", "No zero days",
    "Bet on yourself", "Stay curious", "Do the hard things", "Win the morning",
    "Keep showing up", "Build in public", "One brick at a time", "Move with purpose",
    "Be relentlessly resourceful", "Protect your momentum", "Take the stairs",
    "Create then iterate", "Make it a habit", "Focus beats talent",
    "Earn it daily", "Start now", "Prove it", "Own your time", "Small steps, big moves"
  ];
  const TAILS = [
    "small steps add up", "momentum beats perfect", "discipline is freedom",
    "tiny wins compound", "results love consistency", "courage over comfort",
    "1% better every day", "clarity comes from action", "done beats perfect",
    "practice makes progress", "keep the promise to yourself", "get uncomfortable",
    "dreams need deadlines", "start messy", "execute loudly",
    "be patient and persistent", "aim for better, not easy", "work the plan",
    "prove it with work", "show up for yourself", "stack your wins",
    "build the streak", "trust your future self", "act like it matters",
    "make room for greatness", "keep it moving", "focus and finish",
    "make today count", "finish strong", "do one more rep"
  ];
  const SEPS = [" — ", " · ", " — ", ": "]; // weighted toward em‑dash

  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  function makeQuote(attempt=0){
    const q = `${pick(COMMANDS)}${pick(SEPS)}${pick(TAILS)}.`;
    const recent = getRecent();
    if (!recent.includes(q)) return q;
    // Try a few times to avoid an immediate repeat
    return attempt < 60 ? makeQuote(attempt+1) : q;
  }

  // ——— Drop (or replace) quote on Fabric canvas ———
  function addOrReplaceQuote(){
    const c = window.canvas;
    if (!c || !window.fabric) { alert('Canvas not ready'); return; }

    const quote = makeQuote();
    const cw = c.getWidth(), ch = c.getHeight();
    const width = Math.round(cw * 0.84);

    // Size scales with canvas (feels right across 700/900/1024/1200)
    const defaultSize = Math.round(Math.max(28, Math.min(64, cw * 0.055)));

    // Prefer the current UI controls if present (so user style is respected)
    const family = ($('#fontFamily')||{}).value || "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif";
    const size   = parseInt(($('#fontSize')||{}).value||defaultSize, 10);
    const fill   = ($('#fontColor')||{}).value || "#ffffff";
    const stroke = ($('#strokeColor')||{}).value || "#000000";
    const swidth = parseInt(($('#strokeWidth')||{}).value||"2", 10);

    // If a custom text is selected, replace its contents; otherwise add a new one
    const active = c.getActiveObject();
    if (active && active._kind === 'customText') {
      active.text = quote;
      active.setCoords();
      c.requestRenderAll();
      pushRecent(quote);
      return;
    }

    const tb = new fabric.Textbox(quote, {
      left: cw/2, top: ch/2,
      originX: "center", originY: "center",
      width, textAlign: "center",
      fontFamily: family,
      fontSize: size,
      fill, stroke, strokeWidth: swidth,
      editable: true
    });
    tb._kind = 'customText';
    tb._raAiQuote = true;

    c.add(tb).setActiveObject(tb);
    // Keep token ID label on top if you use it
    try { if (typeof window.bringInterfaceToFront === 'function') window.bringInterfaceToFront(); } catch(_){}
    c.requestRenderAll();
    pushRecent(quote);
  }

  // ——— Inject the “✨ Inspire me” button into your existing UI ———
  function injectButton(){
    if (document.getElementById('raAiQuoteBtn')) return;

    // Try to place it next to your existing "Add" custom text button if present
    let anchor = document.getElementById('addCustomText');
    if (!anchor) {
      // Fall back to placing after the custom text input/textarea or in the same panel
      anchor = document.getElementById('customText') ||
               $$('input,textarea,button').find(b => /custom\s*text/i.test((b.id||b.textContent||'')));
    }
    if (!anchor) { setTimeout(injectButton, 300); return; }

    const btn = document.createElement('button');
    btn.id = 'raAiQuoteBtn';
    btn.textContent = '✨ Inspire me';
    btn.className = 'btn';
    btn.style.marginLeft = '8px';
    btn.style.cursor = 'pointer';

    // If your buttons use a "small" variant, mirror it
    if (anchor.classList.contains('small')) btn.classList.add('small');

    btn.addEventListener('click', addOrReplaceQuote);
    // Insert right after the anchor button/input
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }

  // Boot once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton, { once:true });
  } else {
    injectButton();
  }
})();

/* ==============================================================
   RA_FONT_PICKER_UNIFIED_V1
   - Base curated font list + Google web fonts (optgroup)
   - Live preview box under each picker (#fontFamily, #idFontFamily)
   - Persists last chosen font (localStorage key: ra_last_font_stack)
   - Immediate application to active customText & token ID label
   - Safe against repeated DOM mutations (idempotent)
   ============================================================= */
(function RA_FONT_PICKER_UNIFIED_V1(){
  if (window.__RA_FONT_PICKER_UNIFIED_V1__) return;
  window.__RA_FONT_PICKER_UNIFIED_V1__ = true;

  const PICKER_IDS = ['fontFamily','idFontFamily'];
  const LS_KEY     = 'ra_last_font_stack';
  const PREVIEW_SAMPLE = window.__RA_FONT_PREVIEW_SAMPLE || 'AaBbCc 1234  #RebelAnts';

  // Base (system / bundled) fonts
  const BASE_FONTS = [
    { name:'Impact',              stack:"Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
    { name:'Arial Black',         stack:"'Arial Black', Gadget, sans-serif" },
    { name:'Arial',               stack:"Arial, Helvetica, sans-serif" },
    { name:'Helvetica Neue',      stack:"'Helvetica Neue', Helvetica, Arial, sans-serif" },
    { name:'Verdana',             stack:"Verdana, Geneva, sans-serif" },
    { name:'Tahoma',              stack:"Tahoma, Geneva, sans-serif" },
    { name:'Trebuchet MS',        stack:"'Trebuchet MS', Helvetica, sans-serif" },
    { name:'Segoe UI',            stack:"'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
    { name:'Calibri',             stack:"Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif" },
    { name:'Optima',              stack:"Optima, Segoe, 'Segoe UI', Candara, Calibri, Arial, sans-serif" },
    { name:'Avenir',              stack:"Avenir, 'Avenir Next', 'Segoe UI', sans-serif" },
    { name:'Futura',              stack:"Futura, 'Century Gothic', 'Gill Sans', Arial, sans-serif" },
    { name:'Gill Sans',           stack:"'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
    { name:'Century Gothic',      stack:"'Century Gothic', AppleGothic, sans-serif" },

    { name:'Georgia',             stack:"Georgia, 'Times New Roman', serif" },
    { name:'Times New Roman',     stack:"'Times New Roman', Times, serif" },
    { name:'Baskerville',         stack:"Baskerville, 'Baskerville Old Face', Garamond, 'Times New Roman', serif" },
    { name:'Garamond',            stack:"Garamond, Baskerville, 'Baskerville Old Face', 'Times New Roman', serif" },
    { name:'Palatino',            stack:"Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
    { name:'Didot',               stack:"Didot, 'Bodoni 72', 'Bodoni MT', 'Times New Roman', serif" },
    { name:'Rockwell',            stack:"Rockwell, 'Courier New', Georgia, serif" },

    { name:'Courier New',         stack:"'Courier New', Courier, monospace" },
    { name:'Menlo',               stack:"Menlo, Monaco, Consolas, 'Courier New', monospace" },
    { name:'Consolas',            stack:"Consolas, 'Lucida Console', Monaco, monospace" },
    { name:'Lucida Console',      stack:"'Lucida Console', Monaco, monospace" },

    { name:'Copperplate',         stack:"Copperplate, 'Copperplate Gothic Light', fantasy" },
    { name:'Papyrus',             stack:"Papyrus, fantasy" },
    { name:'Brush Script MT',     stack:"'Brush Script MT', cursive" },
    { name:'Comic Sans MS',       stack:"'Comic Sans MS', 'Comic Sans', Chalkboard, cursive" },

    { name:'System UI',           stack:"system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }
  ];

  // Web fonts (Google). Each has a 'kind' to refine fallback stack.
  const WEB_FONTS = [
    { name:'Inter',             google:'Inter:wght@400;600;700',          kind:'sans' },
    { name:'Roboto',            google:'Roboto:wght@400;500;700',         kind:'sans' },
    { name:'Poppins',           google:'Poppins:wght@400;600;700',        kind:'sans' },
    { name:'Montserrat',        google:'Montserrat:wght@400;600;700',     kind:'sans' },
    { name:'Lato',              google:'Lato:wght@400;700',               kind:'sans' },
    { name:'Raleway',           google:'Raleway:wght@400;600;700',        kind:'sans' },
    { name:'Oswald',            google:'Oswald:wght@400;600;700',         kind:'sans' },
    { name:'Nunito',            google:'Nunito:wght@400;600;800',         kind:'sans' },
    { name:'Source Sans 3',     google:'Source+Sans+3:wght@400;600;700',  kind:'sans' },
    { name:'Merriweather',      google:'Merriweather:wght@400;700',       kind:'serif' },
    { name:'Playfair Display',  google:'Playfair+Display:wght@400;700',   kind:'serif' },
    { name:'Abril Fatface',     google:'Abril+Fatface',                   kind:'serif' },
    { name:'Bebas Neue',        google:'Bebas+Neue',                      kind:'display' },
    { name:'Dancing Script',    google:'Dancing+Script:wght@400;600',     kind:'script' },
    { name:'Pacifico',          google:'Pacifico',                        kind:'script' },
    { name:'Inconsolata',       google:'Inconsolata:wght@400;700',        kind:'mono' },
    { name:'Fira Code',         google:'Fira+Code:wght@400;600',          kind:'mono' },
    { name:'JetBrains Mono',    google:'JetBrains+Mono:wght@400;700',     kind:'mono' }
  ];

  function fallbackStack(kind){
    switch(kind){
      case 'serif': return 'Georgia, "Times New Roman", serif';
      case 'mono':  return 'ui-monospace, SFMono-Regular, "Courier New", monospace';
      case 'script':return '"Brush Script MT", cursive';
      case 'display':return 'Impact, Arial, sans-serif';
      default:      return 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    }
  }
  function stackForWeb(f){ return `"${f.name}", ${fallbackStack(f.kind)}`; }

  function injectGoogleOnce(){
    if (document.getElementById('raUnifiedWebFontsCSS')) return;
    const fam = WEB_FONTS.map(f=>'family='+f.google).join('&');
    const href = 'https://fonts.googleapis.com/css2?'+fam+'&display=swap';
    ['https://fonts.gstatic.com','https://fonts.googleapis.com'].forEach(u=>{
      if (!document.querySelector(`link[rel="preconnect"][href="${u}"]`)){
        const lk=document.createElement('link');
        lk.rel='preconnect'; lk.href=u;
        if (u.includes('gstatic')) lk.crossOrigin='anonymous';
        document.head.appendChild(lk);
      }
    });
    const link=document.createElement('link');
    link.id='raUnifiedWebFontsCSS';
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
    if (document.fonts && document.fonts.ready){
      document.fonts.ready.then(()=>{ try { window.canvas?.requestRenderAll(); } catch(_){} });
    }
  }

  function ensurePreview(picker, id){
    const pid='raPreview_'+id;
    let box=document.getElementById(pid);
    if(!box){
      box=document.createElement('div');
      box.id=pid;
      box.style.cssText=[
        'margin-top:6px','padding:8px 10px','border:1px solid #2a2a2e',
        'border-radius:8px','background:#111319','color:#e7e7ea',
        'font-size:15px','line-height:1.35','letter-spacing:.1px'
      ].join(';');
      const label=document.createElement('div');
      label.textContent='Preview';
      label.style.cssText='font-size:11px;opacity:.65;margin-bottom:4px';
      const txt=document.createElement('div');
      txt.className='raPreviewText';
      txt.textContent=PREVIEW_SAMPLE;
      box.appendChild(label); box.appendChild(txt);
      picker.parentNode.insertBefore(box, picker.nextSibling);
    }
    return box.querySelector('.raPreviewText');
  }

  function applySelectionToCanvas(stack, pickerId){
    const c=window.canvas;
    if (!c) return;
    const active=c.getActiveObject && c.getActiveObject();
    if (active && active._kind==='customText'){
      active.set('fontFamily', stack);
    }
    if (pickerId==='idFontFamily' && window.idLabel){
      window.idLabel.set('fontFamily', stack);
    }
    try { c.requestRenderAll(); } catch(_) {}
  }

  async function handleChange(select, pickerId, previewEl){
    const stack=select.value;
    try { localStorage.setItem(LS_KEY, stack); } catch(_){}
    previewEl.style.fontFamily = stack;
    // Try font load (probe one weight); timeout fails safe
    const fam = stack.split(',')[0].replace(/["']/g,'').trim();
    if (document.fonts && fam){
      try {
        await Promise.race([
          document.fonts.load(`48px "${fam}"`),
          new Promise(res=>setTimeout(res,1200))
        ]);
      } catch(_) {}
    }
    applySelectionToCanvas(stack, pickerId);
  }

  function rebuildSelect(el, pickerId){
    const stored = localStorage.getItem(LS_KEY)||'';
    const current = el.value;
    el.innerHTML='';

    // Base group (no label, just flat)
    BASE_FONTS.forEach(f=>{
      const opt=document.createElement('option');
      opt.value=f.stack;
      opt.textContent=f.name;
      opt.style.fontFamily=f.stack;
      opt.style.fontSize='14px';
      el.appendChild(opt);
    });

    // Web fonts group
    const og=document.createElement('optgroup');
    og.label='Web fonts';
    WEB_FONTS.forEach(f=>{
      const opt=document.createElement('option');
      opt.value=stackForWeb(f);
      opt.textContent=f.name;
      opt.style.fontFamily=opt.value;
      opt.style.fontSize='14px';
      og.appendChild(opt);
    });
    el.appendChild(og);

    const allStacks=[...BASE_FONTS.map(f=>f.stack), ...WEB_FONTS.map(f=>stackForWeb(f))];
    const target = allStacks.includes(stored) ? stored
                 : allStacks.includes(current) ? current
                 : allStacks[0];
    el.value = target;

    const previewEl = ensurePreview(el, pickerId);

    const onChange = ()=>handleChange(el, pickerId, previewEl);
    if (!el.__raUnifiedFontBound){
      el.addEventListener('change', onChange);
      el.addEventListener('input', onChange);
      el.__raUnifiedFontBound = true;
    }

    // Initial apply
    previewEl.style.fontFamily = el.value;
    applySelectionToCanvas(el.value, pickerId);
  }

  function apply(){
    injectGoogleOnce();
    PICKER_IDS.forEach(id=>{
      const el=document.getElementById(id);
      if (!el) return;
      // If some earlier script already tagged it, ignore (or remove that script)
      if (el.__raUnifiedFontPicker) return;
      if (el.tagName.toLowerCase()!=='select') return;
      el.__raUnifiedFontPicker = true;
      rebuildSelect(el, id);
    });
  }

  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  } else {
    apply();
  }
  new MutationObserver(apply).observe(document.documentElement,{childList:true, subtree:true});
})();

/* (REMOVED) RA_MAKE_VIDEO_TOKEN_ONLY_V1
   The entire token-only video panel and export logic is obsolete and removed.
   If you ever want to reintroduce token-only video, add it as a mode in your unified animation/export pipeline.
   Last removed on 2025-09-27.
*/


(() => {
  if (window.raAnimateUnifiedV2 && window.raAnimateUnifiedV2.version === '2.0.2') return;

  const VERSION = '2.0.2';
  const CONFIG = {
    fps: 30,
    maxDurationSec: 30,
    defaultReturnMode: 'soft',
    defaultWmMode: 'inherit',
    softFraction: 0.18,
    softMinMs: 140,
    reverseFraction: 0.35,
    holdFraction: 0.25,
    snapFrames: 10,
    tailFlushFrames: 5,
    respectViewport: true,
    cameraMaxZoom: 2.0,
    wmSnapshotMultiplier: 1.0,
    wmOpacityFloor: 0.02,
    exportHeaderPattern: /export/i,
    autoDownloadOnExport: true // NEW: auto-trigger download after export finishes
  };

  /* -------------------- EASING -------------------- */
  const EASE = {
    linear: t=>t,
    ioQuad: t=>t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2,
    ioSine: t=>-(Math.cos(Math.PI*t)-1)/2,
    ioCubic: t=>t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,
    ioBack: t=>{
      const c1=1.70158,c2=c1*1.525;
      return t<0.5?
        (Math.pow(2*t,2)*((c2+1)*2*t-c2))/2:
        (Math.pow(2*t-2,2)*((c2+1)*(2*t-2)+c2)+2)/2;
    },
    ioExpo: t=>t===0?0:t===1?1:(t<0.5?Math.pow(2,20*t-10)/2:(2-Math.pow(2,-20*t+10))/2)
  };

  /* -------------------- PRESETS (unchanged) -------------------- */
  const PRESETS = [
    { id:'cam_kb_in_ur', name:'KB in ↗', kind:'camera', ease:'ioSine', from:{z:1,x:0,y:0}, to:{z:1.18,x:-0.06,y:+0.06}},
    { id:'cam_kb_in_dl', name:'KB in ↙', kind:'camera', ease:'ioSine', from:{z:1,x:0,y:0}, to:{z:1.18,x:+0.06,y:-0.06}},
    { id:'cam_kb_in_ul', name:'KB in ↖', kind:'camera', ease:'ioSine', from:{z:1,x:0,y:0}, to:{z:1.18,x:+0.06,y:+0.06}},
    { id:'cam_kb_in_dr', name:'KB in ↘', kind:'camera', ease:'ioSine', from:{z:1,x:0,y:0}, to:{z:1.18,x:-0.06,y:-0.06}},
    { id:'cam_kb_out',   name:'KB out',   kind:'camera', ease:'ioSine', from:{z:1.15,x:0,y:0}, to:{z:1.00,x:0,y:0}},
    { id:'cam_pan_up',   name:'Pan up',   kind:'camera', ease:'ioQuad', from:{z:1,x:0,y:0.06}, to:{z:1,x:0,y:-0.06}},
    { id:'cam_pan_down', name:'Pan down', kind:'camera', ease:'ioQuad', from:{z:1,x:0,y:-0.06},to:{z:1,x:0,y:0.06}},
    { id:'cam_pan_left', name:'Pan left', kind:'camera', ease:'ioQuad', from:{z:1,x:0.06,y:0}, to:{z:1,x:-0.06,y:0}},
    { id:'cam_pan_right',name:'Pan right',kind:'camera', ease:'ioQuad', from:{z:1,x:-0.06,y:0},to:{z:1,x:0.06,y:0}},
    { id:'cam_zoom_in',  name:'Zoom in',  kind:'camera', ease:'ioCubic',from:{z:1,x:0,y:0},   to:{z:1.15,x:0,y:0}},
    { id:'cam_zoom_out', name:'Zoom out', kind:'camera', ease:'ioCubic',from:{z:1.12,x:0,y:0}, to:{z:1.00,x:0,y:0}},
    { id:'base_nudge',    name:'Base nudge in', kind:'base', ease:'ioSine', from:{s:1.00}, to:{s:1.06}},
    { id:'base_pulse',    name:'Base pulse',    kind:'base', ease:'ioSine', from:{s:0.97}, to:{s:1.00}},
    { id:'base_zoom_in',  name:'Base zoom in',  kind:'base', ease:'ioCubic',from:{s:1.00}, to:{s:1.12}},
    { id:'base_zoom_out', name:'Base zoom out', kind:'base', ease:'ioCubic',from:{s:1.08}, to:{s:1.00}},
    { id:'base_slide_r',  name:'Base slide →',  kind:'base', ease:'ioSine', from:{dxN:-0.06}, to:{dxN:0}},
    { id:'base_slide_l',  name:'Base slide ←',  kind:'base', ease:'ioSine', from:{dxN:0.06},  to:{dxN:0}},
    { id:'base_tilt',     name:'Base tiny tilt',kind:'base', ease:'ioSine', from:{rot:-3},    to:{rot:0}},
    { id:'base_drift',    name:'Base drift diag',kind:'base',ease:'ioSine', from:{dxN:0.04,dyN:-0.04}, to:{dxN:0,dyN:0}},
    { id:'ov_pop',       name:'Overlay/Text pop',        kind:'overlay', ease:'ioBack',  from:{s:0.90},   to:{s:1.00}},
    { id:'ov_pop_big',   name:'Overlay/Text pop big',    kind:'overlay', ease:'ioBack',  from:{s:0.85},   to:{s:1.00}},
    { id:'ov_fade',      name:'Overlay/Text fade in',    kind:'overlay', ease:'ioCubic', from:{alpha:0},  to:{alpha:1}},
    { id:'ov_slide_up',  name:'Overlay/Text slide ↑',    kind:'overlay', ease:'ioSine',  from:{dyN:0.14}, to:{dyN:0}},
    { id:'ov_slide_dn',  name:'Overlay/Text slide ↓',    kind:'overlay', ease:'ioSine',  from:{dyN:-0.14},to:{dyN:0}},
    { id:'ov_slide_l',   name:'Overlay/Text slide ←',    kind:'overlay', ease:'ioSine',  from:{dxN:-0.18},to:{dxN:0}},
    { id:'ov_slide_r',   name:'Overlay/Text slide →',    kind:'overlay', ease:'ioSine',  from:{dxN:0.18}, to:{dxN:0}},
    { id:'ov_wiggle',    name:'Overlay/Text wiggle',     kind:'overlay', ease:'ioSine',  from:{rot:-5},   to:{rot:0}},
    { id:'ov_scale_in',  name:'Overlay/Text scale in',   kind:'overlay', ease:'ioCubic', from:{s:0.8},    to:{s:1.0}},
    { id:'ov_attention', name:'Overlay/Text attention',  kind:'overlay', ease:'ioSine',  from:{s:1.0},    to:{s:1.07}}
  ];

  /* -------------------- DOM HELPERS -------------------- */
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  function anchorPanel(){
    return $$('h3').find(h=> CONFIG.exportHeaderPattern.test((h.textContent||'').trim()))?.parentNode || document.body;
  }

  function buildPanel(){
    let panel=$('#raAnimUnifiedV2Panel');
    if(panel) return panel;
    panel=document.createElement('div');
    panel.id='raAnimUnifiedV2Panel';
    panel.style.cssText='margin:16px 0;padding:14px;border:1px solid #23262c;border-radius:12px;background:#0f1116;color:#e9eaed;font:12px system-ui;position:relative';
    panel.innerHTML=`
      <style>
        #raAnimUnifiedV2Panel button.btn{
          background:#1d2229;
          color:#e9eaed;
          border:1px solid #2c3138;
          padding:8px 18px;
          border-radius:9px;
          cursor:pointer;
          font:12px system-ui;
          font-weight:500;
          letter-spacing:.2px;
          min-height:36px;
        }
        #raAnimUnifiedV2Panel button.btn:hover{background:#272d35}
        #raAnimUnifiedV2Panel select,
        #raAnimUnifiedV2Panel input[type=number]{
          background:#161a21;
          color:#e9eaed;
          border:1px solid #2c3138;
          border-radius:8px;
          padding:7px 10px;
          min-height:36px;
          font:12px system-ui;
        }
        #raAnimUnifiedV2Panel label{display:flex;gap:6px;align-items:center}
        #raAnimUnifiedV2Panel strong{font-size:13px}
        #raAnimUnifiedV2Panel #uaPreviewCanvas,
        #raAnimUnifiedV2Panel #uaVideoOut{box-shadow:0 0 0 1px #1d2025}
        #raAnimUnifiedV2Panel #uaDL a{
          display:inline-block;
          margin-top:8px;
          background:#1d2229;
          padding:8px 14px;
          border-radius:8px;
          border:1px solid #2c3138;
          text-decoration:none;
          color:#d5d8dc;
          font:12px system-ui;
        }
        #raAnimUnifiedV2Panel #uaDL a:hover{background:#272d35}
      </style>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <strong>Unified Animate</strong>
        <span style="opacity:.55">v${VERSION}</span>
        <label>Scope:
          <select id="uaScope">
            <option value="camera">Camera</option>
            <option value="base">Base only</option>
            <option value="overlay">Overlays only</option>
            <option value="text">Text only</option>
          </select>
        </label>
        <label>Preset:
          <select id="uaPreset"></select>
        </label>
        <label>Ease:
          <select id="uaEase">
            <option value="ioSine">ioSine</option>
            <option value="ioQuad">ioQuad</option>
            <option value="ioCubic">ioCubic</option>
            <option value="ioBack">ioBack</option>
            <option value="ioExpo">ioExpo</option>
            <option value="linear">linear</option>
          </select>
        </label>
        <label>Dur:
          <input id="uaDur" type="number" min="2" max="${CONFIG.maxDurationSec}" value="6" step="0.1" style="width:60px">
          s
        </label>
        <label>Return:
          <select id="uaReturn">
            <option value="soft">soft</option>
            <option value="reverse">reverse</option>
            <option value="snap">snap</option>
            <option value="hold">hold</option>
            <option value="none">none</option>
          </select>
        </label>
        <label>WM:
          <select id="uaWMMode">
            <option value="inherit">inherit</option>
            <option value="lock">lock</option>
          </select>
        </label>
        <button id="uaPreview" class="btn">Preview</button>
        <button id="uaExport" class="btn">Export</button>
        <span id="uaMsg" style="opacity:.7"></span>
      </div>
      <canvas id="uaPreviewCanvas" style="display:none;margin-top:10px;max-width:100%;border-radius:8px;background:#000"></canvas>
      <video id="uaVideoOut" style="display:none;margin-top:10px;max-width:100%;border-radius:8px" controls></video>
      <div id="uaDL"></div>
    `;
    anchorPanel().appendChild(panel);

    const presetSel=$('#uaPreset');
    PRESETS.forEach(p=>{
      const o=document.createElement('option');
      o.value=p.id; o.textContent=p.name;
      presetSel.appendChild(o);
    });

    $('#uaReturn').value=CONFIG.defaultReturnMode;
    $('#uaWMMode').value=CONFIG.defaultWmMode;

    $('#uaScope').addEventListener('change', ()=>{
      const sc=$('#uaScope').value;
      const first = PRESETS.find(p=>{
        if (sc==='camera') return p.kind==='camera';
        if (sc==='base') return p.kind==='base';
        if (sc==='overlay') return p.kind==='overlay';
        if (sc==='text') return p.kind==='overlay';
      });
      if (first) $('#uaPreset').value=first.id;
    });

    $('#uaPreview').onclick=()=>API.preview();
    $('#uaExport').onclick=()=>API.export();

    return panel;
  }

  function showMsg(t){
    const m=$('#uaMsg'); if(!m) return;
    m.textContent=t||'';
    if (t) setTimeout(()=>{ if(m.textContent===t) m.textContent=''; },2500);
  }

  
  const WM = {
    is(o){ return !!(o && (false||false||false||o._rabrandbar)); },
    collect(){
      const c=window.canvas; if(!c) return [];
      return (c.getObjects()||[]).filter(WM.is);
    },
    snapshot:null,
    prepare(mode){
      const wmObjs=WM.collect();
      if (mode==='inherit' || !wmObjs.length)
        return { wmObjs, restores:[] };
      const c=window.canvas;
      const restores=wmObjs.map(o=>({
        o, vis:o.visible, excl:o.excludeFromExport, op:o.opacity
      }));
      wmObjs.forEach(o=>{
        if (o.excludeFromExport) o.excludeFromExport=false;
        if (!o.visible) o.visible=true;
        if (o.opacity===0) o.opacity=CONFIG.wmOpacityFloor;
      });
      const data=c.toDataURL({format:'png', enableRetinaScaling:true, multiplier:CONFIG.wmSnapshotMultiplier});
      const img=new Image(); img.src=data;
      WM.snapshot=img;
      wmObjs.forEach(o=> o.visible=false);
      c.requestRenderAll();
      return { wmObjs, restores };
    },
    restore(restores, mode){
      if (mode==='lock'){
        restores.forEach(r=>{
          r.o.visible=r.vis;
          r.o.excludeFromExport=r.excl;
            r.o.opacity=r.op;
        });
      }
      WM.snapshot=null;
    },
    drawLocked(ctx,W,H){
      if (!WM.snapshot) return;
      ctx.save();
      ctx.globalAlpha=1;
      ctx.drawImage(WM.snapshot,0,0,W,H);
      ctx.restore();
    }
  };

  /* -------------------- Classifiers -------------------- */
  const isBg=o=>!!o?._isBgRect;
  const isBase=o=>!!(o?._isBase && !o._isBgRect);
  const isText=o=>{
    if(!o) return false;
    const k=(o._kind||'').toLowerCase(), t=(o.type||'').toLowerCase();
    return k==='customtext'||k==='tokenid'||t==='textbox'||t==='i-text'||t==='text';
  };
  const isOverlay=o=>{
    if(!o) return false;
    if (o._raSys || WM.is(o) || o._isBgRect || o._isBase || o._raTokenId) return false;
    const k=(o._kind||'').toLowerCase();
    if (k==='overlay'||k==='sticker'||k==='icon') return true;
    if (o.type==='group'){
      const kids=(o.getObjects?.()||o._objects||[]);
      return kids.some(ch=>{
        const ck=(ch._kind||'').toLowerCase();
        return ck==='overlay'||ck==='sticker'||ck==='icon';
      });
    }
    if (o.type==='image' && !o._isBase) return true;
    return false;
  };
  function pickTargets(scope){
    const c=window.canvas; if(!c) return [];
    const objs=(c.getObjects()||[]).filter(o=>!isBg(o));
    if (scope==='base') return objs.filter(isBase);
    if (scope==='overlay') return objs.filter(isOverlay);
    if (scope==='text') return objs.filter(isText);
    return [];
  }

  /* -------------------- Return Plan -------------------- */
  function planReturn(mode,durMs){
    if (mode==='none') return {mode,reverse:0,snap:0,hold:0,soft:0};
    if (mode==='reverse') return {mode,reverse:Math.round(durMs*CONFIG.reverseFraction),snap:0,hold:0,soft:0};
    if (mode==='snap') return {mode,reverse:0,snap:CONFIG.snapFrames,hold:0,soft:0};
    if (mode==='hold') return {mode,reverse:0,snap:CONFIG.snapFrames,hold:Math.round(durMs*CONFIG.holdFraction),soft:0};
    if (mode==='soft'){
      const soft=Math.max(CONFIG.softMinMs, Math.round(durMs*CONFIG.softFraction));
      return {mode,reverse:soft,snap:0,hold:0,soft};
    }
    return {mode:'none',reverse:0,snap:0,hold:0,soft:0};
  }

  /* -------------------- Animation Core -------------------- */
  let running=false, cancelFlag=false;

  function animate({scope,preset,easingFn,durationMs,record,returnMode,wmMode}){
    const c=window.canvas;
    const W=c.getWidth(), H=c.getHeight();
    const previewCanvas=$('#uaPreviewCanvas');
    const videoOut=$('#uaVideoOut');
    const dl=$('#uaDL');

    if (!record){
      previewCanvas.style.display='block';
      videoOut.style.display='none';
      dl.innerHTML='';
    } else {
      previewCanvas.style.display='none';
      videoOut.style.display='none';
      dl.innerHTML='';
    }

    const surface = record? document.createElement('canvas') : previewCanvas;
    surface.width=W; surface.height=H;
    const ctx=surface.getContext('2d');
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';

    const wmState=WM.prepare(wmMode);

    const vt0=(c.viewportTransform||[1,0,0,1,0,0]).slice();
    const baseScale0=vt0[0]; const baseE0=vt0[4]; const baseF0=vt0[5];

    const targets = scope==='camera'?[]:pickTargets(scope);
    if (scope!=='camera' && targets.length===0){
      showMsg('No targets');
      WM.restore(wmState.restores, wmMode);
      return;
    }

    const baselines=new Map();
    targets.forEach(o=>{
      baselines.set(o,{
        left:o.left, top:o.top,
        scaleX:o.scaleX, scaleY:o.scaleY,
        angle:o.angle||0, opacity:o.opacity==null?1:o.opacity
      });
    });

    const ret=planReturn(returnMode,durationMs);

    let rec=null,chunks=[];
    if (record){
      try{
        const stream=surface.captureStream(CONFIG.fps);
        const mime=pickMimeType();
        rec=new MediaRecorder(stream,{mimeType:mime});
        rec.ondataavailable=e=>{ if(e.data&&e.data.size) chunks.push(e.data); };
        rec.start();
      }catch(_){}
    }

    const start=performance.now();
    running=true; cancelFlag=false;
    showMsg(record?'Recording…':'Animating…');

    function phase(now){
      const elapsed=now-start;
      if (elapsed<=durationMs) return {ph:'forward',p:elapsed/durationMs};
      let t=elapsed-durationMs;
      if (ret.soft){
        if (t<=ret.soft) return {ph:'reverse',p:t/ret.soft};
        t-=ret.soft;
      } else if (ret.reverse){
        if (t<=ret.reverse) return {ph:'reverse',p:t/ret.reverse};
        t-=ret.reverse;
      }
      if (ret.snap){
        const span=ret.snap*(1000/CONFIG.fps);
        if (t<=span) return {ph:'snap',p:0};
        t-=span;
      }
      if (ret.hold){
        if (t<=ret.hold) return {ph:'hold',p:0};
        t-=ret.hold;
      }
      const tailSpan=CONFIG.tailFlushFrames*(1000/CONFIG.fps);
      if (t<=tailSpan) return {ph:'tail',p:1};
      return {ph:'done',p:1};
    }

    function applyCamera(tFrac, reverse){
      const f=preset.from,to=preset.to;
      const t=easingFn(tFrac);
      const z=clamp( lerp(f.z,to.z, reverse?1-t:t), 0.01, CONFIG.cameraMaxZoom);
      const xn=lerp(f.x,to.x, reverse?1-t:t);
      const yn=lerp(f.y,to.y, reverse?1-t:t);
      if (CONFIG.respectViewport){
        const eCam=(1 - z)*(W/2) + xn*W;
        const fCam=(1 - z)*(H/2) + yn*H;
        const finalScale=baseScale0*z;
        const finalE=baseE0 + eCam*baseScale0;
        const finalF=baseF0 + fCam*baseScale0;
        c.setViewportTransform([finalScale,0,0,finalScale,finalE,finalF]);
      } else {
        const e=(1 - z)*(W/2) + xn*W;
        const f2=(1 - z)*(H/2) + yn*H;
        c.setViewportTransform([z,0,0,z,e,f2]);
      }
    }

    function applyObjects(tFrac, reverse){
      const p=preset;
      const has=k=>p.from[k]!=null && p.to[k]!=null;
      const fwd=k=>lerp(p.from[k],p.to[k],tFrac);
      const rev=k=>lerp(p.to[k],p.from[k],tFrac);
      const val=k=>has(k)?(reverse?rev(k):fwd(k)):(k==='s'?1:0);

      const s=val('s');
      const rot=val('rot');
      const alpha=has('alpha')?val('alpha'):null;
      const dxN=val('dxN'), dyN=val('dyN');
      const dx=val('dx'), dy=val('dy');
      const dpx= dx + dxN*W;
      const dpy= dy + dyN*H;

      targets.forEach(o=>{
        const b=baselines.get(o); if(!b) return;
        const cw=o.getScaledWidth(), ch=o.getScaledHeight();
        const cx=b.left+cw/2, cy=b.top+ch/2;
        o.scaleX=b.scaleX*s;
        o.scaleY=b.scaleY*s;
        const nw=o.getScaledWidth(), nh=o.getScaledHeight();
        o.left=cx - nw/2 + dpx;
        o.top =cy - nh/2 + dpy;
        if (has('rot')) o.angle=b.angle+rot;
        if (alpha!=null) o.opacity=alpha*b.opacity;
        o.setCoords?.();
      });
    }

    function restoreAll(){
      if (scope==='camera') c.setViewportTransform(vt0.slice());
      else targets.forEach(o=>{
        const b=baselines.get(o); if(!b) return;
        o.left=b.left; o.top=b.top;
        o.scaleX=b.scaleX; o.scaleY=b.scaleY;
        o.angle=b.angle; o.opacity=b.opacity;
        o.setCoords?.();
      });
      c.requestRenderAll();
    }

    function drawFrame(){
      c.requestRenderAll();
      ctx.clearRect(0,0,W,H);
      ctx.drawImage(c.lowerCanvasEl || c.upperCanvasEl,0,0,W,H);
      if (wmMode==='lock') WM.drawLocked(ctx,W,H);
    }

    function step(){
      if (cancelFlag){ finalize(true); return; }
      const now=performance.now();
      const ph=phase(now);
      if (ph.ph==='forward'){
        const e=easingFn(ph.p);
        scope==='camera'?applyCamera(e,false):applyObjects(e,false);
        drawFrame();
      } else if (ph.ph==='reverse'){
        const e=easingFn(ph.p);
        scope==='camera'?applyCamera(e,true):applyObjects(e,true);
        drawFrame();
      } else if (['snap','hold','tail'].includes(ph.ph)){
        restoreAll();
        drawFrame();
      } else {
        restoreAll();
        drawFrame();
        finalize(false);
        return;
      }
      requestAnimationFrame(step);
    }

    function finalize(aborted){
      restoreAll();
      WM.restore(wmState.restores, wmMode);
      if (rec){
        try{
          rec.onstop=()=>{
            const mime=rec.mimeType||'video/webm';
            if(!aborted){
              const blob=new Blob(chunks,{type:mime});
              const url=URL.createObjectURL(blob);
              const ext=mime.includes('mp4')?'mp4':'webm';

              // Always show video + link (original behavior)
              const videoOut=$('#uaVideoOut');
              videoOut.style.display='block';
              videoOut.src=url;
              videoOut.play?.().catch(()=>{});

              const dl=$('#uaDL');
              dl.innerHTML='';
              const a=document.createElement('a');
              a.href=url;
              a.download=`anim_${Date.now()}.${ext}`;
              a.textContent='Download animation';
              dl.appendChild(a);

              // Auto-download if enabled
              if (CONFIG.autoDownloadOnExport){
                try{
                  const auto=document.createElement('a');
                  auto.href=url;
                  auto.download=`anim_${Date.now()}.${ext}`;
                  document.body.appendChild(auto);
                  auto.click();
                  setTimeout(()=>auto.remove(),0);
                }catch(_){}
              }
            }
            running=false; cancelFlag=false;
            showMsg(aborted?'Canceled':'Done');
          };
          rec.stop();
        }catch(_){
          running=false; cancelFlag=false;
          showMsg(aborted?'Canceled':'Done');
        }
      } else {
        running=false; cancelFlag=false;
        showMsg(aborted?'Canceled':'Done');
      }
    }

    step();
  }

 /* -------------------- Utilities -------------------- */
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function pickMimeType(){
  const pref=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
  if (typeof MediaRecorder==='undefined' || !MediaRecorder.isTypeSupported) return pref[2];
  for (const p of pref){ if (MediaRecorder.isTypeSupported(p)) return p; }
  return pref[2];
}

function gather(){
  buildPanel();
  const scope=$('#uaScope').value;
  const presetId=$('#uaPreset').value;
  const preset=PRESETS.find(p=>p.id===presetId) ||
    PRESETS.find(p=> (scope==='camera'?p.kind==='camera': scope==='base'?p.kind==='base':'overlay')) ||
    PRESETS[0];
  const easeSel=$('#uaEase').value;
  const easingFn=EASE[easeSel] || EASE[preset.ease] || EASE.ioSine;
  let dur=parseFloat($('#uaDur').value||'6');
  if(!Number.isFinite(dur)) dur=6;
  dur=clamp(dur,2,CONFIG.maxDurationSec);
  const durationMs=Math.round(dur*1000);
  const returnMode=$('#uaReturn').value;
  const wmMode=$('#uaWMMode').value;
  return { scope, preset, easingFn, durationMs, returnMode, wmMode };
}

function preview(){
  if (running){ showMsg('Busy'); return; }
  animate({ ...gather(), record:false });
}
function exportAnim(){
  if (running){ showMsg('Busy'); return; }
  animate({ ...gather(), record:true });
}
function stop(){
  if (!running) return;
  cancelFlag=true;
}

const API = {
  preview,
  export: exportAnim,
  stop,
  config: CONFIG,
  version: VERSION
};
window.raAnimateUnifiedV2 = API;

function init(){ buildPanel(); }
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init,{once:true});
else init();

})();


(() => {
  if (window.__RA_UNDO_SAFE_V1B__) return;
  window.__RA_UNDO_SAFE_V1B__ = true;

  const MAX = 60;
  const DRAFT_KEY = 'ra_draft_v1';
  const COALESCE_MS = 120;          // broader window & resets on each event
  const AUTO_CLEAR_ON_BASE_SWAP = true;

  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const defer = (fn, ms=0)=>setTimeout(fn, ms);

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }
  let c;

  let history = [];
  let idx = -1;
  let burstTimer = null;
  let lastBaseSignature = null;

  // Guard flags
  let MUTE = 0;
  const isMuted = () => MUTE > 0;

  // Active object tracking (injection of stable ids)
  let nextHistId = 1;
  function ensureId(o){
    if (!o) return;
    if (!o._histId) o._histId = 'H'+(nextHistId++);
  }

  const EXTRA = [
    '_kind','_isBase','_isBgRect','raWM','raPos',
    '_histId','_raSys','_raTokenId','false','false','false','_rabrandbar',
    'selectable','evented','hasControls',
    'lockMovementX','lockMovementY','lockScalingX','lockScalingY','lockRotation',
    'globalCompositeOperation','opacity','flipX','flipY'
  ];

  function snapshotBaseSignature(){
    if (!c) return '';
    const base = (c.getObjects()||[]).find(o=>o && o._isBase);
    if (!base) return '';
    // use src or top-left dimension hash
    const src = base.getSrc && base.getSrc();
    return `${base.type}:${base.width}x${base.height}:${src||''}`;
  }

  function serialize(){
    if (!c || isMuted()) return null;
    (c.getObjects()||[]).forEach(ensureId);
    const j = c.toJSON(EXTRA);
    j.__w  = c.getWidth();
    j.__h  = c.getHeight();
    j.__vt = c.viewportTransform || [1,0,0,1,0,0];
    // store active object id if exists
    const active = c.getActiveObject && c.getActiveObject();
    j.__active = active && active._histId ? active._histId : null;
    return JSON.stringify(j);
  }

  function restore(jsonStr, label=''){
    if (!c || !jsonStr) return;
    MUTE++;
    window.__RA_RESTORING__ = true;
    try {
      const data = JSON.parse(jsonStr);
      c.loadFromJSON(data, () => {
        try {
          if (data.__w && data.__h){ c.setWidth(data.__w); c.setHeight(data.__h); }
          if (Array.isArray(data.__vt)) c.setViewportTransform(data.__vt);

          c.getObjects().forEach(o=>{
            ensureId(o);
            if (o._isBase){
              o.selectable=false; o.evented=false; o.hasControls=false;
              o.lockMovementX=o.lockMovementY=o.lockScalingX=o.lockScalingY=o.lockRotation=true;
            }
            if (o._isBgRect || o._raSys){
              o.selectable=false; o.evented=false;
            }
          });

          // Try to reselect previous active object
          if (data.__active){
            const target = c.getObjects().find(o => o._histId === data.__active);
            if (target) c.setActiveObject(target);
          }

          try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
          // Legacy hook removed
          try { /* no-op */ } catch(_){}

          c.requestRenderAll();
        } finally {
          MUTE--;
          window.__RA_RESTORING__ = false;
          refresh(label);
        }
      });
    } catch(e){
      MUTE--;
      window.__RA_RESTORING__ = false;
      refresh(label);
    }
  }

  function push(label=''){
    const s = serialize(); if (!s) return;
    // Base swap auto-clear (optional)
    if (AUTO_CLEAR_ON_BASE_SWAP){
      const sig = snapshotBaseSignature();
      if (lastBaseSignature && sig && sig !== lastBaseSignature){
        // new base encountered: start fresh
        history = [];
        idx = -1;
      }
      lastBaseSignature = sig;
    }

    // If we undid into the middle, cut tail
    if (idx < history.length - 1) history = history.slice(0, idx + 1);
    if (history[idx] === s){ refresh(label); return; }

    history.push(s);
    if (history.length > MAX){
      history.shift();
    }
    idx = history.length - 1;
    refresh(label);
  }

  function undo(){ if (idx <= 0) return; idx -= 1; restore(history[idx], 'Undo'); }
  function redo(){ if (idx >= history.length - 1) return; idx += 1; restore(history[idx], 'Redo'); }

  // Public API
  function canUndo(){ return idx > 0; }
  function canRedo(){ return idx >= 0 && idx < history.length - 1; }
  function forceSnapshot(label='Manual'){ push(label); }
  function clearHistory(msg='Cleared'){ history=[]; idx=-1; refresh(msg); }

  window.raHistory = {
    undo, redo, push:forceSnapshot,
    canUndo, canRedo,
    clear: clearHistory,
    length: () => history.length,
    index: () => idx
  };

  // ---------- UI ----------
  let ui = {};
  function ensureUI(){
    const existing = {
      undo: $('#raUndoBtn'),
      redo: $('#raRedoBtn'),
      save: $('#raSaveDraftBtn'),
      load: $('#raLoadDraftBtn'),
      clr : $('#raClearDraftBtn'),
      info: $('#raHistInfo')
    };
    if (existing.undo || existing.redo){
      ui = existing;
      if (ui.undo) ui.undo.onclick = undo;
      if (ui.redo) ui.redo.onclick = redo;
      if (ui.save) ui.save.onclick = saveDraft;
      if (ui.load) ui.load.onclick = restoreDraft;
      if (ui.clr)  ui.clr.onclick  = ()=>{ localStorage.removeItem(DRAFT_KEY); refresh('Draft cleared'); };
      return;
    }

    const holder =
      $$('h3').find(h => /selection/i.test((h.textContent||'').trim()))?.parentNode
      || document.body;

    const row = document.createElement('div');
    row.id = 'raHistoryRow';
    row.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center';

    const mk = (id, txt)=>{ const b=document.createElement('button'); b.id=id; b.textContent=txt; b.className='btn small'; return b; };
    const undoB = mk('raUndoBtn','Undo (0)');
    const redoB = mk('raRedoBtn','Redo (0)');
    const saveB = mk('raSaveDraftBtn','Save Draft');
    const loadB = mk('raLoadDraftBtn','Restore Draft');
    const clrB  = mk('raClearDraftBtn','×');
    const info = document.createElement('div');
    info.id='raHistInfo'; info.style.cssText='font-size:11px;opacity:.65';

    row.append(undoB, redoB, saveB, loadB, clrB, info);
    holder.appendChild(row);
    ui = {undo:undoB, redo:redoB, save:saveB, load:loadB, clr:clrB, info};

    undoB.onclick = undo;
    redoB.onclick = redo;
    saveB.onclick = saveDraft;
    loadB.onclick = restoreDraft;
    clrB.onclick  = ()=>{ localStorage.removeItem(DRAFT_KEY); refresh('Draft cleared'); };
  }

  function refresh(msg=''){
    ensureUI();
    const stepsBack = idx;                        // # undo steps available
    const stepsForward = history.length - 1 - idx;
    if (ui.undo) ui.undo.disabled = stepsBack <= 0;
    if (ui.redo) ui.redo.disabled = stepsForward <= 0;
    if (ui.load) ui.load.disabled = !localStorage.getItem(DRAFT_KEY);

    if (ui.undo) ui.undo.textContent = `Undo (${stepsBack})`;
    if (ui.redo) ui.redo.textContent = `Redo (${stepsForward})`;
    if (ui.info) ui.info.textContent = `History ${idx + 1} / ${history.length}${msg ? ' • ' + msg : ''}`;
  }

  // Draft Save/Restore
  function saveDraft(){
    if (idx>=0){
      try {
        localStorage.setItem(DRAFT_KEY, history[idx]);
        refresh('Draft saved');
      } catch(_){
        refresh('Draft failed');
      }
    }
  }
  function restoreDraft(){
    const j = localStorage.getItem(DRAFT_KEY);
    if (!j) return refresh('No draft');
    history = [j]; idx=0;
    restore(j, 'Draft restored');
  }

  // Burst coalescing (resets timer each new qualifying event)
  function schedulePush(label){
    if (isMuted()) return;
    if (burstTimer) clearTimeout(burstTimer);
    burstTimer = setTimeout(()=>{
      burstTimer=null;
      push(label);
    }, COALESCE_MS);
  }

  function isUserObject(o){
    if (!o) return false;

    if (o._isBgRect || o._isBase || o._raSys || o._raTokenId) return false;
    if (false || false || false || o._rabrandbar) return false;
    return true;
  }

  function wire(){
    c = C(); if (!c) return defer(wire, 120);
    ensureUI();

    // Baseline snapshot after initial asynchronous setup
    defer(()=>{ push('Init'); }, 180);

    c.on('object:modified', e=>{
      if (isUserObject(e?.target)) schedulePush('Edit');
    });
    c.on('object:added', e=>{
      if (isUserObject(e?.target)) schedulePush('Add');
    });
    c.on('object:removed', e=>{
      if (isUserObject(e?.target)) schedulePush('Remove');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e)=>{
      const tag=(e.target&&e.target.tagName||'').toLowerCase();
      if (/^(input|textarea|select)$/.test(tag) || e.target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey||e.ctrlKey) && key==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
      else if (((e.metaKey||e.ctrlKey) && key==='z' && e.shiftKey) ||
               ((e.metaKey||e.ctrlKey) && key==='y')){ e.preventDefault(); redo(); }
    });

    // Canvas size dropdown
    const sizeEl = document.getElementById('canvasSize');
    if (sizeEl && !sizeEl.__raHistBound){
      sizeEl.__raHistBound = true;
      sizeEl.addEventListener('change', ()=> schedulePush('Resize'));
    }

    refresh('Ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, {once:true});
  } else {
    wire();
  }
})();

/* ================= RA_DISABLE_FIXED_CANVAS_ON_MOBILE_v1 =================
   Neutralizes RA_FIXED_CENTER_CANVAS_V1 on mobile only.
   - Reverts "position:fixed" styles on the canvas card.
   - Removes #raCanvasGhost spacer that causes the mid‑page blank gap.
   - Desktop unaffected.
   ======================================================================= */
(() => {
  const MQ = '(max-width: 920px)';
  if (!window.matchMedia(MQ).matches) return;

  function getCanvasCard(){
    const c = document.getElementById('c');
    if (!c) return null;
    return c.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper') || c.parentElement;
  }

  function unfix(){
    const card  = getCanvasCard();
    const ghost = document.getElementById('raCanvasGhost');

    if (ghost){
      ghost.remove(); // this is the big blank spacer
    }
    if (card){
      Object.assign(card.style, {
        position:'', zIndex:'', margin:'', left:'', top:'', right:'', transform:'', width:''
      });
      // mark so the desktop fixer (if any) won’t reapply while on mobile
      card.setAttribute('data-ra-mobile-inflow','1');
    }
  }

  function run(){ if (window.matchMedia(MQ).matches) unfix(); }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run, {once:true});
  } else {
    run();
  }
  window.addEventListener('resize',           run, {passive:true});
  window.addEventListener('orientationchange',() => setTimeout(run, 100), {passive:true});
})();


(() => {
  if (window.__RA_FIX_RECENTER_V1__) return;
  window.__RA_FIX_RECENTER_V1__ = true;

  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function centerIfMoved(o){
    const c = C(); if (!c || !o) return;
    if (o.type !== 'group') return;
    // Only care about our base group or overlay groups created by the builder.
    if (!o._isBase && o._kind !== 'overlay') return;

    const cw = c.getWidth(), ch = c.getHeight();
    const cp = (typeof o.getCenterPoint === 'function')
      ? o.getCenterPoint()
      : new fabric.Point(o.left || 0, o.top || 0);

    // If center drifted by more than a few pixels, put it back in the middle.
    if (Math.abs(cp.x - cw/2) > 4 || Math.abs(cp.y - ch/2) > 4){
      try{
        o.set({ originX: 'center', originY: 'center' });
        if (o.setPositionByOrigin) {
          o.setPositionByOrigin(new fabric.Point(cw/2, ch/2), 'center', 'center');
        } else {
          o.left = cw/2; o.top = ch/2;
        }
        o.setCoords();
        c.requestRenderAll();
      }catch(_){}
    }
  }

  function fixExisting(){
    const c = C(); if (!c) return;
    (c.getObjects() || []).forEach(centerIfMoved);
  }

  function wire(){
    const c = C(); if (!c) { setTimeout(wire, 120); return; }

    // Correct anything already on the canvas (e.g., immediately after an upload)
    setTimeout(fixExisting, 30);

    // After any object is added, correct the center once the other listener strips stamps.
    if (!c.__raFixRecenterBound){
      c.__raFixRecenterBound = true;
      c.on('object:added', (e) => {
        const t = e && e.target;
        if (!t) return;
        // Defer to allow the stamp-stripper to finish, then re-center if needed.
        setTimeout(() => centerIfMoved(t), 0);
      });
    }

    // If the canvas element resizes, keep the base centered.
    try {
      const el = c.getElement ? c.getElement() : (c.wrapperEl || c.upperCanvasEl);
      new ResizeObserver(() => setTimeout(fixExisting, 0)).observe(el);
    } catch(_){}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
})();

/* ==========================================================
   RA_ADMIN_OVERLAYS_LIVE_V2
   - Live refresh of "Published Overlays" after Publish.
   - Admin-only delete (×) on published tiles.
   - No changes to non-admin users.
   ========================================================== */
(() => {
  if (window.__RA_ADMIN_OVERLAYS_LIVE_V2__) return;
  window.__RA_ADMIN_OVERLAYS_LIVE_V2__ = true;

  const KEY = 'ra2_published';
  const isAdmin = /\badmin=1\b/i.test(location.search);

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function getShelf(){
    try { return JSON.parse((localStorage||sessionStorage).getItem(KEY) || '[]'); }
    catch(_) { return []; }
  }
  function setShelf(arr){
    try { (localStorage||sessionStorage).setItem(KEY, JSON.stringify(arr||[])); } catch(_){}
  }

  // Minimal overlay adder (in case we rebuild the grid ourselves)
  function addOverlayFromDataURL(dataURL){
    try{
      const c = window.canvas; if (!c || !window.fabric) return;
      fabric.Image.fromURL(dataURL, img => {
        const cw=c.getWidth(), ch=c.getHeight();
        img.set({ originX:'center', originY:'center' });
        const maxDim = Math.min(cw, ch) * 0.60;
        const iw = img.width||maxDim, ih = img.height||maxDim;
        const sc = Math.min(1, maxDim / Math.max(iw, ih));
        if (isFinite(sc) && sc>0) img.scale(sc);
        img._kind = 'overlay';
        c.add(img);
        img.set({ left:cw/2, top:ch/2 }); img.setCoords();
        c.setActiveObject(img);
        try { window.bringInterfaceToFront && window.bringInterfaceToFront(); } catch(_){}
        c.requestRenderAll();
      }, { crossOrigin:'anonymous' });
    }catch(_){}
  }

  // Rebuild the Published Overlays grid (safe even if original drawer already ran)
  function drawShelf(){
    const wrap = $('#ra2ShelfGrid');
    if (!wrap) { setTimeout(drawShelf, 200); return; }

    const items = getShelf();
    wrap.innerHTML = '';
    items.forEach((item, idx) => {
      const tile = document.createElement('div');
tile.style.cssText =
  'position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;text-align:center;cursor:pointer;';

const frame = document.createElement('div');
frame.style.cssText = 'height:80px;display:flex;align-items:center;justify-content:center;';
const img = document.createElement('img');
img.src = item.dataURL;
img.alt = item.name || '';
img.style.cssText = 'max-width:100%;max-height:80px;';
frame.appendChild(img);

const cap = document.createElement('div');
cap.style.cssText = 'font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
cap.textContent = item.name || '';

tile.appendChild(frame);
tile.appendChild(cap);

      // Click = add overlay (ignore if clicking the delete button)
      tile.addEventListener('click', (ev) => {
        if (ev.target && ev.target.closest && ev.target.closest('.raDelPub')) return;
        addOverlayFromDataURL(item.dataURL);
      });

      // Admin-only: delete from shelf
      if (isAdmin){
        const del = document.createElement('button');
        del.className = 'raDelPub';
        del.title = 'Remove from Published';
        del.textContent = '×';
        del.style.cssText =
          'position:absolute;top:4px;right:6px;background:#2a2a2e;border:0;color:#ddd;border-radius:6px;padding:2px 6px;cursor:pointer;';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          const arr = getShelf();
          arr.splice(idx, 1);
          setShelf(arr);
          drawShelf();
        });
        tile.appendChild(del);
      }

      wrap.appendChild(tile);
    });
  }

  // After "Publish" in the Admin Overlays dock, refresh shelf immediately.
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('button');
    if (!btn) return;
    const txt = (btn.textContent || '').toLowerCase();
    // The Admin Overlays dock buttons include "Publish"
    if (/^publish$/.test(txt) || /publish/.test(txt)) {
      // Give the original handler a tick to write localStorage, then redraw.
      setTimeout(drawShelf, 50);
    }
  }, true);

  // Keep the shelf in sync if some other code mutates the DOM around it.
  new MutationObserver(() => { /* cheap keep-alive */ }).observe(document.body, { childList:true, subtree:true });

  // Initial render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', drawShelf, { once:true });
  } else {
    drawShelf();
  }
})();

/* ==========================================================
   RA_CURVED_TEXT_V1
   - Curved text for Fabric: toggle on/off + live controls.
   - Integrates with your existing Custom Text controls.
   - Tagged as _kind:'customText' so Animate includes it.
   - Desktop/mobile safe; no layout changes.
   ========================================================== */
(() => {
  if (window.__RA_CURVED_TEXT_V1__) return; window.__RA_CURVED_TEXT_V1__ = true;

  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function styleFromUI(){
    return {
      fontFamily: ($('#fontFamily')||{}).value || "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
      fontSize:   parseInt(($('#fontSize')||{}).value||'48',10),
      fill:       ($('#fontColor')||{}).value || '#ffffff',
      stroke:     ($('#strokeColor')||{}).value || 'transparent',
      strokeWidth:parseInt(($('#strokeWidth')||{}).value||'0',10)
    };
  }

  function isCurved(o){ return !!(o && (o._raCurved || o?.data?.raType==='curvedText')); }
  function plainText(o){
    if (!o) return '';
    if (o.type==='textbox' || o.type==='text') return String(o.text||'');
    if (isCurved(o)) return (o._objects||[]).map(g=>g.text||'').join('');
    return '';
  }

  // Build a curved text group (center-origin)
  function buildCurved(text, opts){
    const c=C(); const cw=c?c.getWidth():700, ch=c?c.getHeight():700, side=Math.min(cw,ch);
    const radius  = Math.round((opts?.radius ?? side*0.35));
    const arc     = (opts?.arc    ?? 180);
    const start   = (opts?.start  ?? 0);
    const spacing = (opts?.spacing?? 0);         // px-ish fudge
    const inward  = !!(opts?.inward);
    const st      = opts?.style || styleFromUI();

    const chars = Array.from(String(text||''));
    const N     = Math.max(chars.length, 1);
    const step  = (N>1 ? arc/(N-1) : 0) + (spacing/Math.max(radius,1))*(180/Math.PI);
    const startDeg = start - arc/2;

    const kids=[];
    for (let i=0;i<N;i++){
      const ch = new fabric.Text(chars[i] || ' ', {
        originX:'center', originY:'center',
        fontFamily: st.fontFamily, fontSize: st.fontSize,
        fill: st.fill, stroke: st.stroke, strokeWidth: st.strokeWidth,
        selectable:false, evented:false
      });
      const ang = (startDeg + i*step) * Math.PI/180;
      ch.left  = radius * Math.cos(ang);
      ch.top   = radius * Math.sin(ang);
      ch.angle = (startDeg + i*step) + (inward ? -90 : 90);
      ch.data  = Object.assign({}, ch.data, { raGlyph:true });
      kids.push(ch);
    }

    const g = new fabric.Group(kids, { originX:'center', originY:'center' });
    g._kind = 'customText';
    g._raCurved = true;
    g.raCurve = { text:String(text||''), radius, arc, start, spacing, inward };
    g.data = Object.assign({}, g.data, { raType:'curvedText', raCurve:g.raCurve });
    return g;
  }

  function replaceObject(newObj, oldObj){
    const c=C(); if(!c) return;
    const ctr = oldObj.getCenterPoint ? oldObj.getCenterPoint() : new fabric.Point(oldObj.left||0, oldObj.top||0);
    newObj.set({ left: ctr.x, top: ctr.y });
    newObj.setCoords();
    c.remove(oldObj); c.add(newObj); c.setActiveObject(newObj); c.requestRenderAll();
  }

  function toCurved(o){
    const st = {
      fontFamily: o.fontFamily || styleFromUI().fontFamily,
      fontSize:   o.fontSize   || styleFromUI().fontSize,
      fill:       o.fill       || styleFromUI().fill,
      stroke:     o.stroke     || styleFromUI().stroke,
      strokeWidth:o.strokeWidth|| styleFromUI().strokeWidth
    };
    const vals = readUI();
    const g = buildCurved(plainText(o), { radius: vals.radius, arc: vals.arc, start: vals.start, spacing: vals.spacing, inward: vals.flip, style: st });
    replaceObject(g, o); reflectUI(g);
  }

  function toLinear(g){
    const c=C(); const s=styleFromUI();
    const tb = new fabric.Textbox(plainText(g), {
      originX:'center', originY:'center',
      width: Math.floor(c.getWidth()*0.8), textAlign:'left',
      fontFamily:s.fontFamily, fontSize:s.fontSize, fill:s.fill, stroke:s.stroke, strokeWidth:s.strokeWidth,
      editable:true
    });
    tb._kind='customText';
    replaceObject(tb, g); reflectUI(tb);
  }

  function updateCurved(g, nextPart){
    if (!isCurved(g)) return g;
    const keep = Object.assign({}, g.raCurve);
    const next = Object.assign(keep, nextPart||{});
    g.raCurve = next; g.data = Object.assign({}, g.data, { raCurve: next });

    const ctr = g.getCenterPoint ? g.getCenterPoint() : new fabric.Point(g.left||0, g.top||0);
    const ang = g.angle||0, sx=g.scaleX||1, sy=g.scaleY||1;
    const st  = styleFromUI();

    const fresh = buildCurved(next.text, {
      radius: next.radius, arc: next.arc, start: next.start, spacing: next.spacing, inward: next.inward,
      style: { fontFamily:st.fontFamily, fontSize:st.fontSize, fill:st.fill, stroke:st.stroke, strokeWidth:st.strokeWidth }
    });
    fresh.set({ left:ctr.x, top:ctr.y, angle:ang, scaleX:sx, scaleY:sy }); fresh.setCoords();

    const c=C(); c.remove(g); c.add(fresh); c.setActiveObject(fresh); c.requestRenderAll();
    return fresh;
  }

  function readUI(){
    const num = (id, d)=>{ const el=$(id); const v=parseFloat(el?.value||''); return Number.isFinite(v)?v:d; };
    const c=C(); const side=c?Math.min(c.getWidth(), c.getHeight()):700;
    return {
      enabled: !!$('#raCurveEnable')?.checked,
      radius:  num('#raCurveRadius', Math.round(side*0.35)),
      arc:     num('#raCurveArc', 180),
      start:   num('#raCurveStart', 0),
      spacing: num('#raCurveSpacing', 0),
      flip:    !!$('#raCurveFlip')?.checked
    };
  }
  function updateLabels(){
    const get=(id,d)=>{ const el=$(id); const v=parseFloat(el?.value||''); return Number.isFinite(v)?v:d; };
    const put=(id,v,s='')=>{ const el=$(id); if(el) el.textContent=String(v)+(s||''); };
    put('#raCurveRadiusVal', Math.round(get('#raCurveRadius',0)));
    put('#raCurveArcVal',    Math.round(get('#raCurveArc',0)), '°');
    put('#raCurveStartVal',  Math.round(get('#raCurveStart',0)), '°');
    put('#raCurveSpacingVal',Math.round(get('#raCurveSpacing',0)));
  }
  function reflectUI(obj){
    const vals = isCurved(obj) ? obj.raCurve : null;
    const set = (id,v)=>{ const el=$(id); if(!el) return; if (typeof v==='boolean') el.checked=v; else el.value=String(v); };
    set('#raCurveEnable', !!vals);
    set('#raCurveRadius', vals ? Math.round(vals.radius) : '');
    set('#raCurveArc',    vals ? Math.round(vals.arc)    : 180);
    set('#raCurveStart',  vals ? Math.round(vals.start)  : 0);
    set('#raCurveSpacing',vals ? Math.round(vals.spacing): 0);
    set('#raCurveFlip',   vals ? !!vals.inward : false);
    updateLabels();
    const txt=$('#customText'); if (txt) txt.value = obj ? plainText(obj) : '';
  }

  function ensureUI(){
    if ($('#raCurveRow')) return;

    const h3 = $$('h3').find(h => /custom\s*text/i.test((h.textContent||'').trim()));
    const card = h3 ? h3.parentNode : null;
    if (!card) return setTimeout(ensureUI, 200);

    const row = document.createElement('div');
    row.id='raCurveRow';
    row.style.cssText='margin-top:8px;padding:8px;border:1px dashed #2a2a2e;border-radius:8px;background:#0d0f14';
    row.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label style="display:flex;gap:6px;align-items:center"><input id="raCurveEnable" type="checkbox"> Curved</label>
        <label style="display:flex;gap:6px;align-items:center">Radius
          <input id="raCurveRadius" type="range" min="40" max="1200" value="240" style="width:150px">
          <span id="raCurveRadiusVal" style="opacity:.7;font-size:12px">240</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center">Arc
          <input id="raCurveArc" type="range" min="20" max="360" value="180" style="width:140px">
          <span id="raCurveArcVal" style="opacity:.7;font-size:12px">180°</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center">Start
          <input id="raCurveStart" type="range" min="-180" max="180" value="0" style="width:140px">
          <span id="raCurveStartVal" style="opacity:.7;font-size:12px">0°</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center">Spacing
          <input id="raCurveSpacing" type="range" min="-50" max="200" value="0" style="width:140px">
          <span id="raCurveSpacingVal" style="opacity:.7;font-size:12px">0</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center"><input id="raCurveFlip" type="checkbox"> Inside</label>
      </div>
    `;
    card.appendChild(row);

    // Change handlers
    const onAny = ()=>{
      updateLabels();
      const c=C(); if(!c) return;
      const o=c.getActiveObject();
      const vals=readUI();

      if (!o){
        // No selection: if Curved enabled and there is text in input, create a new curved text
        if (vals.enabled){
          const t=($('#customText')||{}).value?.trim(); if (!t) return;
          const g = buildCurved(t, { radius:vals.radius, arc:vals.arc, start:vals.start, spacing:vals.spacing, inward:vals.flip, style:styleFromUI() });
          g.set({ left:c.getWidth()/2, top:c.getHeight()/2 }); g.setCoords();
          c.add(g).setActiveObject(g); c.requestRenderAll();
        }
        return;
      }

      if (!isCurved(o)){
        if (vals.enabled && o._kind==='customText'){ toCurved(o); }
        return;
      }

      if (!vals.enabled){ toLinear(o); }
      else {
        updateCurved(o, {
          radius: vals.radius, arc: vals.arc, start: vals.start, spacing: vals.spacing, inward: vals.flip,
          text: plainText(o)
        });
      }
    };

    ['change','input'].forEach(ev=>{
      ['#raCurveEnable','#raCurveRadius','#raCurveArc','#raCurveStart','#raCurveSpacing','#raCurveFlip']
      .forEach(id=>{ const el=$(id); if(el) el.addEventListener(ev, onAny); });
    });

    // Sync UI on selection changes
    const c=C();
    if (c && !c.__raCurveSelBound){
      c.__raCurveSelBound=true;
      c.on('selection:created', e=> reflectUI(e?.selected?.[0]));
      c.on('selection:updated', e=> reflectUI(e?.selected?.[0]||c.getActiveObject()));
      c.on('selection:cleared', ()=> reflectUI(null));
    }

    // Rebuild when text or font controls change
    const bindTextControls = ()=>{
      const txt=$('#customText');
      if (txt && !txt.__raCurveBound){
        const h=()=>{
          const c=C(), o=c?.getActiveObject();
          if (o && isCurved(o)){
            const v=(txt.value||'').replace(/\r?\n/g,' ');
            const fresh = updateCurved(o,{ text:v });
            c.setActiveObject(fresh||o);
          }
        };
        txt.__raCurveBound=true; txt.addEventListener('change',h); txt.addEventListener('input',h);
      }
      [['#fontFamily'],['#fontSize'],['#fontColor'],['#strokeColor'],['#strokeWidth']].forEach(([id])=>{
        const el=$(id); if (!el || el.__raCurveBound) return;
        const h=()=>{ const c=C(), o=c?.getActiveObject(); if (o && isCurved(o)) updateCurved(o, {}); };
        el.__raCurveBound=true; el.addEventListener('change',h); el.addEventListener('input',h);
      });
    };
    bindTextControls();
    new MutationObserver(bindTextControls).observe(document.documentElement, { childList:true, subtree:true });
  }

  function boot(){ if (!C()) return setTimeout(boot,200); ensureUI(); }
  if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', boot, {once:true}); } else { boot(); }
})();

/* ==========================================================
   RA_SMART_GUIDES_ON_TOP_V2
   • Draws guides on Fabric's TOP canvas (contextTop) so they’re above everything.
   • FIX: True canvas center (uses W/2, H/2 correctly).
   • FIX: HiDPI/CSS scaling correct (uses devicePixelRatio/clientWidth mapping).
   • Button now lives in the existing Snap row (away from the “×” button).
   • Auto‑hide after drop; no impact on export or undo/redo.
   ========================================================== */
(() => {
  if (window.__RA_GUIDES_TOP_V2__) return;
  window.__RA_GUIDES_TOP_V2__ = true;

  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const  $ = (s,r=document)=>r.querySelector(s);
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  // ------- options -------
  const S = {
    on: true,
    tol: 12,      // proximity (screen px) to show a guide
    lingerMs: 120 // tiny linger so eyes can register the snap
  };

  // ------- put toggle in your existing "Snap / Selection" row -------
  function placeToggle(){
    const id='raGuidesToggle';
    if ($('#'+id)) return;

    // Prefer your Snap row if present (Center H/V/HV · Snap: On row)
    const snapRow = $('#raSnapRow');
    const holder =
      snapRow ||
      $$('h3').find(h=>/selection/i.test((h.textContent||'').trim()))?.parentNode ||
      document.body;

    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'btn small';
    btn.textContent = 'Guides: On';
    // In the snap row this will sit nicely to the right
    btn.style.marginLeft = snapRow ? 'auto' : '8px';

    btn.onclick = ()=>{
      S.on = !S.on;
      btn.textContent = 'Guides: ' + (S.on ? 'On' : 'Off');
      clearTop();
    };

    holder.appendChild(btn);
  }

  // ------- drawing on Fabric's TOP canvas (always above) -------
  function topCtx(){
    const c=C(); if(!c) return null;
    return (c.getSelectionContext && c.getSelectionContext()) ||
           c.contextTop ||
           (c.upperCanvasEl && c.upperCanvasEl.getContext('2d')) || null;
  }

  function clearTop(){
    const c=C(); const ctx=topCtx(); if(!c||!ctx) return;
    const el=c.upperCanvasEl; if(!el) return;

    const ratio = el.width / Math.max(1, (el.clientWidth||el.width));
    ctx.save();
    // Draw in CSS‑px space so math is easy, but scale to device pixels
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0, el.width/ratio, el.height/ratio);
    ctx.restore();
  }

  function drawLines(lines){
    const c=C(); const ctx=topCtx(); if(!c||!ctx||!lines||!lines.length) return;
    const el=c.upperCanvasEl; if(!el) return;

    const ratio = el.width / Math.max(1, (el.clientWidth||el.width));
    ctx.save();
    // Work in CSS‑px, scale once for HiDPI
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0, el.width/ratio, el.height/ratio);

    lines.forEach(L=>{
      // White halo for contrast
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth   = 6;
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(L.x1, L.y1); ctx.lineTo(L.x2, L.y2); ctx.stroke();

      // Bright core (center=cyan, edge=red)
      ctx.strokeStyle = (L.kind==='edge') ? '#ff4d4d' : '#00e0ff';
      ctx.lineWidth   = 2.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.moveTo(L.x1, L.y1); ctx.lineTo(L.x2, L.y2); ctx.stroke();
    });

    ctx.restore();
  }

  // ------- coordinate helpers (canvas units → CSS‑px) -------
  const vpt = c => (c && c.viewportTransform) || [1,0,0,1,0,0];
  function toCssPx(c,x,y){ const m=vpt(c); return { x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] }; }

  function canvasEdgesCssPx(c){
    const W=c.getWidth(), H=c.getHeight();
    const tl=toCssPx(c,0,0), tr=toCssPx(c,W,0), bl=toCssPx(c,0,H);
    const cc=toCssPx(c,W/2, H/2); // ← FIX: true center (x & y)
    return { left:tl.x, right:tr.x, top:tl.y, bottom:bl.y, cx:cc.x, cy:cc.y };
  }

  function objBoundsCssPx(c,o){
    const br=o.getBoundingRect(true, true); // canvas units, rotation‑aware
    const tl=toCssPx(c, br.left,              br.top);
    const brp=toCssPx(c, br.left+br.width,    br.top+br.height);
    const xMin=Math.min(tl.x, brp.x), xMax=Math.max(tl.x, brp.x);
    const yMin=Math.min(tl.y, brp.y), yMax=Math.max(tl.y, brp.y);
    return { xMin,xMax,yMin,yMax, cx:(xMin+xMax)/2, cy:(yMin+yMax)/2 };
  }

  function guidesFor(c,o){
    const E=canvasEdgesCssPx(c), O=objBoundsCssPx(c,o);
    const near = (a,b)=> Math.abs(a-b) <= S.tol;
    const L=[];
    // centers
    if (near(O.cx,E.cx)) L.push({ x1:E.cx, y1:E.top,    x2:E.cx,    y2:E.bottom, kind:'center' });
    if (near(O.cy,E.cy)) L.push({ x1:E.left, y1:E.cy,    x2:E.right, y2:E.cy,     kind:'center' });
    // edges
    if (near(O.xMin,E.left))   L.push({ x1:E.left,  y1:E.top,    x2:E.left,  y2:E.bottom, kind:'edge' });
    if (near(O.xMax,E.right))  L.push({ x1:E.right, y1:E.top,    x2:E.right, y2:E.bottom, kind:'edge' });
    if (near(O.yMin,E.top))    L.push({ x1:E.left,  y1:E.top,    x2:E.right, y2:E.top,    kind:'edge' });
    if (near(O.yMax,E.bottom)) L.push({ x1:E.left,  y1:E.bottom, x2:E.right, y2:E.bottom, kind:'edge' });
    return L;
  }

  // ------- wire Fabric events -------
  let clearTimer=null;
  function onTransform(e){
    if (!S.on) return;
    const c=C(); if(!c) return;
    const o=e?.target; if(!o || o._isBgRect || o._isBase) return; // only overlays/text/labels
    try { o.setCoords(); } catch(_){}
    drawLines(guidesFor(c,o));
  }
  function onEnd(){
    clearTimeout(clearTimer);
    clearTimer = setTimeout(clearTop, S.lingerMs);
  }

  function wire(){
  const c = C();
  if (!c) return setTimeout(wire, 120);
  if (c.__raGuidesTopWired) return;
  c.__raGuidesTopWired = true;

    // Remove any older overlay‑canvas guides layer if present
    const old = document.getElementById('raGuidesOverlay'); if (old) try{ old.remove(); }catch(_){}

    placeToggle();

    c.on('object:moving',     onTransform);
    c.on('object:scaling',    onTransform);
    c.on('object:rotating',   onTransform);
    c.on('mouse:up',          onEnd);
    c.on('selection:cleared', onEnd);

    // Clean on zoom/pan/resize (if your UI does that)
    c/* removed after:render hook to avoid loops */ // .on('after:render', ()=>{/* keep last guides while dragging; cleared on mouse:up */});
    window.addEventListener('resize', clearTop, {passive:true});
    window.addEventListener('orientationchange', ()=>setTimeout(clearTop,150), {passive:true});
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire, {once:true});
  else wire();

  // Quick API if you want to tweak later in console:
  window.raGuides = Object.freeze({
    on:(v)=>{ if(typeof v==='boolean'){ S.on=v; const b=$('#raGuidesToggle'); if(b) b.textContent='Guides: '+(S.on?'On':'Off'); if(!v) clearTop(); } return S.on; },
    tolerance:(px)=>{ if(px>0) S.tol=+px; return S.tol; },
    linger:(ms)=>{ if(ms>=0) S.lingerMs=+ms; return S.lingerMs; }
  });
})();

/* ================= RA_GUIDES_BUTTON_NUDGE_V1 =================
   Repositions the Guides toggle so it sits right after “Snap: On”.
   No behavior change—purely visual alignment. Safe to stack.
   ============================================================ */
(() => {
  const ID = 'raGuidesToggle';
  const SNAP_ID = 'raSnapToggle';

  function nudge(){
    const btn = document.getElementById(ID);
    if (!btn) return;                    // guides not created yet
    const snap = document.getElementById(SNAP_ID);
    const row  = document.getElementById('raSnapRow') ||
                 (snap && snap.parentNode) ||
                 btn.parentNode;

    // If we can find the Snap toggle, place Guides right after it.
    if (snap && snap.parentNode && snap.nextSibling !== btn) {
      snap.parentNode.insertBefore(btn, snap.nextSibling);
    } else if (row && btn.parentNode !== row) {
      row.appendChild(btn);
    }

    // Tidy spacing/alignment
    btn.style.marginLeft = '8px';
    btn.style.marginRight = '0';
    btn.style.marginTop = '0';
    btn.style.alignSelf = 'center';
  }

  // Run now and keep fixing if the UI re-renders
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', nudge, { once:true });
  } else {
    nudge();
  }
  new MutationObserver(nudge).observe(document.documentElement, { childList:true, subtree:true });
})();

/* ==========================================================
   RA_OVERLAY_AUTO_TRIM_ON_ADD_V2
   - Tightens the selection box: trims transparent padding on overlays.
   - Works when overlays are added from any source (grid, upload, publish).
   - Also enables per-pixel hit testing on overlays.
   - One initial pass trims existing overlays already on canvas.
   - No UI added. Desktop/mobile & exports unaffected.
   ========================================================== */
(() => {
  if (window.__RA_TRIM_OVERLAYS_V2__) return;
  window.__RA_TRIM_OVERLAYS_V2__ = true;

  const ALPHA_THRESHOLD = 8;     // 0..255 — pixels with alpha <= threshold are treated as transparent
  const MIN_SHRINK = 0.01;       // ignore trims that change <1% (avoid needless churn)

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  // Grab the HTMLImageElement that Fabric uses internally
  function getImgEl(fabImg){
    return fabImg? (fabImg._originalElement || fabImg._element || fabImg.getElement?.() || null) : null;
  }

  // Compute tight bounds of non-transparent pixels
  function findOpaqueBounds(imgEl, thr = ALPHA_THRESHOLD){
    const w = imgEl.naturalWidth || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    if (!w || !h) return null;

    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(imgEl, 0, 0);
    const data = ctx.getImageData(0,0,w,h).data;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y=0, i=3; y<h; y++){
      for (let x=0; x<w; x++, i+=4){
        if (data[i] > thr){    // alpha channel
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null; // fully transparent
    return { x:minX, y:minY, w:(maxX - minX + 1), h:(maxY - minY + 1), W:w, H:h };
  }

  // Apply crop to a Fabric.Image in-place
  function applyCrop(img, bounds){
    if (!bounds) return false;
    const { x, y, w, h, W, H } = bounds;

    // Ignore microscopic trims (UI churn without benefit)
    const shrinkW = 1 - (w / W);
    const shrinkH = 1 - (h / H);
    if (shrinkW < MIN_SHRINK && shrinkH < MIN_SHRINK) return false;

    // Keep current scale; change the source frame to the tight rect
    // Fabric's bbox = width*scaleX by height*scaleY, so shrink width/height.
    img.set({
      cropX: x, cropY: y,
      width: w, height: h
    });
    img.setCoords();
    // Better hit-testing on irregular shapes
    img.perPixelTargetFind = true;
    img.targetFindTolerance = 4;
    return true;
  }

  // If an overlay is wrapped in a group, trim the inner image instead.
  function trimOverlayObject(obj){
    try{
      if (!obj || obj._kind !== 'overlay') return false;

      if (obj.type === 'image'){
        const el = getImgEl(obj);
        if (!el) return false;
        const b = findOpaqueBounds(el);
        return applyCrop(obj, b);
      }

      if (obj.type === 'group' && Array.isArray(obj._objects)){
        const inner = obj._objects.find(o => o.type === 'image');
        if (!inner) return false;
        const el = getImgEl(inner);
        if (!el) return false;
        const b = findOpaqueBounds(el);
        const changed = applyCrop(inner, b);
        if (changed){
          obj.addWithUpdate();  // refresh group geometry
          obj.setCoords();
        }
        return changed;
      }
    }catch(_){}
    return false;
  }

  function enablePerPixel(obj){
    if (!obj || obj._kind !== 'overlay') return;
    if (obj.type === 'image') {
      obj.perPixelTargetFind = true;
      obj.targetFindTolerance = 4;
    } else if (obj.type === 'group' && Array.isArray(obj._objects)){
      obj._objects.forEach(k => {
        if (k.type === 'image'){ k.perPixelTargetFind = true; k.targetFindTolerance = 4; }
      });
    }
  }

  function wire(){
    const c = C(); if (!c) return setTimeout(wire, 120);

    // Trim overlays as they are added
    if (!c.__raTrimBound){
      c.__raTrimBound = true;

      c.on('object:added', (e)=>{
        const o = e?.target;
        if (!o || o._isBgRect) return;

        // Only overlays (not base image, not background, not token id text)
        if (o._kind === 'overlay'){
          const changed = trimOverlayObject(o);
          enablePerPixel(o);
          if (changed){
            try { c.requestRenderAll(); } catch(_){}
          }
        }
      });

      // One-time pass to tighten any existing overlays (e.g., after reload)
      (c.getObjects()||[]).forEach(o=>{
        if (o._kind === 'overlay'){
          const changed = trimOverlayObject(o);
          enablePerPixel(o);
          if (changed) o.setCoords();
        }
      });
      try { c.requestRenderAll(); } catch(_){}
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wire, { once:true });
  } else {
    wire();
  }
})();


(() => {
  const GET_URL  = '/api/ra-settings';  // your endpoint (GET returns {ok, settings:{...}})
  const POST_URL = '/api/ra-settings';  // same endpoint for saving

  const isAdmin = /\badmin=1\b/i.test(location.search);

  function canvas() {
    return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  }

  function applyToCanvas(settings) {
    if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch(_) {} }

    const c = canvas(); if (!c) return false;
    const wm = (c.getObjects() || []).find(o => o && false);
    if (!wm) return false;

    const opacity = Math.max(0, Math.min(1, Number(settings?.opacity ?? 0.18)));
    const sizePct = Math.max(0.05, Math.min(1, Number(settings?.sizePct ?? 0.88)));

    const targetW = Math.round(c.getWidth() * sizePct);
    const baseW   = wm.width || (wm._element?.naturalWidth) || 512;
    const s = targetW / baseW;

    wm.opacity = opacity;
    wm.scaleX = s; wm.scaleY = s;
    wm.left = c.getWidth() / 2; wm.top = c.getHeight() / 2;
    wm.setCoords();
    c.bringToFront(wm);
    c.requestRenderAll();
    return true;
  }

  // Everyone: load the latest settings on open
  async function loadFromServerAndApply() {
    try {
      const url = GET_URL + (GET_URL.includes('?') ? '&' : '?') + 'v=' + Date.now(); // avoid cache
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      let s = j.settings ?? j.data ?? j;
      if (typeof s === 'string') { try { s = JSON.parse(s); } catch(_) {} }

      let tries = 0;
      const tick = () => {
        if (applyToCanvas(s)) return;
        if (++tries < 30) setTimeout(tick, 150);
      };
      tick();
    } catch (_) {}
  }

  // Read the current admin slider values
  function currentAdminValues() {
    const on  = document.getElementById('raWmCEnabled');
    const tok = document.getElementById('raWmCOnTok');
    const up  = document.getElementById('raWmCOnUp');
    const op  = document.getElementById('raWmCOpacity');
    const sz  = document.getElementById('raWmCSize');
    return {
      enabled: !!(on && on.checked),
      showOnTokens:  !!(tok && tok.checked),
      showOnUploads: !!(up && up.checked),
      opacity: op ? Number(op.value) : 0.18,
      sizePct: sz ? Number(sz.value) : 0.88
    };
  }

  // Save to the server (your /api/ra-settings has no auth, so this is simple)
  async function saveToServer(body) {
    try {
      await fetch(POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch(_) {}
  }

  // When admin sliders appear, send changes to server (debounced) and apply locally
  function wireAdminSaveOnce() {
    if (!isAdmin) return;

    const op = document.getElementById('raWmCOpacity');
    const sz = document.getElementById('raWmCSize');
    const on = document.getElementById('raWmCEnabled');
    const tok = document.getElementById('raWmCOnTok');
    const up = document.getElementById('raWmCOnUp');

    if (!op || op.__wmSyncBound) return;

    const debounced = (() => {
      let t; return () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const body = currentAdminValues();
          saveToServer(body);   // push to server for everyone
          applyToCanvas(body);  // reflect immediately in this tab
        }, 250);
      };
    })();

    [op, sz].forEach(el => el && el.addEventListener('input', debounced));
    [on, tok, up].forEach(el => el && el.addEventListener('change', debounced));

    op.__wmSyncBound = sz && (sz.__wmSyncBound = true);
    if (on)  on.__wmSyncBound  = true;
    if (tok) tok.__wmSyncBound = true;
    if (up)  up.__wmSyncBound  = true;
  }

  // Keep waiting for the admin controls to appear, then wire them once
  const mo = new MutationObserver(wireAdminSaveOnce);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Load settings for everyone on page open
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFromServerAndApply, { once: true });
  } else {
    loadFromServerAndApply();
  }
})();

/* ==========================================================
   RA_WM_FOLLOW_EVENTS_v1 — paste below the v3 block
   Makes sure the server settings apply even when you load
   the token later. Re-applies on object add/modify.
   ========================================================== */
(() => {
  const GET_URL = '/api/ra-settings'; // same endpoint

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  function applyToCanvas(settings){
    if (!settings) return false;
    const c = C(); if (!c) return false;
    const wm = (c.getObjects()||[]).find(o => o && false);
    if (!wm) return false;

    const opacity = Math.max(0, Math.min(1, Number(settings.opacity ?? 0.18)));
    const sizePct = Math.max(0.05, Math.min(1, Number(settings.sizePct ?? 0.88)));

    const targetW = Math.round(c.getWidth() * sizePct);
    const baseW   = wm.width || (wm._element?.naturalWidth) || 512;
    const s = targetW / baseW;

    wm.opacity = opacity;
    wm.scaleX = s; wm.scaleY = s;
    wm.left = c.getWidth()/2; wm.top = c.getHeight()/2;
    wm.setCoords();
    c.bringToFront(wm);
    c.requestRenderAll();
    return true;
  }

  let latest = null;

  async function fetchLatest(){
    try{
      const r = await fetch(GET_URL + (GET_URL.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache:'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      latest = j.settings ?? j.data ?? j;
    }catch(_){}
  }

  // 1) Grab settings once on open
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchLatest, { once:true });
  } else { fetchLatest(); }

  // 2) Try to apply a few times right away (covers fast loads)
  let tries = 0, maxTries = 50; // ~25s total
  (function tick(){
    if (applyToCanvas(latest)) return;
    if (++tries < maxTries) setTimeout(tick, 500);
  })();

  // 3) Follow canvas changes: apply whenever something is added/modified
  function wire(){
    const c = C(); if (!c || c.__raWmFollow) { if (!c) setTimeout(wire, 150); return; }
    c.__raWmFollow = true;
    c.on('object:added',    ()=> applyToCanvas(latest));
    c.on('object:modified', ()=> applyToCanvas(latest));
  }
  wire();
})();


(() => {
  const API = '/api/ra-settings';

  // --- Fabric helpers ---
  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  const $ = (id) => document.getElementById(id);

  function baseIsToken(){
    const c = C(); if (!c) return null;
    const base = (c.getObjects()||[]).find(o => o && o._isBase && !o._isBgRect);
    if (!base) return null;
    // in your app: token base = plain Image; uploads = Group
    return base.type === 'image';
  }

  function findWM(){
    const c = C(); if (!c) return null;
    return (c.getObjects()||[]).find(o => o && false) || null;
  }

  // --- server I/O ---
  async function getServer(){
    const r = await fetch(API + (API.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache:'no-store' });
    if (!r.ok) throw new Error('GET failed');
    const j = await r.json();
    return j.settings ?? j.data ?? j;
  }
  async function postServer(body){
    await fetch(API, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
  }

  // --- current UI values (when admin panel is visible) ---
  function readAdminUI(){
    return {
      enabled:       !!($('raWmCEnabled')?.checked),
      showOnTokens:  !!($('raWmCOnTok')?.checked),
      showOnUploads: !!($('raWmCOnUp')?.checked),
      opacity:  Number($('raWmCOpacity')?.value ?? 0.18),
      sizePct:  Number($('raWmCSize')?.value ?? 0.88)
    };
  }

  function applyToWM(s){
    const c = C(); const wm = findWM();
    if (!c || !wm || !s) return;

    // 1) visibility: obey Enabled + token/upload switches
    const isTok = baseIsToken();
    const show  = !!s.enabled && ((isTok && !!s.showOnTokens) || (!isTok && !!s.showOnUploads));
    wm.visible  = show;

    // 2) size + opacity from server
    const sizePct = Math.max(0.05, Math.min(1.4, Number(s.sizePct ?? 0.88)));
    const op      = Math.max(0, Math.min(1,   Number(s.opacity ?? 0.18)));

    const baseW = wm.width || (wm._element?.naturalWidth) || 512;
    const targetW = Math.round(c.getWidth() * sizePct);
    const sc = targetW / baseW;

    wm.scaleX = sc; wm.scaleY = sc;
    wm.opacity = op;
    wm.left = c.getWidth()/2; wm.top = c.getHeight()/2;
    wm.setCoords();

    // keep it on top but invisible if show==false
    try { c.bringToFront(wm); } catch(_){}
    c.requestRenderAll();
  }

  function wireCanvasFollows(stateRef){
    const c = C(); if (!c || c.__raWmServerMaster) { if (!c) setTimeout(()=>wireCanvasFollows(stateRef), 150); return; }
    c.__raWmServerMaster = true;
    const reapply = ()=> applyToWM(stateRef.val);
    c.on('object:added',    reapply);
    c.on('object:removed',  reapply);
    c.on('object:modified', reapply);
    // first pass
    setTimeout(reapply, 0);
  }

  // --- admin wiring: make every control "save + apply" ---
  function wireAdmin(stateRef){
    const ids = {
      en:  'raWmCEnabled',
      tok: 'raWmCOnTok',
      up:  'raWmCOnUp',
      op:  'raWmCOpacity',
      sz:  'raWmCSize',
      rf:  'raWmCRefresh'
    };
    const en  = $(ids.en), tok = $(ids.tok), up = $(ids.up),
          op  = $(ids.op), sz  = $(ids.sz),  rf = $(ids.rf);

    if (!op || op.__raWmServerMasterUI) return;   // not visible yet or already wired
    op.__raWmServerMasterUI = sz && (sz.__raWmServerMasterUI = true);
    if (en)  en.__raWmServerMasterUI  = true;
    if (tok) tok.__raWmServerMasterUI = true;
    if (up)  up.__raWmServerMasterUI  = true;
    if (rf)  rf.__raWmServerMasterUI  = true;

    const saveAndApply = async () => {
      const body = readAdminUI();
      stateRef.val = body;            // remember latest
      try { await postServer(body); } catch(_){}
      applyToWM(body);                // instant visual feedback
    };

    [op, sz].forEach(el => el && el.addEventListener('input',  saveAndApply));
    [en, tok, up].forEach(el => el && el.addEventListener('change', saveAndApply));

    // Make "Refresh" behave like "Save for everyone"
    if (rf){
      rf.addEventListener('click', (e)=>{
        e.preventDefault();
        saveAndApply();
      });
    }
  }

  // --- boot: load server once, enforce everywhere, then wire admin if present ---
  const STATE = { val: null };

  async function boot(){
    try { STATE.val = await getServer(); } catch(_){ STATE.val = readAdminUI(); }

    (function waitWm(tries=0){
      const wm = findWM();
      if (wm) { applyToWM(STATE.val); return; }
      if (tries < 60) setTimeout(()=>waitWm(tries+1), 250);
    })();

    wireCanvasFollows(STATE);

    // If admin panel is on screen, wire it; keep trying until it appears.
    const mo = new MutationObserver(()=> wireAdmin(STATE));
    mo.observe(document.documentElement, { childList:true, subtree:true });
    wireAdmin(STATE);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();


(() => {
  const API = '/api/ra-settings';
  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  // Read saved settings (enabled, showOnUploads, opacity, size)
  let settings = null;
  async function loadSettings(){
    try {
      const r = await fetch(API + '?v=' + Date.now(), { cache:'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      settings = j.settings ?? j.data ?? j;
    } catch(_){}
  }

  async function ensureImage(){
    try {
      if (window.raoverlay && typeof window.raoverlay.ready === 'function'){
        await window.raoverlay.ready();
        return window.raoverlay.img() || null;
      }
    } catch(_){}
    // Fallback (should rarely be needed)
    return await new Promise(res => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.src = '/assets/overlay.png?v=wm10';
    });
  }

  function hasBase(c){
    return !!(c.getObjects()||[]).find(o => o && o._isBase && !o._isBgRect);
  }
  function canvasHasContent(c){
    return !!(c.getObjects()||[]).find(o => o && !o._isBgRect && !false && !o._raWMOverlayFallback);
  }

  function removeFallback(){
    const c = C(); if (!c) return;
    (c.getObjects()||[]).filter(o => o && o._raWMOverlayFallback).forEach(o => c.remove(o));
    try { c.requestRenderAll(); } catch(_){}
  }

  async function update(){
    const c = C(); if (!c) return;

    if (!settings) await loadSettings();

    if (!settings || !settings.enabled) { removeFallback(); return; }

    const haveBase   = hasBase(c);
    const haveStuff  = canvasHasContent(c);

    if (haveBase) { removeFallback(); return; }

    // Nothing on canvas? nothing to show.
    if (!haveStuff) { removeFallback(); return; }

    // Respect "Show on uploads" for overlay-only use.
    if (!settings.showOnUploads) { removeFallback(); return; }

    const img = await ensureImage(); if (!img) return;

    let wm = (c.getObjects()||[]).find(o => o && o._raWMOverlayFallback);
    if (!wm){
      wm = new fabric.Image(img, {
        originX:'center', originY:'center',
        selectable:false, evented:false, hasControls:false,
        _raWMOverlayFallback:true, _raSys:true
      });
      c.add(wm);
    }

    const sizePct = Math.max(0.05, Math.min(1.4, Number(settings.sizePct ?? 0.88)));
    const op      = Math.max(0,    Math.min(1,   Number(settings.opacity ?? 0.18)));
    const targetW = Math.round(c.getWidth() * sizePct);
    const baseW   = img.width || 512;
    const sc      = targetW / baseW;

    wm.scaleX = sc; wm.scaleY = sc;
    wm.opacity = op;
    wm.left = c.getWidth()/2; wm.top = c.getHeight()/2; wm.setCoords();
    try { c.bringToFront(wm); } catch(_){}
    c.requestRenderAll();
  }

  function wire(){
    const c = C(); if (!c) { setTimeout(wire, 150); return; }
    if (c.__raOverlayFallback) return;   // only once
    c.__raOverlayFallback = true;

    // Re-check whenever the canvas changes
    c.on('object:added',   ()=> setTimeout(update, 0));
    c.on('object:removed', ()=> setTimeout(update, 0));
    c.on('object:modified',()=> setTimeout(update, 0));

    // React when admin tweaks settings
    ['raWmCEnabled','raWmCOnUp','raWmCOpacity','raWmCSize'].forEach(id=>{
      const el = document.getElementById(id);
      if (el && !el.__raOverlayFallback){
        el.__raOverlayFallback = true;
        ['change','input'].forEach(ev => el.addEventListener(ev, ()=>{ settings=null; update(); }));
      }
    });

    // Keep in place on canvas resize
    try {
      const el = c.getElement ? c.getElement() : (c.wrapperEl || c.upperCanvasEl);
      new ResizeObserver(()=> update()).observe(el);
    } catch(_){}

    // First run
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once:true });
  } else {
    wire();
  }
})();

/* ==========================================================
   RA_TEXT_ACTION_BAR_V2 + RA_EMOJI_PICKER_V2
   - Rebuilds the Custom Text action row so the 5 buttons sit neatly:
       [ Add Text ] [ 🙂 Emoji ] [ ✨ Inspire me ] [ Delete Selected ] [ Delete All ]
   - Larger emoji picker (with Recents).
   - Ensures color-emoji fonts render + export correctly.
   ========================================================== */
(() => {
  if (window.__RA_TEXT_ROW_EMOJI_V2__) return; window.__RA_TEXT_ROW_EMOJI_V2__ = true;

  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const  $ = (s,r=document)=>r.querySelector(s);
  const  C = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  /* ---------- 0) Font fallback so emojis export in color ---------- */
  const EMOJI_FALLBACK = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji'";
  function withEmojiFallback(stack){
    const s = String(stack||'system-ui');
    return /emoji/i.test(s) ? s : `${s}, ${EMOJI_FALLBACK}`;
  }
  function patchTextFonts(){
    const c=C(); if (!c) return;
    (c.getObjects()||[]).forEach(o=>{
      if (o && (o.type==='textbox'||o.type==='text')){
        o.set('fontFamily', withEmojiFallback(o.fontFamily||'system-ui'));
      }
    });
    c.requestRenderAll();
  }
  function wireFontPatch(){
    const c=C(); if (!c || c.__raEmojiFontPatched) return;
    c.__raEmojiFontPatched = true;
    c.on('object:added', e=>{
      const o = e?.target;
      if (o && (o.type==='textbox'||o.type==='text')){
        o.set('fontFamily', withEmojiFallback(o.fontFamily||'system-ui'));
        o.setCoords(); c.requestRenderAll();
      }
    });
    ['fontFamily','idFontFamily'].forEach(id=>{
      const el = $('#'+id); if (!el || el.__raEmojiFontBound) return;
      el.__raEmojiFontBound = true;
      const fix = ()=>{ el.value = withEmojiFallback(el.value||'system-ui'); patchTextFonts(); };
      el.addEventListener('change', fix);
      el.addEventListener('input',  fix);
      fix();
    });
  }

  /* ---------- 1) Build / fix the action row ---------- */
  function customTextCard(){
    const h = $$('h3,h2').find(x => /custom\s*text/i.test((x.textContent||'').trim()));
    return h ? (h.parentElement || h) : null;
  }

  function ensureActionRow(){
    const card = customTextCard(); if (!card) return null;
    let row = $('#raTextActionRow', card);
    if (!row){
      row = document.createElement('div');
      row.id = 'raTextActionRow';
      row.style.cssText = [
        'margin:8px 0 6px 0',
        'display:flex',
        'flex-wrap:wrap',
        'gap:8px',
        'align-items:center'
      ].join(';');
      // Insert the row just before any "Curved" controls if they exist, else at end
      const curve = $('#raCurveRow', card);
      if (curve) card.insertBefore(row, curve);
      else card.appendChild(row);
    }
    return row;
  }

  function moveIntoRow(row, id, labelFallback){
    const btn = $('#'+id);
    if (btn){ if (btn.parentNode !== row) row.appendChild(btn); return btn; }
    // optional: create fallback if missing
    if (!labelFallback) return null;
    const b = document.createElement('button');
    b.id = id; b.className = 'btn small'; b.textContent = labelFallback;
    row.appendChild(b);
    return b;
  }

  /* ---------- 2) Emoji picker ---------- */
  const REC_KEY='ra_emoji_recents_v1';
  function getRec(){ try{ return JSON.parse(localStorage.getItem(REC_KEY)||'[]'); }catch(_){ return []; } }
  function pushRec(e){
    const r = getRec(); const out=[e, ...r.filter(x=>x!==e)];
    out.length = Math.min(out.length, 24);
    try{ localStorage.setItem(REC_KEY, JSON.stringify(out)); }catch(_){}
  }

  // Larger, useful set (faces, hearts, symbols, gaming, arrows, ants, etc.)
  const EMOJI_ALL = [
    // Faces
    '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','🙂','🙃','😇','😍','😘','😗','😙','😚',
    '😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟',
    '😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵',
    '🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😮',
    '😯','😦','😧','😲','🥱','😴','🤤','😪','😵','😵‍💫','🤐','🥴','🤢','🤮','🤧','🤒','🤕','🤑',
    // Hearts & sparkle
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💖','💘','💝','💗','💓','💞','💕','💟','💔','❤️‍🔥','❤️‍🩹','✨','⭐️','🌟','⚡️','🔥','💥','💫',
    // Hands / reactions
    '👍','👎','👏','🙏','🤝','✌️','🤞','🤟','🤘','👌','🤌','👊','🙌','🫶',
    // Rebel Ant vibe
    '🐜','🐝','🦋','🧪','🧠','💎','🎯','🏆','🚀','🛸','🛡️','⚔️','🗡️','🪓','🔮','🎲','🎮','🕹️',
    // Music / fun
    '🎧','🎤','🎹','🎷','🥁','🪩',
    // Arrows / status
    '⬆️','⬇️','⬅️','➡️','↗️','↘️','↖️','↙️','✅','❌','⚠️'
  ];

  function buildEmojiUI(row){
    // Button
    let emojiBtn = $('#raEmojiBtn');
    if (!emojiBtn){
      emojiBtn = document.createElement('button');
      emojiBtn.id = 'raEmojiBtn';
      emojiBtn.className = 'btn small';
      emojiBtn.textContent = '🙂 Emoji';
      emojiBtn.style.cursor = 'pointer';
    }
    row.appendChild(emojiBtn);

    // Popover
    let pop = $('#raEmojiPop');
    if (!pop){
      pop = document.createElement('div');
      pop.id = 'raEmojiPop';
      Object.assign(pop.style,{
        position:'fixed', zIndex:'10000', display:'none',
        padding:'10px', border:'1px solid #2a2a2e', borderRadius:'10px',
        background:'#0f1116', color:'#e7e7ea', boxShadow:'0 12px 28px rgba(0,0,0,.55)',
        maxWidth:'520px'
      });

      // Recents header
      const recWrap = document.createElement('div');
      recWrap.id = 'raEmojiRec';
      recWrap.style.cssText = 'margin-bottom:8px;display:none';
      pop.appendChild(recWrap);

      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:#222;margin:6px 0 10px 0';
      pop.appendChild(sep);

      const grid = document.createElement('div');
      grid.id = 'raEmojiGrid';
      Object.assign(grid.style, {
        display:'grid',
        gridTemplateColumns:'repeat(12, 1fr)',
        gap:'6px',
        maxHeight:'240px',
        overflow:'auto',
        fontSize:'20px'
      });
      // Fill grid
      EMOJI_ALL.forEach(e=>{
        const cell=document.createElement('button');
        cell.textContent=e;
        Object.assign(cell.style,{
          width:'34px',height:'34px',lineHeight:'34px',
          textAlign:'center',border:'0',borderRadius:'6px',
          background:'#161821',color:'#fff',cursor:'pointer'
        });
        cell.addEventListener('click', ()=>{ insertEmoji(e); pop.style.display='none'; });
        grid.appendChild(cell);
      });
      pop.appendChild(grid);
      document.body.appendChild(pop);
    }

    // Open/close behavior
    emojiBtn.onclick = ()=>{
      if (pop.style.display==='block'){ pop.style.display='none'; return; }
      // Position under the button
      const r = emojiBtn.getBoundingClientRect();
      pop.style.left = Math.round(Math.min(r.left, window.innerWidth - 540)) + 'px';
      pop.style.top  = Math.round(r.bottom + 8) + 'px';
      // Rebuild recents section
      const rec = getRec(); const host = $('#raEmojiRec'); host.innerHTML='';
      if (rec.length){
        host.style.display = 'block';
        const label = document.createElement('div');
        label.textContent = 'Recent';
        label.style.cssText = 'font-size:11px;opacity:.65;margin:0 0 6px 2px';
        host.appendChild(label);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
        rec.forEach(e=>{
          const b=document.createElement('button');
          b.textContent=e;
          Object.assign(b.style,{
            width:'30px',height:'30px',lineHeight:'30px',
            textAlign:'center',border:'0',borderRadius:'6px',
            background:'#1b1d26',color:'#fff',cursor:'pointer'
          });
          b.onclick = ()=>{ insertEmoji(e); pop.style.display='none'; };
          row.appendChild(b);
        });
        host.appendChild(row);
      } else {
        host.style.display = 'none';
      }
      pop.style.display='block';
    };
    // Click-away
    document.addEventListener('click', (e)=>{
      if (e.target===emojiBtn || (pop.contains(e.target))) return;
      pop.style.display='none';
    });
  }

  function insertAtCaret(input, str){
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd   ?? start;
    const before = input.value.slice(0,start);
    const after  = input.value.slice(end);
    input.value = before + str + after;
    const pos = start + str.length;
    input.focus();
    try{ input.setSelectionRange(pos,pos); }catch(_){}
    // Let any listeners update the canvas
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function insertEmoji(e){
    const inp = $('#customText'); if (!inp) return;
    insertAtCaret(inp, e);
    pushRec(e);
    // If a text layer is selected, reflect immediately
    const c=C(); if (c){
      const o=c.getActiveObject();
      if (o && (o.type==='textbox'||o.type==='text')){
        o.text = inp.value.replace(/\r?\n/g,' ');
        o.set('fontFamily', withEmojiFallback(o.fontFamily||'system-ui'));
        o.setCoords(); c.requestRenderAll();
      }
    }
  }

  /* ---------- 3) Put everything together ---------- */
  function install(){
    wireFontPatch();

    const row = ensureActionRow(); if (!row) return;

    // Move existing buttons (keeps their click handlers)
    moveIntoRow(row, 'addCustomText');
    buildEmojiUI(row);                                  // adds [🙂 Emoji]
    // If Inspire button exists, move it in; otherwise leave as-is
    const aiBtn = $('#raAiQuoteBtn'); if (aiBtn) row.appendChild(aiBtn);
    moveIntoRow(row, 'delSelectedText');
    moveIntoRow(row, 'delAllText');

    // Tidy spacing if any button lacks "small"
    ['addCustomText','raEmojiBtn','raAiQuoteBtn','delSelectedText','delAllText'].forEach(id=>{
      const b=$('#'+id); if (!b) return;
      if (!b.classList.contains('small')) b.classList.add('small');
      b.style.margin = '0';   // prevent drifting out of the card
    });
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();

/* ==========================================================
   RA_EMOJI_POP_PLACEMENT_FIX_V1
   - Keeps the emoji picker fully on-screen.
   - Flips above the button if there isn’t room below.
   - Adds safe max-height + overflow so the bottom rows are reachable.
   ========================================================== */
(() => {
  if (window.__RA_EMOJI_POP_PLACEMENT_FIX_V1__) return;
  window.__RA_EMOJI_POP_PLACEMENT_FIX_V1__ = true;

  const clamp = (v,a,b)=>Math.max(a, Math.min(b, v));

  function placeEmojiPop(){
    const btn = document.getElementById('raEmojiBtn');
    const pop = document.getElementById('raEmojiPop');
    if (!btn || !pop || pop.style.display !== 'block') return;

    const vw = window.innerWidth  || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    // Keep the whole popover inside the viewport and scrollable
    const maxH = Math.min(420, Math.max(240, vh - 24)); // 24px breathing room
    pop.style.maxHeight = maxH + 'px';
    pop.style.overflow  = 'auto';

    // First set near the button, then correct if it overflows
    const rBtn = btn.getBoundingClientRect();

    // Temporarily position to measure its size
    pop.style.left = Math.round(Math.min(rBtn.left, vw - 540)) + 'px';
    pop.style.top  = Math.round(rBtn.bottom + 8) + 'px';

    // Now read actual size
    const rPop = pop.getBoundingClientRect();
    let left = clamp(rBtn.left, 8, vw - rPop.width - 8);
    let top  = rBtn.bottom + 8;

    // If it doesn’t fit below, try above
    if (top + rPop.height > vh - 6) {
      const upTop = rBtn.top - rPop.height - 8;
      top = (upTop >= 8) ? upTop : vh - rPop.height - 6; // clamp to bottom if still too tall
    }
    pop.style.left = Math.round(left) + 'px';
    pop.style.top  = Math.round(Math.max(6, top)) + 'px';
  }

  // Reposition right after the picker opens
  document.addEventListener('click', (e)=>{
    const isEmojiBtn = e.target && (e.target.id === 'raEmojiBtn' || e.target.closest?.('#raEmojiBtn'));
    if (isEmojiBtn) setTimeout(placeEmojiPop, 0);
  }, true);

  // Keep it placed on window changes
  window.addEventListener('resize',           ()=> setTimeout(placeEmojiPop, 0), {passive:true});
  window.addEventListener('orientationchange',()=> setTimeout(placeEmojiPop,100), {passive:true});
})();

/* === RA_CLICK_ZOOM + BUTTONS_v3 — click-to-zoom + integrated +/-/Reset === */
(() => {
  if (window.__RA_CLICK_ZOOM_BUTTONS_v3__) return;
  window.__RA_CLICK_ZOOM_BUTTONS_v3__ = true;

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }
  function whenReady(fn){
    if (C() && window.fabric) return fn();
    const t = setInterval(()=>{ if (C() && window.fabric){ clearInterval(t); fn(); } }, 120);
  }

  whenReady(() => {
    const c = C();
    const { fabric } = window;

    // Limits & speeds
    const MIN = 0.25, MAX = 6;
    const BTN_STEP = 1.12;      // +/- normal click speed
    const BTN_FAST = 1.25;      // hold Shift or Alt for faster +/- 
    const CLICK_STEP = 1.20;    // click-to-zoom step

    // State
    let toolOn = false;
    let lastAnchor = null;      // screen-space point (relative to canvas element)

    // Save/restore interaction while tool is on
    const saved = { selection:true, skip:false, cursor:'', hover:'' };

    // Helpers
    const curZoom = () => (typeof window.zoom === 'number' ? window.zoom : (c.getZoom?.() || 1));
    function updateLabel(z){
      const el = document.getElementById('zoomVal');
      if (el) el.textContent = Math.round((z ?? curZoom()) * 100) + '%';
    }
    function resolveAnchor(){
      // Prefer the last clicked point from the tool; else canvas center
      return lastAnchor || new fabric.Point(c.getWidth()/2, c.getHeight()/2);
    }
    function zoomAt(point, next){
      const z = Math.max(MIN, Math.min(MAX, next));
      try { c.zoomToPoint(point, z); } catch(_) { c.setZoom(z); }
      window.zoom = z;
      updateLabel(z);
      c.requestRenderAll();
    }
    function setZoomSmart(next){
      zoomAt(resolveAnchor(), next);
    }
    // Make other code benefit too
    window.setZoom = setZoomSmart;

    // Hijack +/-/Reset so old listeners don’t run
    function hijack(id, fn){
      const b = document.getElementById(id);
      if (!b || b.__raCZ3) return;
      b.__raCZ3 = true;
      b.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        fn(e || {});
      }, true); // capture phase
    }
    hijack('zoomIn', (e)=>{
      const step = (e.shiftKey || e.altKey) ? BTN_FAST : BTN_STEP;
      setZoomSmart(curZoom() * step);
    });
    hijack('zoomOut', (e)=>{
      const step = (e.shiftKey || e.altKey) ? BTN_FAST : BTN_STEP;
      setZoomSmart(curZoom() / step);
    });
    hijack('zoomReset', ()=>{
      try { c.setViewportTransform([1,0,0,1,0,0]); } catch(_) {}
      window.zoom = 1;
      lastAnchor = null; // clear saved click anchor
      updateLabel(1);
      c.requestRenderAll();
    });

    // --- Click‑to‑Zoom tool (toggle) ---
    function onMouseDown(opt){
      const ev = opt && opt.e; if (!ev) return;
      ev.preventDefault && ev.preventDefault();

      const rect = c.upperCanvasEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      // Save this as the new anchor for +/- buttons too
      lastAnchor = new fabric.Point(x, y);

      const zoomOut = ev.altKey || ev.metaKey || ev.ctrlKey || ev.button === 2; // Alt/⌥/Ctrl/⌘ or right-click
      const step = zoomOut ? (1/CLICK_STEP) : CLICK_STEP;
      zoomAt(lastAnchor, curZoom() * step);
    }
    function blockContext(e){ e.preventDefault(); }
    function onEsc(e){
      if (e.key === 'Escape'){ disableTool(); setBtnText('Click Zoom: Off'); }
    }

    function enableTool(){
      if (toolOn) return; toolOn = true;
      saved.selection   = c.selection;
      saved.skip        = !!c.skipTargetFind;
      saved.cursor      = c.defaultCursor || '';
      saved.hover       = c.hoverCursor   || '';

      c.selection = false;
      c.skipTargetFind = true;
      c.defaultCursor = 'zoom-in';
      c.hoverCursor   = 'zoom-in';

      c.on('mouse:down', onMouseDown);
      c.upperCanvasEl && c.upperCanvasEl.addEventListener('contextmenu', blockContext);
      document.addEventListener('keydown', onEsc, true);
    }
    function disableTool(){
      if (!toolOn) return; toolOn = false;
      try { c.off('mouse:down', onMouseDown); } catch(_){}
      try { c.upperCanvasEl && c.upperCanvasEl.removeEventListener('contextmenu', blockContext); } catch(_){}
      document.removeEventListener('keydown', onEsc, true);

      c.selection      = saved.selection;
      c.skipTargetFind = saved.skip;
      c.defaultCursor  = saved.cursor;
      c.hoverCursor    = saved.hover;

      c.requestRenderAll();
    }
    function toggleTool(){ toolOn ? disableTool() : enableTool(); }
    function setBtnText(txt){ const b=document.getElementById('raClickZoomToggle'); if (b) b.textContent = txt; }

    // Place a small toggle button next to your zoom controls
    (function placeButton(){
      const zi = document.getElementById('zoomIn');
      const holder = (zi && zi.parentNode) || document.getElementById('raSnapRow') || document.body;
      const btn = document.createElement('button');
      btn.id = 'raClickZoomToggle';
      btn.className = 'btn small';
      btn.style.marginLeft = '8px';
      btn.textContent = 'Click Zoom: Off';
      btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggleTool(); setBtnText(toolOn?'Click Zoom: On':'Click Zoom: Off'); });
      holder.appendChild(btn);
    })();

    // Keyboard shortcut: press “Z” to toggle tool
    document.addEventListener('keydown', (e)=>{
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (e.key.toLowerCase() === 'z' && !e.metaKey && !e.ctrlKey && tag!=='input' && tag!=='textarea' && tag!=='select' && !e.target?.isContentEditable){
        e.preventDefault();
        toggleTool();
        setBtnText(toolOn ? 'Click Zoom: On' : 'Click Zoom: Off');
      }
    }, true);

    // Expose minimal API if you ever want to control it elsewhere
    window.raClickZoom = {
      on: ()=>toolOn,
      setAnchor: (x,y)=>{ lastAnchor = new fabric.Point(x,y); },
      clearAnchor: ()=>{ lastAnchor = null; },
      enable: enableTool, disable: disableTool, toggle: toggleTool
    };
  });
})();

/* === RA_CANVAS_CONTROLS_LAYOUT_v1 — put Reset + Click Zoom on their own line === */
(() => {
  if (window.__RA_CANVAS_LAYOUT_V1) return;
  window.__RA_CANVAS_LAYOUT_V1 = true;

  function findResetButton() {
    let el =
      document.getElementById('zoomReset') ||
      document.getElementById('resetZoom') ||
      document.getElementById('reset');
    if (el) return el;
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => /reset/i.test((b.textContent || '').trim()));
  }

  function place() {
    const reset = findResetButton();
    if (!reset) return false;

    // Try to find the row Reset was in, and the Canvas panel that contains it
    const row   = reset.closest ? (reset.closest('.row') || reset.parentNode) : reset.parentNode;
    const panel = row && row.parentNode ? row.parentNode : null;
    if (!panel) return false;

    // Create a small toolbar right BELOW that row
    let bar = document.getElementById('raCanvasBottomBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'raCanvasBottomBar';
      bar.style.display    = 'flex';
      bar.style.flexWrap   = 'wrap';
      bar.style.gap        = '8px';
      bar.style.marginTop  = '6px';
      panel.insertBefore(bar, row.nextSibling);
    }

    // Move RESET into the new toolbar
    bar.appendChild(reset);
    reset.style.margin   = '0';
    reset.style.fontSize = '12px';
    reset.style.padding  = '6px 8px';

    // If our Click‑Zoom toggle exists, move it next to Reset
    const cz = document.getElementById('raClickZoomToggle');
    if (cz) {
      bar.appendChild(cz);
      cz.style.margin   = '0';
      cz.style.fontSize = '12px';
      cz.style.padding  = '6px 8px';
      cz.style.whiteSpace = 'nowrap';
      cz.style.maxWidth = '120px';
    }

    // Let the first row wrap if it ever needs to (prevents overflow on small widths)
    if (row && row.style) {
      row.style.display   = 'flex';
      row.style.flexWrap  = 'wrap';
      row.style.gap       = '6px';
      row.style.alignItems = 'center';
    }

    return true;
  }

  // Try until the elements exist
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (place() || tries > 50) clearInterval(t);
  }, 150);
})();

/* ========== RA_EXPORT_VIDEO_v7 — Safari-friendly export (MP4 if possible, fallback open tab) ========== */
(function RA_EXPORT_VIDEO_v7(){
  const $  = (id)=> document.getElementById(id);
  const qs = (sel)=> document.querySelector(sel);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  function findExportBtn(){
    return $("exportVideoBtn")
      || qs('#exportVideoBtn, [data-role="exportVideo"]')
      || Array.from(document.querySelectorAll('button')).find(b => /export\s*video/i.test(b.textContent||""));
  }
  function findPreviewBtn(){
    return $("previewBtn")
      || qs('#previewBtn, [data-role="preview"]')
      || Array.from(document.querySelectorAll('button')).find(b => /^preview$/i.test((b.textContent||"").trim()));
  }

  const btn = findExportBtn();
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      // Duration (seconds) from UI (fallback 6)
      const durEl =
        $("animDuration") ||
        qs('#animDuration, [data-role="animDuration"], input[name="animDuration"]');
      let durSec = parseFloat(durEl && durEl.value || "6");
      if (!Number.isFinite(durSec) || durSec <= 0) durSec = 6;
      durSec = Math.min(60, Math.max(1, durSec));

      // Fabric drawing layer
      const capCanvas =
        (window.canvas && (canvas.lowerCanvasEl || (canvas.getElement && canvas.getElement()))) ||
        qs('canvas');
      if (!capCanvas || !capCanvas.captureStream) {
        alert("Sorry, this browser cannot capture canvas video.");
        return;
      }

      // Choose a MIME that the browser can actually record
      let mime = 'video/webm;codecs=vp9';
      if (typeof MediaRecorder !== 'undefined') {
        if (isSafari && MediaRecorder.isTypeSupported('video/mp4')) {
          mime = 'video/mp4'; // prefer MP4 on Safari
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mime = 'video/webm;codecs=vp9';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
          mime = 'video/webm;codecs=vp8';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mime = 'video/webm';
        }
      }

      const fps = 30;
      const stream = capCanvas.captureStream(fps);

      let rec;
      try {
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      } catch (e) {
        // Fallback if Safari says yes but throws on creation
        mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9'
             : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8'
             : 'video/webm';
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      }

      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => rec.onstop = res);

      // Drive the same animation you preview so export matches it
      const previewBtn = findPreviewBtn();
      if (previewBtn) {
        try { previewBtn.click(); } catch(_) {}
        await new Promise(r => setTimeout(r, 60));
        try { previewBtn.click(); } catch(_) {}
      }

      // Keep frames flowing
      let pumpTimer = 0;
      const pump = ()=> {
        try { window.canvas && canvas.requestRenderAll(); } catch(_){}
        pumpTimer = setTimeout(pump, Math.round(1000/fps));
      };

      pump();
      rec.start(200);

      // Exact duration (+ tiny pad for encoder)
      await new Promise(r => setTimeout(r, Math.round(durSec * 1000) + 180));
      rec.stop();
      clearTimeout(pumpTimer);
      await stopped;

      const ext  = mime.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: (mime.split(';')[0] || 'video/webm') });
      const url  = URL.createObjectURL(blob);

      // Save file — Safari often ignores download for blob; open in a new tab as fallback
      const a = document.createElement('a');
      a.href = url;
      a.download = `rebel-ants-export.${ext}`;

      if (isSafari) {
        // Try opening first (most reliable on Safari), user can Save As…
        const w = window.open(url);
        if (!w) { // popup blocked? fall back to download
          document.body.appendChild(a);
          a.click();
        }
      } else {
        document.body.appendChild(a);
        a.click();
      }
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1500);

    } catch (err) {
      console.error(err);
      alert("Export failed: " + (err && err.message || err));
    }
  }, { passive:true });
})();

/* ========== RA_COLLECTIONS_ADMIN_v1.2 — adds Chain (hex) + RPC URL columns ========== */
(()=> {
  if (!/\badmin=1\b/i.test(location.search)) return;

  // Build panel
  const card = document.createElement('section');
  card.id = 'raCollPanel';
  card.style.cssText = 'margin:12px 0;padding:10px;border:1px solid #23242a;border-radius:12px;background:#0f1116;color:#e7e7ea';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <strong>Collections (wallet holder check)</strong>
      <div>
        <button id="raCollReload" class="btn small">Reload</button>
        <button id="raCollSave" class="btn small">Save to server</button>
      </div>
    </div>
    <div style="opacity:.7;font-size:12px;margin-top:6px">
      Use <b>hex</b> Chain IDs (e.g., 0x1 Ethereum, 0x8173 ApeChain). RPC URL is optional (helps custom chains).
    </div>
    <div style="overflow:auto;margin-top:8px">
      <table id="raCollTable" style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="text-align:left;border-bottom:1px solid #23242a">
            <th style="padding:6px 4px;min-width:140px">Name</th>
            <th style="padding:6px 4px;min-width:360px">Contract address</th>
            <th style="padding:6px 4px;min-width:90px">Chain (hex)</th>
            <th style="padding:6px 4px;min-width:90px">Tag</th>
            <th style="padding:6px 4px;min-width:280px">RPC URL (optional)</th>
            <th style="padding:6px 4px;min-width:40px"></th>
          </tr>
        </thead>
        <tbody id="raCollBody"></tbody>
      </table>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button id="raCollAdd" class="btn small">+ Add row</button>
      <button id="raCollSeed" class="btn small">Quick add sample rows</button>
      <span id="raCollMsg" style="font-size:12px;opacity:.75"></span>
    </div>
  `;
  // Try to place near other admin boxes
  const leftCol = document.querySelector('#left, .left, .sidebar, .panels, .controls, .col-left');
  (leftCol || document.body).appendChild(card);

  const body = card.querySelector('#raCollBody');
  const msg  = card.querySelector('#raCollMsg');

  let rows = [];

  function setMsg(t){ msg.textContent = t||''; if (t) setTimeout(()=>{ if (msg.textContent===t) msg.textContent=''; }, 2000); }

  function mkInput(val, placeholder, width){
    const i = document.createElement('input');
    i.type = 'text';
    i.value = val || '';
    i.placeholder = placeholder || '';
    i.style.cssText = `width:${width||'100%'};box-sizing:border-box;background:#12151c;border:1px solid #2a2e37;border-radius:6px;color:#e7e7ea;padding:6px`;
    return i;
  }
  function mkSelect(val){
    const s = document.createElement('select');
    s.innerHTML = `<option value="rebel">rebel</option><option value="friend">friend</option>`;
    s.value = (val==='rebel' ? 'rebel' : 'friend');
    s.style.cssText = 'background:#12151c;border:1px solid #2a2e37;border-radius:6px;color:#e7e7ea;padding:6px';
    return s;
  }
  function render(){
    body.innerHTML = '';
    rows.forEach((r, idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px;text-align:right"></td>
      `;
      const td = tr.querySelectorAll('td');

      const inName = mkInput(r.name, 'Chumpz (ApeChain)', '100%');
      const inAddr = mkInput(r.address, '0x…40 hex', '100%');
      const inChain= mkInput(r.chainId || '0x1', '0x1 / 0x2105 / 0x8173', '110px');
      const selTag = mkSelect(r.tag);
      const inRpc  = mkInput(r.rpcUrl || '', 'https://...', '100%');

      td[0].appendChild(inName);
      td[1].appendChild(inAddr);
      td[2].appendChild(inChain);
      td[3].appendChild(selTag);
      td[4].appendChild(inRpc);

      const del = document.createElement('button');
      del.textContent = '×';
      del.className = 'btn small';
      del.style.cssText = 'padding:4px 8px';
      del.onclick = ()=>{ rows.splice(idx,1); render(); };
      td[5].appendChild(del);

      // Keep rows in sync
      [inName,inAddr,inChain,selTag,inRpc].forEach(el=>{
        el.addEventListener('input', ()=>{
          r.name    = inName.value.trim();
          r.address = inAddr.value.trim();
          r.chainId = inChain.value.trim();
          r.tag     = selTag.value;
          r.rpcUrl  = inRpc.value.trim();
        });
      });

      body.appendChild(tr);
    });
  }

  async function load(){
    setMsg('Loading…');
    try{
      const r = await fetch('/api/ra-collections');
      const j = await r.json();
      rows = Array.isArray(j.collections) ? j.collections.slice() : [];
      // If any row lacks chainId (old saves), default to 0x1 so it’s visible/editable.
      rows.forEach(r => { if (!r.chainId) r.chainId = '0x1'; });
      render();
      setMsg('Loaded');
    }catch(_){ setMsg('Load failed'); }
  }

  async function save(){
    setMsg('Saving…');

    // quick validate
    const okAddr = x => /^0x[a-fA-F0-9]{40}$/.test(x||'');
    const okHex  = x => /^0x[0-9a-fA-F]+$/.test(x||'');
    const okUrl  = x => !x || /^https?:\/\/\S+$/i.test(x);

    const cleaned = rows
      .map(r => ({
        name: (r.name||'').trim().slice(0,80),
        address: (r.address||'').trim(),
        chainId: (r.chainId||'').trim().toLowerCase(),
        tag: (r.tag==='rebel'?'rebel':'friend'),
        rpcUrl: (r.rpcUrl||'').trim()
      }))
      .filter(r => r.name && okAddr(r.address) && okHex(r.chainId) && okUrl(r.rpcUrl));

    try{
      const r = await fetch('/api/ra-collections', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ collections: cleaned })
      });
      if (!r.ok) throw new Error('bad');
      setMsg('Saved');
    }catch(_){ setMsg('Save failed'); }
  }

  function addRow(){
    rows.push({ name:'', address:'', chainId:'0x1', tag:'friend', rpcUrl:'' });
    render();
  }
  function seed(){
    rows = [
      { name:'Rebel Ants',        address:'0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221', chainId:'0x1',    tag:'rebel'  },
      { name:'Saints of LA',      address:'0xbEd2470deD2519c13EaaF3Bd970015ef404d3D20', chainId:'0x1',    tag:'friend' },
      { name:'Chumpz (ApeChain)', address:'0xa9a1d086623475595a02991664742e4a1cbafcb8', chainId:'0x8173', tag:'friend',
        rpcUrl:'https://apechain.calderachain.xyz/http' }
    ];
    render();
    setMsg('Sample rows added — edit then Save to server.');
  }

  card.querySelector('#raCollReload').onclick = load;
  card.querySelector('#raCollSave').onclick   = save;
  card.querySelector('#raCollAdd').onclick    = addRow;
  card.querySelector('#raCollSeed').onclick   = seed;

  // First load
  load();
})();

/* ========== RA_WALLET_CONNECT_MINI_v1 — connect + refresh + disconnect + robust check ========== */
(()=>{
  const qs  = (s,r=document)=>r.querySelector(s);

  // --- UI ---
  const box = document.createElement('div');
  box.id = 'ra-wallet-mini';
  box.innerHTML = `
    <div class="panel" style="margin:12px 0;padding:10px;border-radius:8px;background:#121317;border:1px solid rgba(255,255,255,.08);color:#e6e6e6;font-size:12px;line-height:1.4;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <strong style="font-size:13px;">Wallet</strong>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="raW_refresh"   class="btn" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:#1c1f26;border-radius:6px;color:#fff;cursor:pointer;display:none;">Refresh</button>
          <button id="raW_disconnect"class="btn" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:#1c1f26;border-radius:6px;color:#fff;cursor:pointer;display:none;">Disconnect</button>
          <button id="raW_connect"   class="btn" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:#1c1f26;border-radius:6px;color:#fff;cursor:pointer;">Connect</button>
        </div>
      </div>

      <div id="raW_row1" style="margin-top:8px; display:none;">
        <div><span style="opacity:.65;">Address:</span> <span id="raW_addr" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;"></span></div>
        <div><span style="opacity:.65;">Network:</span> <span id="raW_chain"></span></div>
      </div>

      <div id="raW_actions" style="margin-top:10px; display:none;">
        <button id="raW_check" class="btn" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:#1c1f26;border-radius:6px;color:#fff;cursor:pointer;">Check holdings</button>
        <span id="raW_hint" style="margin-left:8px;opacity:.65;font-size:11px;"></span>
      </div>

      <div id="raW_out" style="margin-top:10px; white-space:pre-wrap;"></div>
    </div>
  `;
  const leftCol = qs('#left, .left, .sidebar, .panels, .controls, .col-left');
  (leftCol && leftCol.firstChild) ? leftCol.insertBefore(box, leftCol.firstChild)
                                  : document.body.insertBefore(box, document.body.firstChild);

  // --- Els
  const btnConnect = qs('#raW_connect',    box);
  const btnRefresh = qs('#raW_refresh',    box);
  const btnDisc    = qs('#raW_disconnect', box);
  const btnCheck   = qs('#raW_check',      box);
  const row1       = qs('#raW_row1',       box);
  const actions    = qs('#raW_actions',    box);
  const out        = qs('#raW_out',        box);
  const addrEl     = qs('#raW_addr',       box);
  const chainEl    = qs('#raW_chain',      box);
  const hintEl     = qs('#raW_hint',       box);

  // --- State
  window.RA_WALLET_STATE = { connected:false, address:null, chainId:null, provider:null };
  window.RA_HOLDER_STATE = { checked:false, hasRebel:false, hasFriend:false, matches:[] };

  // --- Chain names (includes ApeChain + Base)
  function netNameFromChainId(cidHex){
    const map = {
      '0x1':      'Ethereum',
      '0xaa36a7': 'Sepolia',
      '0x2105':   'Base',
      '0x14a33':  'Base Sepolia',
      '0xa4b1':   'Arbitrum One',
      '0x89':     'Polygon',
      '0x8173':   'ApeChain'     // <— added
    };
    const k = (cidHex||'').toLowerCase();
    return map[k] || cidHex;
  }
  const short = a => !a ? '' : (a.slice(0,6)+'…'+a.slice(-4));

  // --- Collections API
  async function getCollectionsFor(chainIdHex){
    try{
      const r = await fetch('/api/ra-collections');
      if (r.ok){
        const j = await r.json();
        return (j.collections||[]).filter(c => (c.chainId||'').toLowerCase() === (chainIdHex||'').toLowerCase());
      }
    }catch(_){}
    return [];
  }

  // --- ERC-721 balanceOf via wallet provider
  async function balanceOf(provider, contract, owner){
    const data = '0x70a08231' + owner.replace(/^0x/,'').padStart(64,'0');
    const hex = await provider.request({ method:'eth_call', params:[{ to:contract, data }, 'latest'] });
    try { return (BigInt(hex) > 0n); } catch { return false; }
  }

  // --- ERC-721 balanceOf via raw RPC (fallback for custom networks)
  async function balanceOfRpc(rpcUrl, contract, owner){
    if (!rpcUrl) return false;
    const data = '0x70a08231' + owner.replace(/^0x/,'').padStart(64,'0');
    try{
      const r = await fetch(rpcUrl, {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ id:1, jsonrpc:'2.0', method:'eth_call', params:[ { to:contract, data }, 'latest' ] })
      });
      const j = await r.json();
      const hex = j && j.result;
      if (!hex) return false;
      return (BigInt(hex) > 0n);
    }catch(_){ return false; }
  }

  // --- Connect / Refresh / Disconnect

  // Implementation F: Wallet connect reentrancy guard
  let CONNECTING = false;

  async function connect(){
    const eth = window.ethereum;
    if (!eth){ out.textContent='No wallet detected (MetaMask/Coinbase).'; return; }
    
// Reentrancy guard (supports legacy and new flags)
if (window.__walletConnecting || (typeof CONNECTING !== 'undefined' && CONNECTING)) {
  if (out) out.textContent = 'Connection in progress...';
  return;
}
window.__walletConnecting = true;
if (typeof CONNECTING !== 'undefined') CONNECTING = true;
    try{
      out.textContent = 'Connecting...';
      const accounts = await eth.request({ method:'eth_requestAccounts' });
      const chainId  = await eth.request({ method:'eth_chainId' });
      const address  = accounts?.[0] || null;
      setConnected(!!address, address, chainId, eth, 'Connected. Click “Check holdings”.');
} catch (err) {
  // Handle user cancellation (error code 4001) more gracefully
  if (err && err.code === 4001) {
    if (out) out.textContent = 'Request cancelled';
    // Clear the message after a short delay for next attempt
    setTimeout(() => {
      if (out && out.textContent === 'Request cancelled') out.textContent = '';
    }, 2000);
  } else {
    console.error('Wallet connect error:', err);
    if (out) out.textContent = 'Connection failed. Please try again.';
    // Clear error message after delay
    setTimeout(() => {
      if (out && (out.textContent === 'Connection failed' || out.textContent === 'Connection failed. Please try again.')) {
        out.textContent = '';
      }
    }, 3000);
  }
} finally {
  // Clear both reentrancy flags
  window.__walletConnecting = false;
  if (typeof CONNECTING !== 'undefined') CONNECTING = false;
}
  }
  
  async function refresh(){
    const eth = window.ethereum;
    if (!eth){ out.textContent='No wallet detected.'; return; }
    try{
      const accounts = await eth.request({ method:'eth_accounts' }); // no popup
      const chainId  = await eth.request({ method:'eth_chainId' });
      const address  = accounts?.[0] || null;
      if (!address){
        setDisconnected('No active account. Click Connect.');
      } else {
        setConnected(true, address, chainId, eth, 'Refreshed. Click “Check holdings”.');
      }
    }catch(_){ out.textContent='Refresh failed.'; }
  }
  function disconnect(){
    // Soft disconnect: clear our UI/state. For a full revoke, user disconnects in wallet UI.

    window.RA_HOLDER_STATE = { checked: false, hasRebel: false, hasFriend: false, matches: [] };
    window.__raWMForce = null; // Remove any holder-based overlay override
    
    setDisconnected('Disconnected in app. (Use the wallet menu to fully disconnect this site.)');

    try { 
      document.dispatchEvent(new CustomEvent('ra-holder-update', { detail: window.RA_HOLDER_STATE })); 
    } catch(_) {}
  }

  function setConnected(ok, address, chainId, provider, msg){
    window.RA_WALLET_STATE = { connected: ok, address, chainId, provider };
    qs('#raW_connect', box).style.display  = ok ? 'none' : '';
    btnRefresh.style.display = ok ? '' : 'none';
    btnDisc.style.display    = ok ? '' : 'none';
    row1.style.display       = ok ? '' : 'none';
    actions.style.display    = ok ? '' : 'none';
    addrEl.textContent       = short(address||'');
    chainEl.textContent      = netNameFromChainId(chainId||'');
    hintEl.textContent       = ok ? 'Switch accounts/networks? Click Refresh.' : '';
    out.textContent          = msg || '';
  }
  function setDisconnected(msg){
    window.RA_WALLET_STATE = { connected:false, address:null, chainId:null, provider:null };
    
    // Reset holder state when disconnected
    window.RA_HOLDER_STATE = { checked: false, hasRebel: false, hasFriend: false, matches: [] };
    window.__raWMForce = null; // Remove any holder-based overlay override
    
    qs('#raW_connect', box).style.display  = '';
    btnRefresh.style.display = 'none';
    btnDisc.style.display    = 'none';
    row1.style.display       = 'none';
    actions.style.display    = 'none';
    out.textContent          = msg || '';

    try { 
      document.dispatchEvent(new CustomEvent('ra-holder-update', { detail: window.RA_HOLDER_STATE })); 
    } catch(_) {}
  }

  // --- Holdings
  async function checkHoldings(){
    const { provider, address, chainId } = window.RA_WALLET_STATE || {};
    if (!provider || !address || !chainId){ out.textContent='Connect your wallet first.'; return; }
    out.textContent = 'Checking…';

    const cols = await getCollectionsFor(chainId);
    if (!cols.length){
      out.textContent = `No collections configured for ${netNameFromChainId(chainId)}.`;
      window.RA_HOLDER_STATE = { checked:true, hasRebel:false, hasFriend:false, matches:[] };
      document.dispatchEvent(new CustomEvent('ra-holder-update', { detail: window.RA_HOLDER_STATE }));
      return;
    }

    const matches = [];
    for (const c of cols){
      let ok = false;
      // try wallet provider first
      try { ok = await balanceOf(provider, c.address, address); } catch(_){}
      // fallback to RPC if provided (helps custom networks like ApeChain)
      if (!ok && c.rpcUrl) {
        try { ok = await balanceOfRpc(c.rpcUrl, c.address, address); } catch(_){}
      }
      matches.push({ ...c, holds: ok });
    }

    const hasRebel  = matches.some(m => m.holds && m.tag==='rebel');
    const hasFriend = matches.some(m => m.holds && m.tag!=='rebel');

    window.RA_HOLDER_STATE = { checked:true, hasRebel, hasFriend, matches };
    document.dispatchEvent(new CustomEvent('ra-holder-update', { detail: window.RA_HOLDER_STATE }));

    const lines = [
      `Chain: ${netNameFromChainId(chainId)}`,
      `Address: ${short(address)}`,
      '',
      ...matches.map(r => `• ${r.name||r.address} — ${r.holds ? '✅ holds' : '—'}`),
      '',
      `Summary: ${hasRebel ? 'Rebel holder' : 'No Rebel'}${hasFriend ? ' + Friend collection' : ''}`
    ];
    out.textContent = lines.join('\n');
  }

  // --- Wire
  qs('#raW_connect', box).addEventListener('click', connect);
  btnRefresh.addEventListener('click', refresh);
  btnDisc.addEventListener('click', disconnect);
  btnCheck  .addEventListener('click', checkHoldings);

  // update on wallet events
  if (window.ethereum){
    ethereum.on?.('accountsChanged', ()=>{ 
      out.textContent = ''; // Clear status on account change
      hintEl.textContent='Account changed — click Refresh.'; 
    });
    ethereum.on?.('chainChanged',   cid=>{ 
      out.textContent = ''; // Clear status on chain change
      chainEl.textContent = netNameFromChainId(cid); hintEl.textContent='Network changed — click Refresh.'; 
    });
  }

  // optional: try a silent refresh on load
  (async ()=>{ try{ await refresh(); }catch(_){} })();
})();

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
    return 'https://cloudflare-ipfs.com/ipfs/' + uri.replace('ipfs://', '').replace(/^ipfs\//, '');
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

/* ========== RA_TOKEN_ID_LOAD_v5 — Load button (reuse your display) + keep Custom Text clean ========== */
(()=>{
  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once:true });
    else fn();
  }

  const STATE = { id:null, text:null, ui:null };
  const C = ()=> window.canvas || null;

  // --- find the Token ID Styles card by its heading
  function findCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /token id styles/i.test(el.textContent||''));
    if (h) return h.closest('.card') || h.parentElement;
    return Array.from(document.querySelectorAll('.card,section,div'))
      .find(el => /token id styles/i.test(el.textContent||'')) || null;
  }

  // --- the main Token ID input (in the Upload area)
  function mainTokenInput(){
    return document.getElementById('tokenId')
        || document.querySelector('input#token')
        || document.querySelector('input[name="token"]')
        || document.querySelector('input[placeholder*="Token"]');
  }
  function readMainToken(){
    const el = mainTokenInput(); if (!el) return null;
    const n = parseInt((el.value||'').trim(),10);
    return Number.isFinite(n) ? n : null;
  }

  // --- locate your existing small "#—" field; add only the Load button
  function ensureUI(card){
    if (!card) return null;

    // Reuse your existing small display if present (input or output)
    let readout =
      card.querySelector('#raTokenIdDisplay') ||
      Array.from(card.querySelectorAll('input[type="text"],input:not([type]),output')).find(el=>{
        const t = ((el.value ?? el.textContent ?? el.placeholder) || '').toString().trim();
        return t.startsWith('#') || (el.placeholder||'').toString().trim().startsWith('#');
      }) || null;

    // If it’s an input, make it read‑only and tag it
    if (readout && readout.tagName && readout.tagName.toLowerCase()==='input'){
      readout.readOnly = true;
      if (!readout.id) readout.id = 'raTokenIdDisplay';
    }

    // Remove any stray extra output we might have made before (prevents the second box)
    Array.from(card.querySelectorAll('output#raTokenIdDisplay')).forEach(o=>{
      if (o !== readout) o.remove();
    });

    // Ensure the Load button exists, placed right after the readout if possible
    let loadBtn = card.querySelector('#raLoadTokenIdBtn') ||
      Array.from(card.querySelectorAll('button')).find(b=>/load token id/i.test(b.textContent||''));
    if (!loadBtn){
      loadBtn = document.createElement('button');
      loadBtn.id = 'raLoadTokenIdBtn';
      loadBtn.className = 'btn danger';
      loadBtn.textContent = 'Load Token ID';
      if (readout && readout.parentElement){
        readout.parentElement.insertBefore(loadBtn, readout.nextSibling);
      } else {
        const row = document.createElement('div');
        row.className = 'row';
        row.style.gap = '10px';
        row.appendChild(loadBtn);
        card.insertBefore(row, card.firstElementChild?.nextSibling || card.firstChild);
      }
    }

    // Use the existing Delete button on the card (we never add a second one)
    const delBtn = Array.from(card.querySelectorAll('button'))
      .find(b => /delete token id/i.test(b.textContent||''));

    return { card, loadBtn, delBtn, readout };
  }

  // --- find the style controls already on this card
  function findStyleCtrls(card){
    const fmt = Array.from(card.querySelectorAll('select')).find(s=>{
      const txt = Array.from(s.options||[]).map(o => (o.textContent||'').toLowerCase()).join('|');
      return /roman|hex|binary|leading|standard/.test(txt);
    }) || null;

    let size = null;
    const sizeLabel = Array.from(card.querySelectorAll('label')).find(l=>/size/i.test(l.textContent||''));
    if (sizeLabel){
      const wrap = sizeLabel.parentElement;
      size = wrap && (wrap.querySelector('input[type="number"]') || wrap.querySelector('input'));
    }
    if (!size){
      const nums = Array.from(card.querySelectorAll('input[type="number"]'));
      size = nums[0] || null;
    }

    const colors = Array.from(card.querySelectorAll('input[type="color"]')); // [fill, stroke]
    const fill   = colors[0] || null;
    const stroke = colors[1] || null;

    const width  = card.querySelector('input[type="range"]') || null;

    return { fmt, size, fill, stroke, width };
  }

  // --- helpers to format the number
  function roman(n){
    if (!Number.isFinite(n) || n<=0) return String(n);
    const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let out='', x=Math.floor(n);
    for (const [v,s] of map){ while (x>=v){ out+=s; x-=v; } }
    return out;
  }
  const toBinary = n => (n>>>0).toString(2);
  const toHex    = n => '0x'+(n>>>0).toString(16).toUpperCase();
  const pad4     = n => String(Math.max(0,Math.floor(n))).padStart(4,'0');
  function formatId(n, sel){
    const f = (sel && sel.value || '').toLowerCase();
    if (f.includes('roman'))  return roman(n);
    if (f.includes('hex'))    return toHex(n);
    if (f.includes('binary')) return toBinary(n);
    if (f.includes('leading') || f.includes('zeros')) return pad4(n);
    return String(n); // Standard
  }

  // --- create a single token‑ID Fabric text (marked so other UI can ignore it)
  function ensureTokenText(){
    const c = C(); if (!c || typeof fabric==='undefined') return null;

    if (STATE.text && STATE.text.canvas) return STATE.text;

    // remove any stale token‑id texts made by older code
    (c.getObjects?.()||[]).forEach(o=>{
      if (o && o._raTokenId && o !== STATE.text){ try{ c.remove(o); }catch(_){} }
    });

    const t = new fabric.Text('#', {
      left:24, top:24, originX:'left', originY:'top',
      fontFamily:'Impact, system-ui, Arial, Helvetica, sans-serif',
      fontWeight:'bold', lineHeight:1, charSpacing:0, padding:0,
      fill:'#ffffff', stroke:'#000000', strokeWidth:2, strokeUniform:true,
      selectable:true, evented:true, hasControls:true,
      _raTokenId:true, _raSys:true
    });
    const ccv = C(); ccv.add(t); STATE.text=t;
    try{ ccv.bringToFront(t);}catch(_){}
    ccv.requestRenderAll();
    return t;
  }

  // --- find the “Custom Text → Type your message” box
  function findCustomTextInput(){
    const cardTitle = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el=>/custom text/i.test(el.textContent||''));
    const card = cardTitle ? (cardTitle.closest('.card') || cardTitle.parentElement) : null;
    if (!card) return null;
    // textarea or large input for message
    return card.querySelector('textarea, input[type="text"], input:not([type])');
  }

  // --- if that box shows our token string, blank it (so the token id never “moves into” Custom Text)
  function scrubCustomTextBox(tokenShown){
    const msg = findCustomTextInput(); if (!msg) return;
    const val = (msg.value||'').trim();
    // only clear when it matches the token id we just rendered
    if (val === tokenShown){
      msg.value = '';
      try{ msg.dispatchEvent(new Event('input', {bubbles:true})); }catch(_){}
      try{ msg.dispatchEvent(new Event('change', {bubbles:true})); }catch(_){}
    }
  }

  // --- apply styles + keep Custom Text clean
  function applyStyles(){
    if (STATE.id==null || !STATE.ui) return;
    const c = C(); const t = ensureTokenText(); if (!c || !t) return;

    const { fmt, size, fill, stroke, width, readout } = STATE.ui;

    const shown = '#'+formatId(STATE.id, fmt);
    t.set({ text: shown });

    const fs = parseInt(size && size.value, 10);
    if (Number.isFinite(fs) && fs>0) t.set('fontSize', fs);

    if (fill   && fill.value)   t.set('fill',   fill.value);   // inside color
    if (stroke && stroke.value) t.set('stroke', stroke.value); // outline color

    const w = parseFloat(width && width.value);
    if (Number.isFinite(w)) t.set('strokeWidth', w);

    // make the selection box “hug” the glyphs
    t.set({ padding:0, lineHeight:1, dirty:true, noScaleCache:true });
    t.setCoords(); c.requestRenderAll();

    if (readout){
      if (readout.tagName && readout.tagName.toLowerCase()==='input'){ readout.value = shown; }
      else { readout.textContent = shown; }
    }

    // keep the Custom Text message box empty if it picked up our token text
    scrubCustomTextBox(shown);
    setTimeout(()=> scrubCustomTextBox(shown), 30); // run again after app’s own sync
  }

  // --- wire everything
  function wire(){
    const card = findCard(); if (!card) return false;

    const base = ensureUI(card); if (!base) return false;
    const styles = findStyleCtrls(base.card);
    STATE.ui = { ...base, ...styles };

    // Load Token ID
    base.loadBtn.addEventListener('click', (e)=>{
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
      const n = readMainToken();
      if (n==null){ alert('Type a number in the main “Token ID” field (e.g., 1111), then click “Load Token ID”.'); return; }
      STATE.id = n;
      applyStyles();
    }, true);

    // Hook your existing Delete Token ID button
    base.delBtn && base.delBtn.addEventListener('click', ()=>{
      const c = C();
      if (STATE.text && STATE.text.canvas){ try{ STATE.text.canvas.remove(STATE.text); }catch(_){} }
      STATE.text = null;
      if (STATE.ui && STATE.ui.readout){
        if (STATE.ui.readout.tagName && STATE.ui.readout.tagName.toLowerCase()==='input') STATE.ui.readout.value = '#—';
        else STATE.ui.readout.textContent = '#—';
      }
      c?.requestRenderAll();
    }, true);

    // Live style updates — only affect the token‑ID text
    [styles.fmt, styles.size, styles.fill, styles.stroke, styles.width].forEach(el=>{
      if (!el) return;
      el.addEventListener('input',  ()=>{ if (STATE.text) applyStyles(); });
      el.addEventListener('change', ()=>{ if (STATE.text) applyStyles(); });
    });

    // If you change the number later, click Load again to refresh it
    const main = mainTokenInput();
    main && main.addEventListener('change', ()=>{
      if (!STATE.text) return;
      const n = readMainToken();
      if (n!=null){ STATE.id = n; applyStyles(); }
    });

    // If selection switches to the token‑ID object, keep the Custom Text box clean
    const c = C();
    const scrubIfToken = ()=> {
      if (!STATE.text) return;
      const a = c?.getActiveObject?.();
      const uiText = '#'+formatId(STATE.id, styles.fmt);
      if (a && a._raTokenId) { scrubCustomTextBox(uiText); }
    };
    c?.on?.('selection:created', scrubIfToken);
    c?.on?.('selection:updated', scrubIfToken);

    return true;
  }

  function boot(){
    if (!wire()){
      // if the card appears late, try briefly
      let tries = 0;
      const iv = setInterval(()=>{ if (wire() || (++tries>40)) clearInterval(iv); }, 200);
    }
  }

 onReady(boot);
})();

/* ========== RA_SAFE_SCRUB_v1 — stop the Custom Text box from mirroring the Token‑ID text ========== */
(()=>{
  function C(){ return window.canvas || null; }

  function findCustomBox(){
    const t = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el=>/custom text/i.test(el.textContent||''));
    const card = t ? (t.closest('.card')||t.parentElement) : null;
    return card ? (card.querySelector('textarea, input[type="text"], input:not([type])')||null) : null;
  }

  function scrubIfToken(){
    const c = C(); if (!c) return;
    const a = c.getActiveObject && c.getActiveObject();
    if (!a || !a._raTokenId) return;             // only react to the Token‑ID object
    const box = findCustomBox(); if (!box) return;
    const val = (box.value||'').trim();
    if (val && /^#\S+/.test(val)) {               // if it shows "#1111" etc, clear it
      box.value = '';
      try{ box.dispatchEvent(new Event('input',{bubbles:true})); }catch(_){}
      try{ box.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){}
    }
  }

  function boot(){
    const c = C(); if (!c){ setTimeout(boot,200); return; }
    c.on('selection:created', ()=> setTimeout(scrubIfToken,0));
    c.on('selection:updated', ()=> setTimeout(scrubIfToken,0));
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();

/* ========== RA_FRONT_GUARD_SAFE_v3 — only on selection change (safe for Curved) ========== */
(()=>{
  const C = ()=> window.canvas || null;
  const isSys = o => !!(o && (o._isBase || false || o._raSys));
  const hasText = o => {
    if (!o) return false;
    const t = (o.type||'').toLowerCase();
    if (t.includes('text')) return true;
    if (typeof o.getObjects === 'function'){
      try { return o.getObjects().some(ch => ((ch.type||'').toLowerCase().includes('text'))); }
      catch(_){}
    }
    return false;
  };

  function bumpSelected(){
    const c = C(); if (!c) return;
    const a = c.getActiveObject && c.getActiveObject();
    if (!a || isSys(a) || !hasText(a)) return;
    try { c.bringToFront(a); } catch(_){}
    try { c.requestRenderAll(); } catch(_){}
  }

  function boot(){
    const c = C(); if (!c){ setTimeout(boot, 200); return; }
    // Only react when the user changes selection or releases the mouse.
    c.on('selection:created', ()=> setTimeout(bumpSelected,0));
    c.on('selection:updated', ()=> setTimeout(bumpSelected,0));
    c.on('mouse:up',          ()=> setTimeout(bumpSelected,0));
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();

/* ========== RA_CURVED_FLOW_GUARD_UI_v3 — require “Add Text” before Curved (UI-only, no canvas edits) ========== */
(()=>{
  if (window.__RA_CURVED_GUARD_UI_V3) return; window.__RA_CURVED_GUARD_UI_V3 = true;

  const C = ()=> window.canvas || null;

  function hasUserText(){
    const c = C(); if (!c) return false;
    const objs = (c.getObjects?.() || []);
    for (const o of objs){
      if (!o || o._isBase || false || o._raTokenId || o._raSys) continue;
      const t = (o.type||'').toLowerCase();
      if (t==='text' || t==='textbox' || t==='i-text') return true;
      if (t==='group'){
        try{
          if (o.getObjects().some(k => ((k.type||'').toLowerCase().includes('text')))) return true;
        }catch(_){}
      }
    }
    return false;
  }

  function findCustomTextCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent||''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }

  function findCurvedControl(card){
    if (!card) return null;
    // Label "Curved" with a checkbox or custom switch.
    const labels = Array.from(card.querySelectorAll('label')).filter(l => /curved/i.test(l.textContent||''));
    for (const lab of labels){
      const id = lab.getAttribute('for');
      if (id){
        const el = document.getElementById(id);
        if (el) return el;
      }
      const cb = lab.querySelector('input[type="checkbox"]');
      if (cb) return cb;
    }
    // Fall back to common “switch” patterns inside the Custom Text card
    return card.querySelector('[role="switch"], .switch, .toggle') || null;
  }

  function showInlineHint(anchor){
    let hint = document.getElementById('raCurvedHintInline');
    if (!hint){
      hint = document.createElement('div');
      hint.id = 'raCurvedHintInline';
      hint.textContent = 'Add Text first, then enable Curved.';
      hint.style.cssText = 'margin-top:6px;font-size:12px;color:#fbbf24;opacity:.95';
      (anchor?.parentElement || anchor || document.body).appendChild(hint);
    }
    clearTimeout(hint._t);
    hint.style.display = '';
    hint._t = setTimeout(()=>{ hint.style.display = 'none'; }, 1800);
  }

  function wire(){
    const card = findCustomTextCard(); if (!card){ setTimeout(wire, 300); return; }
    const ctl  = findCurvedControl(card); if (!ctl){ setTimeout(wire, 300); return; }

    const blockIfNoText = (ev)=>{
      if (hasUserText()) return;              // OK: already have a text object
      try{ ev.stopImmediatePropagation(); }catch(_){}
      try{ ev.preventDefault(); }catch(_){}
      // If it’s a real checkbox, keep the UI in the OFF state
      if ((ctl.tagName||'').toLowerCase()==='input' && ctl.type==='checkbox'){ ctl.checked = false; }
      showInlineHint(ctl);
    };

    // Capture-phase so we run before the app’s own handler
    ctl.addEventListener('change',      blockIfNoText, true);
    ctl.addEventListener('click',       blockIfNoText, true);
    ctl.addEventListener('pointerdown', blockIfNoText, true);
    ctl.addEventListener('keydown',     (e)=>{ if ((e.key===' '||e.key==='Enter') && !hasUserText()){ blockIfNoText(e); }}, true);
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire, { once:true });
  else wire();
})();

/* ========== RA_CURVED_PRE_FLUSH_UI_v1 — commit message box before Curved toggles (no canvas edits) ========== */
(()=>{
  if (window.__RA_CURVED_PRE_FLUSH_UI_V1) return; window.__RA_CURVED_PRE_FLUSH_UI_V1 = true;

  const C = ()=> window.canvas || null;

  function hasUserText(){
    const c = C(); if (!c) return false;
    const objs = (c.getObjects?.() || []);
    for (const o of objs){
      if (!o || o._isBase || false || o._raTokenId || o._raSys) continue;
      const t = (o.type||'').toLowerCase();
      if (t==='text' || t==='textbox' || t==='i-text') return true;
      if (t==='group'){
        try{ if (o.getObjects().some(ch => ((ch.type||'').toLowerCase().includes('text')))) return true; }catch(_){}
      }
    }
    return false;
  }

  function findCustomTextCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent||''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }
  function findMessageBox(card){
    return card && (card.querySelector('textarea') ||
                    card.querySelector('input[type="text"]') ||
                    card.querySelector('input:not([type])')) || null;
  }
  function findCurvedControl(card){
    if (!card) return null;
    const labels = Array.from(card.querySelectorAll('label')).filter(l => /curved/i.test(l.textContent||''));
    for (const lab of labels){
      const id = lab.getAttribute('for');
      if (id){ const el = document.getElementById(id); if (el) return el; }
      const cb = lab.querySelector('input[type="checkbox"]'); if (cb) return cb;
    }
    return card.querySelector('[role="switch"], .switch, .toggle') || null;
  }

  function flush(box){
    if (!box) return;
    try { box.dispatchEvent(new Event('input',  { bubbles:true })); } catch(_){}
    try { box.dispatchEvent(new Event('change', { bubbles:true })); } catch(_){}
  }

  function wire(){
    const card = findCustomTextCard(); if (!card){ setTimeout(wire, 300); return; }
    const curved = findCurvedControl(card); if (!curved){ setTimeout(wire, 300); return; }
    const box = findMessageBox(card);

    // Capture phase: run before the app’s own handler
    ['pointerdown','click','change','keydown'].forEach(ev=>{
      curved.addEventListener(ev, (e)=>{
        // Only pre‑commit when a text object already exists; if not, your other guard handles it.
        if (!hasUserText()) return;
        // Commit the latest message so Curved picks it up immediately
        flush(box);
      }, true);
    });
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire, { once:true });
  else wire();
})();

/* ========== RA_ADD_TEXT_PRIME_v1 — keep text visible after 'Add Text' ========== */
(() => {
  const C = () => window.canvas || null;

  // Find the Custom Text card + its pieces
  function findCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent || ''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }
  function findMsg(card){
    return card ? (card.querySelector('textarea, input[type="text"], input:not([type])') || null) : null;
  }
  function findAddBtn(card){
    if (!card) return null;
    return Array.from(card.querySelectorAll('button'))
      .find(b => /(^|\s)add\s*text(\s|$)/i.test(b.textContent || ''));
  }
  function findCurved(card){
    if (!card) return null;
    const cbs = Array.from(card.querySelectorAll('input[type="checkbox"]'));
    for (const cb of cbs){
      const lab = card.querySelector(`label[for="${cb.id}"]`) || cb.closest('label');
      const txt = (lab && lab.textContent ? lab.textContent : '').toLowerCase();
      if (txt.includes('curved')) return cb;
    }
    return null;
  }

  let LAST_TYPED = '';

  function nudge(el){
    try { el.dispatchEvent(new Event('input',  { bubbles:true })); } catch(_){}
    try { el.dispatchEvent(new Event('change', { bubbles:true })); } catch(_){}
  }
  function isSys(o){ return !!(o && (o._isBase || false || o._raSys || o._raTokenId)); }
  function newestUserObject(){
    const c = C(); if (!c) return null;
    const objs = c.getObjects ? c.getObjects() : [];
    for (let i = objs.length - 1; i >= 0; i--){
      const o = objs[i]; if (!o || isSys(o)) continue;
      return o;
    }
    return null;
  }

  function boot(){
    const card   = findCard();
    const msg    = findMsg(card);
    const addBtn = findAddBtn(card);
    const curved = findCurved(card);
    if (!card || !msg || !addBtn){ setTimeout(boot, 250); return; }

    // Remember last non-empty text the user typed
    if (!msg.__raRemember){
      msg.__raRemember = true;
      msg.addEventListener('input', ()=>{
        const v = (msg.value || '').trim();
        if (v) LAST_TYPED = v;
      }, true);
    }

    // After "Add Text", the app clears the box; put the text back and nudge
    if (!addBtn.__raPrime){
      addBtn.__raPrime = true;
      addBtn.addEventListener('click', ()=>{
        // Wait a moment for the app to add the object and clear the field
        setTimeout(()=>{
          if (!msg.value || !msg.value.trim()){
            if (LAST_TYPED){
              msg.value = LAST_TYPED;
              nudge(msg); // keep the new object from vanishing
            } else {
              // Fallback: read whatever text the app just added
              const o = newestUserObject();
              const t = (o && typeof o.text === 'string') ? o.text : '';
              if (t){ msg.value = t; nudge(msg); }
            }
          }
          // If Curved is already ON, select the newest object so it’s easy to move
          if (curved && curved.checked){
            const c = C(); const o = newestUserObject();
            if (c && o){ try{ c.setActiveObject(o); o.setCoords && o.setCoords(); c.requestRenderAll && c.requestRenderAll(); }catch(_){ } }
          }
        }, 30); // if it still blinks, bump to 60–80
      }, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();

/* ========== RA_CURVED_PRIME_v2 — keep message + text when toggling Curved ========== */
(() => {
  const C = () => window.canvas || null;
  const DELAY_MS = 60; // if you still see a blink, try 80 or 100

  function findCustomTextCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent || ''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }
  function findMsg(card){
    return card ? (card.querySelector('textarea, input[type="text"], input:not([type])') || null) : null;
  }
  function findCurved(card){
    if (!card) return null;
    const cbs = Array.from(card.querySelectorAll('input[type="checkbox"]'));
    for (const cb of cbs){
      const lab = card.querySelector(`label[for="${cb.id}"]`) || cb.closest('label');
      const txt = (lab && lab.textContent ? lab.textContent : '').toLowerCase();
      if (txt.includes('curved')) return cb;
    }
    return null;
  }
  function nudge(el){
    try { el.dispatchEvent(new Event('input',  { bubbles:true })); } catch(_){}
    try { el.dispatchEvent(new Event('change', { bubbles:true })); } catch(_){}
  }
  function isSys(o){ return !!(o && (o._isBase || false || o._raSys || o._raTokenId)); }
  function newestUserObject(){
    const c = C(); if (!c) return null;
    const objs = c.getObjects ? c.getObjects() : [];
    for (let i = objs.length - 1; i >= 0; i--){
      const o = objs[i]; if (!o || isSys(o)) continue;
      return o;
    }
    return null;
  }

  let LAST_TYPED = '';
  let WIRING_DONE = false;

  function boot(){
    const card   = findCustomTextCard();
    const msg    = findMsg(card);
    const curved = findCurved(card);
    if (!card || !msg || !curved){ setTimeout(boot, 250); return; }
    if (WIRING_DONE) return; WIRING_DONE = true;

    // Remember what you typed (so we can put it back after Curved rebuilds)
    msg.addEventListener('input', ()=>{
      const v = (msg.value || '').trim();
      if (v) LAST_TYPED = v;
    }, true);

    // When Curved toggles, the app rebuilds the text and often clears the box.
    curved.addEventListener('change', ()=>{
      const before = (msg.value || '').trim() || LAST_TYPED || '';
      setTimeout(() => {
        // If the app cleared the field, restore the text you typed and nudge the UI
        if (!msg.value || !msg.value.trim()){
          if (before){
            msg.value = before;
            nudge(msg);
          }
        }
        // Re-select the newest non-system object so it’s easy to move
        const c = C(); const o = newestUserObject();
        if (c && o){ try{ c.setActiveObject(o); o.setCoords && o.setCoords(); c.requestRenderAll && c.requestRenderAll(); }catch(_){ } }
      }, DELAY_MS);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();

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
    if (u.startsWith('ipfs://ipfs/')) return 'https://cloudflare-ipfs.com/ipfs/'+u.slice(12);
    if (u.startsWith('ipfs://'))      return 'https://cloudflare-ipfs.com/ipfs/'+u.slice(7);
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
    'saints of la': { address:'0xbEd2470deD2519c13EaaF3Bd970015ef404d3D20', chain:'ethereum' },
    'chumpz':       { address:'0xa9a1d086623475595a02991664742e4a1cbafcb8', chain:'apechain' }
  };

  // Quick map: contract → chain
  const CONTRACT_FOR = {
    '0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221': 'ethereum',
    '0xbed2470ded2519c13eaaf3bd970015ef404d3d20': 'ethereum',
    '0xa9a1d086623475595a02991664742e4a1cbafcb8': 'apechain'
  };

  const normHex = s => (s || '').toLowerCase();
  function slugFromChain(v){
  const x = (v || '').toString().toLowerCase().trim();
  if (x === '0x1'    || x === '1'    || x === 'eth' || x.includes('ether')) return 'ethereum';
  if (x === '0x2105' || x.includes('base'))                                 return 'base';
  if (x === '0x8173' || x.includes('ape'))                                  return 'apecoin';
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
    if (u.startsWith('ipfs://')) return 'https://cloudflare-ipfs.com/ipfs/' + u.replace('ipfs://','').replace(/^ipfs\//,'');
    if (u.startsWith('ar://'))   return 'https://arweave.net/' + u.replace('ar://','');
    return u;
  }

  async function fetchAsDataURL(url){
    const r = await fetch(url, { mode:'cors', cache:'no-store' });
    if (!r.ok) throw new Error('fetch failed');
    const b = await r.blob();
    return await new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(b);
    });
  }

  async function reservoirCandidates(contract, tokenId, chainSlug){
  let rsSlug = (chainSlug||'').toLowerCase();
  // standardize our internal slugs
  if (rsSlug === 'eth' || rsSlug === 'ether' || rsSlug === 'ethereum') rsSlug = 'ethereum';
  if (rsSlug === 'base') rsSlug = 'base';
  if (rsSlug === 'ape' || rsSlug === 'apechain' || rsSlug === 'apecoinchain') rsSlug = 'apechain';

  // choose correct host per chain (per Reservoir docs)
  // https://nft.reservoir.tools/reference/supported-chains
  const HOST = (
    rsSlug === 'apechain'  ? 'https://api-apechain.reservoir.tools' :
    rsSlug === 'base'      ? 'https://api-base.reservoir.tools'     :
                             'https://api.reservoir.tools'           // ethereum default
  );

  const url = `${HOST}/tokens/v7?media=true&tokens=${encodeURIComponent(`${contract}:${tokenId}`)}&limit=1`;
  const r = await fetch(url, { headers:{ accept:'application/json' }, cache:'no-store' });
  if (!r.ok) return [];
  const j = await r.json();
  const t = j?.tokens?.[0]?.token || {};
  const m = t.media || {};
  return [
    m?.original?.url || m?.original?.mediaUrl,
    t.imageLarge, t.image, t.imageUrl, t.imageSmall
  ].filter(Boolean).map(normalizeUrl);
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
    const sc = Math.min(cw/(img.width||cw), ch/(img.height||ch), 1);
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

if (!urls || !urls.length){
  alert('No image found for that token.');
  return;
}

    // 2) CORS‑safe path first (best for export)
    try { c.discardActiveObject(); } catch(_){}
    killOldBase(c);
    for (const u of urls){
      try{
        const data = await fetchAsDataURL(u);
        const img  = await loadViaDataURL(data);
        if (img){
          fitAndAddAsBase(img);
          // ...after fitAndAddAsBase(...)
annotateBase({ contract, chain, name: name || '' });
// no automatic label here — user controls it from “Token ID Styles”
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
    const btn = node.id && /loadbytoken|loadtoken/i.test(node.id);
    if (btn) return true;
    const t = (node.textContent || '').toLowerCase().replace(/\s+/g,' ');
    return /load[^a-z]*by[^a-z]*token|load[^a-z]*token[^a-z]*id/.test(t);
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

/* ============================================================
   RA_IPAD_STICKY_LAYOUT_V1
   iPad–only (NOT phones, NOT desktop) three–column sticky layout
   + animated sizing + portrait rotate hint overlay.

   WHAT IT DOES (iPad only):
     • Disables existing mobile flow CSS so layout doesn’t collapse.
     • Creates a horizontal non‑collapsing flex row:
          [ aside.panel.left ] [ main.stage ] [ aside.panel.right ]
     • Sidebars become sticky (independent scroll), middle column scrolls internally.
     • Responsive per orientation (portrait vs landscape) with smooth transitions (180ms).
     • Split view narrow widths auto‑shrink sidebars; horizontal scroll if still too narrow.
     • Portrait rotate overlay encourages landscape (daily “don’t show again” + session dismiss).
     • Respects prefers-reduced-motion (disables transitions / animation).
     • Safe revert / reapply / debug utilities:
         ipadLayoutRevert(), ipadLayoutApply(), ipadLayoutDebug()
       Force test on desktop: add ?forceIpad=1 to URL.

   DOES NOT TOUCH:
     • Desktop sticky layout (pointer:fine) you already added.
     • Phone (true mobile) layout & scripts.
   ============================================================ */
(function RA_IPAD_STICKY_LAYOUT_V1(){
  if (window.__RA_IPAD_STICKY_LAYOUT_V1__) return;
  window.__RA_IPAD_STICKY_LAYOUT_V1__ = true;

  /* ---------- Detection ---------- */
  function isIPad(){
    var ua = navigator.userAgent || '';
    var force = /[?&]forceIpad=1\b/i.test(location.search);
    if (force) return true;
    var legacy = /iPad/i.test(ua);
    var touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    var tabletBand = Math.min(screen.width, screen.height) >= 650; // exclude iPhones
    return (legacy || touchMac) && tabletBand;
  }
  if (!isIPad()) return; // Abort: not iPad

  /* ---------- Config Profiles ---------- */
  var PROFILE = {
    portrait: { sideBase:260, sideMin:250, sideMax:270, midMin:580, stickyTop:8 },
    landscape:{ sideBase:290, sideMin:280, sideMax:300, midMin:700, stickyTop:8 },
    narrow:   { sideBase:240, midMin:520, stickyTop:6 } // split view fallback
  };
  var TRANSITION_MS = 180;
  var EASE = 'cubic-bezier(.4,.14,.3,1)';

  /* ---------- Snapshot / State ---------- */
  var SNAP = {
    applied:false,
    parent:null,parentStyle:'',
    stage:null, stageStyle:'',
    left:null,leftStyle:'',
    right:null,rightStyle:'',
    canvasCard:null, canvasCardStyle:'',
    cssTag:null,
    mobileStyles:[],
    resizeHandler:null,
    orientHandler:null,
    animClass:'ipad-transition'
  };

  var MOBILE_STYLE_IDS = ['ra-mobile-flow-css-v29','ra-mobile-css-fit-v4-style'];

  /* ---------- Utilities ---------- */
  function disableMobileCSS(){
    MOBILE_STYLE_IDS.forEach(function(id){
      var el = document.getElementById(id);
      if (el && !el.__ipadDisabled){
        el.__ipadDisabled = { disabled: el.disabled };
        el.disabled = true;
        SNAP.mobileStyles.push(el);
      }
    });
  }
  function restoreMobileCSS(){
    SNAP.mobileStyles.forEach(function(el){
      if (el.__ipadDisabled){
        el.disabled = el.__ipadDisabled.disabled;
        delete el.__ipadDisabled;
      }
    });
  }
  function unfixCanvasCard(){
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
      ['position','top','left','right','width','zIndex','transform','margin'].forEach(function(p){ card.style[p]=''; });
      var ghost = document.getElementById('raCanvasGhost'); if (ghost) ghost.remove();
    }
  }
  function findNodes(){
    var stage = document.querySelector('main.stage');
    if (!stage) return null;
    var left  = document.querySelector('aside.panel.left');
    var right = document.querySelector('aside.panel.right');
    var parent = stage.parentElement;
    // Ascend if panels not direct siblings
    if (parent && (left || right)){
      var up = parent;
      while (up && up !== document.body){
        var allInside = true;
        [stage,left,right].forEach(function(n){
          if (n && !up.contains(n)) allInside = false;
        });
        if (allInside){ parent = up; break; }
        up = up.parentElement;
      }
    }
    return { parent:parent, stage:stage, left:left, right:right };
  }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function portrait(){ return window.innerHeight >= window.innerWidth; }

  /* ---------- CSS Injection ---------- */
  function injectCSS(){
    if (SNAP.cssTag) return;
    var st = document.createElement('style');
    st.id = 'ipadStickyLayoutCSS_V1';
    st.textContent =
      '/* iPad sticky layout */' +
      '.ipad-flex-host{display:flex!important;flex-wrap:nowrap!important;align-items:flex-start;gap:16px;overflow-x:auto;overflow-y:visible;}' +
      '.ipad-flex-host > aside.panel.left,' +
      '.ipad-flex-host > aside.panel.right{' +
        'flex:0 0 var(--ipad-side-width,260px);min-width:var(--ipad-side-width,260px);max-width:var(--ipad-side-width,260px);' +
        'box-sizing:border-box;position:sticky;top:var(--ipad-sticky-top,8px);' +
        'max-height:calc(100vh - var(--ipad-side-offset,16px));overflow:auto;scrollbar-width:thin;' +
        'background-clip:padding-box;' +
        'transition: width '+TRANSITION_MS+'ms '+EASE+', max-height '+TRANSITION_MS+'ms '+EASE+', top '+TRANSITION_MS+'ms '+EASE+';' +
      '}' +
      '.ipad-flex-host > main.stage{' +
        'flex:1 1 auto;min-width:var(--ipad-mid-min,600px);box-sizing:border-box;position:relative;' +
        'overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;' +
        'max-height:calc(100vh - var(--ipad-mid-offset,12px));' +
        'transition: max-height '+TRANSITION_MS+'ms '+EASE+', min-width '+TRANSITION_MS+'ms '+EASE+';' +
      '}' +
      /* Transitions toggle class */
      '.ipad-transition *,' +
      '.ipad-transition.ipad-flex-host > aside.panel.left,' +
      '.ipad-transition.ipad-flex-host > aside.panel.right,' +
      '.ipad-transition.ipad-flex-host > main.stage{' +
         'will-change:width,max-height,transform,opacity;' +
      '}' +
      /* Reduced motion */ +
      '@media (prefers-reduced-motion: reduce){' +
        '.ipad-transition *{transition:none!important;animation:none!important;}' +
      '}' +
      /* Optional subtle gradient edges for scroll hint */ +
      '.ipad-scroll-fade::after{' +
        'content:"";position:absolute;left:0;right:0;top:0;height:12px;pointer-events:none;' +
        'background:linear-gradient(to bottom,rgba(0,0,0,.25),rgba(0,0,0,0));' +
      '}' +
      '.ipad-scroll-fade::before{' +
        'content:"";position:absolute;left:0;right:0;bottom:0;height:14px;pointer-events:none;' +
        'background:linear-gradient(to top,rgba(0,0,0,.25),rgba(0,0,0,0));' +
      '}' +
      /* Hide original mobile stage host if present */ +
      '@media (pointer:coarse){#ra-mobile-stage-host,#ra-mobile-stage-frame{display:none!important;}}';
    document.head.appendChild(st);
    SNAP.cssTag = st;
  }

  /* ---------- Apply Layout ---------- */
  function applyStructure(){
    var nodes = findNodes();
    if (!nodes || !nodes.parent || !nodes.stage) return false;

    SNAP.parent = nodes.parent;
    SNAP.stage  = nodes.stage;
    SNAP.left   = nodes.left;
    SNAP.right  = nodes.right;

    if (SNAP.parentStyle === '') SNAP.parentStyle = SNAP.parent.getAttribute('style') || '';
    if (SNAP.stageStyle  === '') SNAP.stageStyle  = SNAP.stage.getAttribute('style')  || '';
    if (SNAP.left && SNAP.leftStyle === '')   SNAP.leftStyle  = SNAP.left.getAttribute('style')  || '';
    if (SNAP.right && SNAP.rightStyle === '') SNAP.rightStyle = SNAP.right.getAttribute('style') || '';

    SNAP.parent.classList.add('ipad-flex-host', SNAP.animClass);
    SNAP.parent.style.alignItems = 'flex-start';

    if (SNAP.stage){
      SNAP.stage.setAttribute('data-ipad-mid','1');
      SNAP.stage.classList.add('ipad-scroll-fade');
    }
    if (SNAP.left)  SNAP.left.setAttribute('data-ipad-side','1');
    if (SNAP.right) SNAP.right.setAttribute('data-ipad-side','1');

    return true;
  }

  /* ---------- Dimension / Orientation Logic ---------- */
  function computeProfile(){
    var w = window.innerWidth;
    var h = window.innerHeight;
    var isPortrait = portrait();
    var base = isPortrait ? PROFILE.portrait : PROFILE.landscape;
    // Narrow override: when split view or very narrow
    var narrowCut = 900;
    if (w < narrowCut){
      base = {
        sideBase: PROFILE.narrow.sideBase,
        sideMin: PROFILE.narrow.sideBase,
        sideMax: PROFILE.narrow.sideBase,
        midMin: PROFILE.narrow.midMin,
        stickyTop: PROFILE.narrow.stickyTop
      };
    }
    return { w:w, h:h, isPortrait:isPortrait, cfg:base };
  }

  function applyDimensions(animated){
    if (!SNAP.parent || !SNAP.stage) return;
    var info = computeProfile();
    var sideW = clamp(info.cfg.sideBase, info.cfg.sideMin, info.cfg.sideMax);
    var midMin = info.cfg.midMin;
    var stickyTop = info.cfg.stickyTop;

    // Set CSS custom props on parent for simpler formulas
    SNAP.parent.style.setProperty('--ipad-side-width', sideW+'px');
    SNAP.parent.style.setProperty('--ipad-mid-min', midMin+'px');
    SNAP.parent.style.setProperty('--ipad-sticky-top', stickyTop+'px');
    SNAP.parent.style.setProperty('--ipad-mid-offset','12px');
    SNAP.parent.style.setProperty('--ipad-side-offset','16px');

    // Horizontal overflow decision
    var totalMin = sideW * ((SNAP.left?1:0)+(SNAP.right?1:0)) + midMin + 16*2; // + gaps approx
    if (info.w < totalMin){
      SNAP.parent.style.overflowX = 'auto';
    } else {
      SNAP.parent.style.overflowX = 'auto'; // keep scroll if needed; consistent
    }

    if (animated){
      // Add transition class if not present
      SNAP.parent.classList.add(SNAP.animClass);
    }
  }

  /* ---------- Resize / Orientation Handlers ---------- */
  var resizeTimer = null;
  function scheduleResize(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      applyDimensions(true);
    }, 70);
  }
  function orientationHandler(){
    // Clear session portrait hint dismissal so overlay can re-show if user returns
    __ROTATE_HINT && __ROTATE_HINT.resetSession && __ROTATE_HINT.resetSession();
    setTimeout(function(){ applyDimensions(true); evaluateRotateHint(); }, 140);
  }

  /* ---------- Rotate Hint Overlay ---------- */
  var __ROTATE_HINT = (function(){
    var overlay, panel;
    var LS_KEY_BLOCK = 'ipadRotateHintBlockDay';
    var dismissedSession = false;

    function blockedToday(){
      try{
        var stamp = localStorage.getItem(LS_KEY_BLOCK);
        if (!stamp) return false;
        return stamp === new Date().toISOString().slice(0,10);
      }catch(_){ return false; }
    }
    function blockToday(){
      try{
        localStorage.setItem(LS_KEY_BLOCK, new Date().toISOString().slice(0,10));
      }catch(_){}
    }
    function build(){
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.id = 'ipadRotateHint';
      overlay.setAttribute('role','dialog');
      overlay.style.cssText = [
        'position:fixed','inset:0','z-index:999999','display:flex',
        'align-items:center','justify-content:center',
        'background:rgba(0,0,0,.38)','padding:env(safe-area-inset-top,12px) 16px 16px',
        'opacity:0','pointer-events:none','transition:opacity 160ms ease'
      ].join(';');
      panel = document.createElement('div');
      panel.style.cssText = [
        'background:#121418','color:#eef2f6','max-width:380px','width:100%',
        'border:1px solid #2b3138','border-radius:18px','padding:24px 22px',
        'box-shadow:0 10px 38px -6px rgba(0,0,0,.55),0 2px 6px -1px rgba(0,0,0,.4)',
        'font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
        'transform:translateY(8px)','opacity:0',
        'transition:opacity 180ms '+EASE+',transform 180ms '+EASE
      ].join(';');
      panel.innerHTML =
        '<div style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
          '<span style="font-size:24px;">🔄</span> Rotate for best experience' +
        '</div>' +
        '<div style="font-size:14px;opacity:.86;margin-bottom:18px;">Landscape gives you more editing space & keeps panels visible.</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
          '<button id="ipadHintOk" style="flex:1 1 auto;background:#2563eb;border:0;color:#fff;padding:10px 14px;border-radius:10px;font-weight:600;cursor:pointer;">Got it</button>' +
          '<button id="ipadHintDismiss" style="flex:1 1 auto;background:#1f242a;border:1px solid #343b44;color:#d1d5db;padding:10px 14px;border-radius:10px;cursor:pointer;">Dismiss</button>' +
          '<button id="ipadHintToday" style="flex:1 1 100%;background:#151a1f;border:1px solid #30363d;color:#9ca3af;padding:8px 12px;border-radius:10px;font-size:12px;cursor:pointer;">Don\'t show again today</button>' +
        '</div>';
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        overlay.style.transition='none';
        panel.style.transition='none';
      }

      overlay.addEventListener('click', function(e){ if (e.target === overlay) hide();});
      document.getElementById('ipadHintOk').onclick = hide;
      document.getElementById('ipadHintDismiss').onclick = function(){ dismissedSession = true; hide(); };
      document.getElementById('ipadHintToday').onclick = function(){ blockToday(); hide(); };
    }
    var showing = false;
    function show(){
      if (showing) return;
      build();
      showing = true;
      overlay.style.pointerEvents='auto';
      requestAnimationFrame(function(){
        overlay.style.opacity='1';
        panel.style.opacity='1';
        panel.style.transform='translateY(0)';
      });
    }
    function hide(){
      if (!showing) return;
      showing = false;
      overlay.style.opacity='0';
      overlay.style.pointerEvents='none';
      panel.style.opacity='0';
      panel.style.transform='translateY(8px)';
    }
    function evaluate(){
      if (!portrait()){ hide(); return; }
      if (blockedToday() || dismissedSession) { hide(); return; }
      show();
    }
    function resetSession(){ dismissedSession = false; }
    return { evaluate:evaluate, hide:hide, show:show, resetSession:resetSession };
  })();

  function evaluateRotateHint(){
    __ROTATE_HINT.evaluate();
  }

  /* ---------- Apply Entire Layout ---------- */
  function applyAll(){
    if (SNAP.applied) return;
    disableMobileCSS();
    unfixCanvasCard();
    injectCSS();
    var ok = applyStructure();
    if (!ok){ retry(); return; }
    applyDimensions(false);
    // Add transitions after first paint to avoid initial animation flash
    requestAnimationFrame(function(){ applyDimensions(true); });
    SNAP.applied = true;
    window.addEventListener('resize', scheduleResize, { passive:true });
    window.addEventListener('orientationchange', orientationHandler, { passive:true });
    evaluateRotateHint();
  }

  function retry(){
    var attempts = 0;
    var iv = setInterval(function(){
      if (attempts++ > 40){ clearInterval(iv); return; }
      var ok = applyStructure();
      if (ok){
        applyDimensions(false);
        requestAnimationFrame(function(){ applyDimensions(true); });
        SNAP.applied = true;
        window.addEventListener('resize', scheduleResize, { passive:true });
        window.addEventListener('orientationchange', orientationHandler, { passive:true });
        evaluateRotateHint();
        clearInterval(iv);
      }
    }, 150);
  }

  /* ---------- Revert ---------- */
  function revertAll(){
    if (!SNAP.applied) return;
    window.removeEventListener('resize', scheduleResize);
    window.removeEventListener('orientationchange', orientationHandler);

    if (SNAP.stage){
      if (SNAP.stageStyle === '') SNAP.stage.removeAttribute('style'); else SNAP.stage.setAttribute('style', SNAP.stageStyle);
      SNAP.stage.removeAttribute('data-ipad-mid');
      SNAP.stage.classList.remove('ipad-scroll-fade');
    }
    if (SNAP.left){
      if (SNAP.leftStyle === '') SNAP.left.removeAttribute('style'); else SNAP.left.setAttribute('style', SNAP.leftStyle);
      SNAP.left.removeAttribute('data-ipad-side');
    }
    if (SNAP.right){
      if (SNAP.rightStyle === '') SNAP.right.removeAttribute('style'); else SNAP.right.setAttribute('style', SNAP.rightStyle);
      SNAP.right.removeAttribute('data-ipad-side');
    }
    if (SNAP.parent){
      SNAP.parent.classList.remove('ipad-flex-host', SNAP.animClass);
      if (SNAP.parentStyle === '') SNAP.parent.removeAttribute('style'); else SNAP.parent.setAttribute('style', SNAP.parentStyle);
    }
    if (SNAP.canvasCard){
      if (SNAP.canvasCardStyle === '') SNAP.canvasCard.removeAttribute('style'); else SNAP.canvasCard.setAttribute('style', SNAP.canvasCardStyle);
    }
    restoreMobileCSS();
    SNAP.applied = false;
  }

  /* ---------- Debug ---------- */
  function debug(){
    var info = computeProfile();
    console.table([{
      width: info.w,
      height: info.h,
      portrait: info.isPortrait,
      sideBase: info.cfg.sideBase,
      midMin: info.cfg.midMin,
      stickyTop: info.cfg.stickyTop,
      applied: SNAP.applied
    }]);
    return { SNAP: SNAP, profile: info };
  }

  /* ---------- Public API ---------- */
  window.ipadLayoutApply = function(){ if (!SNAP.applied) applyAll(); };
  window.ipadLayoutRevert = revertAll;
  window.ipadLayoutDebug = debug;
  window.ipadRotateHintShow = function(){ __ROTATE_HINT.show(); };
  window.ipadRotateHintHide = function(){ __ROTATE_HINT.hide(); };

  /* ---------- Kickoff ---------- */
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', applyAll, { once:true });
  } else {
    applyAll();
  }
})();

/* ===============================================================
   RA_CANVAS_SIZE_500_ENHANCER_v1
   Adds a new 500 canvas size option WITHOUT changing existing defaults.
   - Inserts <option value="500">500</option> before 700 in #canvasSize select
   - Adds a quick button (id="raSize500") before the 700 button (if a 700 button is found)
   - Keeps 700 as the default (does NOT auto‑select 500)
   - Attempts normal setCanvasSize(500). If the original implementation rejects
     (e.g. whitelist), a fallback manual resize/scaling routine runs.
   - Safe to include multiple times (guarded); no effect on mobile/desktop logic.
   - Public helper: window.raSetCanvas500()

   To remove later: delete this whole block.
   =============================================================== */
(function RA_CANVAS_SIZE_500_ENHANCER_v1(){
  if (window.__RA_CANVAS_SIZE_500__) return;
  window.__RA_CANVAS_SIZE_500__ = true;

  const SIZE_VALUE = 500;
  const SIZE_LABEL = '500';

  function log(...a){ try{ console.log('[SIZE500]', ...a);}catch(_){} }

  function whenReady(fn){
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once:true });
    } else {
      fn();
    }
  }

  function getCanvas(){
    return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  }

  /* -------- 1. Insert into the size <select id="canvasSize"> -------- */
  function insertSelectOption(){
    const sel = document.getElementById('canvasSize');
    if (!sel) { log('No #canvasSize select found yet. Retrying…'); return false; }

    // Avoid duplicate
    if ([...sel.options].some(o => parseInt(o.value,10) === SIZE_VALUE)){
      log('Option already present.');
      return true;
    }

    // Find the 700 option to insert before
    const before = [...sel.options].find(o => o.value === '700');
    const opt = document.createElement('option');
    opt.value = String(SIZE_VALUE);
    opt.textContent = SIZE_LABEL;

    if (before && before.parentNode === sel){
      sel.insertBefore(opt, before);
    } else {
      // fallback: append at top
      sel.insertBefore(opt, sel.firstChild);
    }
    log('Inserted 500 option.');
    return true;
  }

  /* -------- 2. Insert a quick button before the 700 button (if present) -------- */
  function insertQuickButton(){
    // Heuristic: look for a button whose textContent is '700'
    const btn700 = Array.from(document.querySelectorAll('button, .btn'))
      .find(b => b && b.textContent && b.textContent.trim() === '700');

    if (!btn700){
      log('700 button not found (maybe not rendered yet).');
      return false;
    }

    // Avoid duplicate
    if (document.getElementById('raSize500')){
      log('Quick button already exists.');
      return true;
    }

    const btn = document.createElement('button');
    btn.type='button';
    btn.id='raSize500';
    btn.textContent=SIZE_LABEL;
    btn.className = btn700.className || 'btn small';
    btn.style.minWidth = (btn.style.minWidth || '').includes('0') ? '' : btn.style.minWidth;
    btn.addEventListener('click', ()=> window.raSetCanvas500());

    btn700.parentNode.insertBefore(btn, btn700);
    log('Inserted quick 500 button.');
    return true;
  }

  /* -------- 3. Wrapper to set size 500 (normal path or fallback) -------- */
  function fallbackManualResize(){
    const c = getCanvas();
    if (!c) return;
    const oldW = c.getWidth ? c.getWidth() : 0;
    if (!oldW || oldW === SIZE_VALUE) return;

    const scale = SIZE_VALUE / oldW;
    try {
      c.getObjects().forEach(o=>{
        // Skip system / background objects similar to patterns in your code
        if (o._isBgRect || o._raSys) return;
        o.scaleX *= scale;
        o.scaleY *= scale;
        o.left   *= scale;
        o.top    *= scale;
        if (o.width && o.height && o.setCoords) o.setCoords();
      });
    } catch(e){
      log('Fallback scale error', e);
    }
    try {
      c.setWidth(SIZE_VALUE);
      c.setHeight(SIZE_VALUE);
    } catch(_) {}
    try { c.requestRenderAll(); } catch(_){}
    log('Applied manual fallback resize to 500.');
  }

  function canDetectRejection(){
    // If setCanvasSize source shows an explicit whitelist we can decide to fallback earlier
    try {
      if (typeof window.setCanvasSize !== 'function') return false;
      const src = window.setCanvasSize.toString();
      return /\b(700|900|1024|1200)\b/.test(src) && !/500\b/.test(src);
    } catch(_) { return false; }
  }

  function setSize500(){
    if (typeof window.setCanvasSize === 'function'){
      const before = getCanvas();
      const beforeW = before ? before.getWidth() : null;

      // Call original
      try { window.setCanvasSize(SIZE_VALUE); } catch(e){ log('Original setCanvasSize threw', e); }

      const after = getCanvas();
      const afterW = after ? after.getWidth() : null;

      // If not changed OR rejection likely, run fallback
      if (!afterW || afterW === beforeW || afterW !== SIZE_VALUE || canDetectRejection()){
        fallbackManualResize();
      } else {
        log('setCanvasSize accepted 500.');
      }
    } else {
      // setCanvasSize not defined yet: fallback now
      fallbackManualResize();
    }
  }

  window.raSetCanvas500 = setSize500;

  /* -------- 4. Initialization / retry loop -------- */
  function attemptSetup(tries=0){
    const okSel = insertSelectOption();
    const okBtn = insertQuickButton();
    if (okSel && okBtn){
      log('500 size UI ready.');
      return;
    }
    if (tries < 40){
      setTimeout(()=>attemptSetup(tries+1), 200);
    } else {
      log('Gave up attaching 500 size UI.');
    }
  }

  whenReady(attemptSetup);

  log('Enhancer loaded (will keep default size at 700).');
})();

/* ===============================================================
   RA_TOKEN_ID_LABEL_STABLE_V2
   Comprehensive stability patch for Token ID label:
     - Prevents duplicate / ghost instances after undo/redo
     - Ensures label stays selectable & bound to window.idLabel
     - Adds debounced history snapshots for moves & style changes
     - Rebinds after JSON restore & history operations
     - Provides manual repair & debug utilities
   Remove older RA_TOKEN_ID_HISTORY_FIX_V1 before adding this.
   =============================================================== */
(function RA_TOKEN_ID_LABEL_STABLE_V2(){
  if (window.__RA_TOKEN_ID_LABEL_STABLE_V2__) return;
  window.__RA_TOKEN_ID_LABEL_STABLE_V2__ = true;

  const DEBOUNCE_MS = 420;
  let moveTimer = null;
  let baselineSnapDone = false;
  let canvasReadyTimer = null;

  function C(){
    return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  }

  function log(){ /* Uncomment for debugging
    console.log('[TOKEN_ID_V2]', ...arguments);
  */ }

  /* ---------- Core Helpers ---------- */
  function tokenIdObjects(c){
    c = c || C();
    if (!c) return [];
    try { return (c.getObjects()||[]).filter(o=>o && o._raTokenId); } catch(_){ return []; }
  }

  function pickSurvivor(list){
    if (!list.length) return null;
    // Keep the topmost (last in stacking order)
    return list[list.length - 1];
  }

  function ensureSelectable(o){
    if (!o) return;
    o.selectable = true;
    o.evented = true;
    o.hasControls = true;
    if (typeof o.set === 'function'){
      try { o.set({ selectable:true, evented:true }); } catch(_){}
    }
  }

  function removeDuplicatesAndRebind(c){
    c = c || C();
    if (!c) return null;
    const list = tokenIdObjects(c);
    if (list.length === 0){
      if (window.idLabel && !c.contains(window.idLabel)){
        delete window.idLabel;
      }
      return null;
    }
    let keep = pickSurvivor(list);
    list.forEach(o=>{
      if (o !== keep){
        try { c.remove(o); } catch(_){}
      }
    });
    // Rebind global pointer
    window.idLabel = keep;
    keep._raTokenId = true;
    ensureSelectable(keep);
    try { c.requestRenderAll(); } catch(_){}
    return keep;
  }

  function repair(){
    const c = C(); if (!c) return;
    removeDuplicatesAndRebind(c);
  }

  /* ---------- History Snapshot Integration ---------- */
  function historyPushFn(){
    if (typeof window.forceSnapshot === 'function') return window.forceSnapshot;
    if (window.raHistory){
      if (typeof window.raHistory.forceSnapshot === 'function') return window.raHistory.forceSnapshot;
      if (typeof window.raHistory.push === 'function') return window.raHistory.push;
    }
    if (typeof window.push === 'function') return window.push;
    return null;
  }

  function snapshot(reason){
    const fn = historyPushFn();
    const c = C();
    if (!fn || !c) return;
    try {
      fn(reason);
    } catch(e){
      log('Snapshot error', e);
    }
  }

  function scheduleMoveSnapshot(){
    clearTimeout(moveTimer);
    moveTimer = setTimeout(()=> snapshot('Token ID Move'), DEBOUNCE_MS);
  }

  function baselineSnapshotOnce(){
    if (baselineSnapDone) return;
    baselineSnapDone = true;
    snapshot('Token ID Baseline');
  }

  /* ---------- Event Wiring on Canvas ---------- */
  function wireCanvas(c){
    if (!c || c.__raTokenIdV2Patched) return;
    c.__raTokenIdV2Patched = true;

    c.on('object:added', e=>{
      const o = e.target;
      if (o && o._raTokenId){
        removeDuplicatesAndRebind(c);
        baselineSnapshotOnce();
      } else {
        // After batch adds (undo/redo), do a microtask cleanup
        queueMicrotask(()=> removeDuplicatesAndRebind(c));
      }
    });

    c.on('object:removed', ()=>{
      queueMicrotask(()=> removeDuplicatesAndRebind(c));
    });

    c.on('object:modified', e=>{
      const o = e.target;
      if (o && o._raTokenId){
        ensureSelectable(o);
        removeDuplicatesAndRebind(c);
        scheduleMoveSnapshot();
      }
    });

    // If style panels update font/size/color via direct global idLabel →
    // we run a passive poll after render to ensure pointer validity.
    c.on('after:render', ()=>{
      if (window.idLabel && !c.contains(window.idLabel)){
        removeDuplicatesAndRebind(c);
      }
    });

    c.on('selection:created', ()=> {
      if (window.idLabel && !c.contains(window.idLabel)){
        removeDuplicatesAndRebind(c);
      }
    });
    c.on('selection:updated', ()=> {
      if (window.idLabel && !c.contains(window.idLabel)){
        removeDuplicatesAndRebind(c);
      }
    });

    // Periodic lightweight guard (stops after ~90s)
    let ticks = 0;
    function periodic(){
      if (ticks++ > 900) return;
      try { removeDuplicatesAndRebind(c); } catch(_){}
      setTimeout(periodic, 100);
    }
    setTimeout(periodic, 1000);
  }

  /* ---------- Undo / Redo Wrappers ---------- */
  function wrapUndoRedo(name){
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__raTokenIdV2Wrapped) return;
    window[name] = function(){
      const r = fn.apply(this, arguments);
      // Let restore finish then cleanup
      setTimeout(()=> { removeDuplicatesAndRebind(C()); }, 40);
      setTimeout(()=> { removeDuplicatesAndRebind(C()); }, 160); // second pass for async add bursts
      return r;
    };
    window[name].__raTokenIdV2Wrapped = true;
  }
  wrapUndoRedo('undo');
  wrapUndoRedo('redo');

  /* ---------- JSON Restore Hook (Heuristic) ---------- */
  // If your code dispatches a custom event after loadFromJSON, catch it
  window.addEventListener('ra-json-restored', ()=>{
    setTimeout(()=> removeDuplicatesAndRebind(C()), 50);
    setTimeout(()=> removeDuplicatesAndRebind(C()), 150);
  });

  /* ---------- Public Utilities ---------- */
  window.raTokenIdRepair = repair;
  window.raTokenIdDebug = function(){
    const c = C();
    const objs = tokenIdObjects(c);
    return {
      count: objs.length,
      hasGlobal: !!window.idLabel,
      globalOnCanvas: !!(window.idLabel && c && c.contains(window.idLabel)),
      objectIds: objs.map(o=>o.__uid || o.__internalId || o.id || '(no-id)')
    };
  };
  window.raTokenIdForceSnapshot = function(label){
    snapshot(label || 'Token ID Manual Snapshot');
  };
  window.raTokenIdSelect = function(){
    const c = C(); if (!c) return;
    const label = tokenIdObjects(c)[0];
    if (label){
      c.setActiveObject(label);
      c.requestRenderAll();
      return true;
    }
    return false;
  };

  /* ---------- Canvas Wait / Init ---------- */
  function waitCanvas(tries=0){
    const c = C();
    if (c){
      wireCanvas(c);
      // Initial cleanup passes
      setTimeout(()=> removeDuplicatesAndRebind(c), 30);
      setTimeout(()=> removeDuplicatesAndRebind(c), 120);
      return;
    }
    if (tries < 80){
      canvasReadyTimer = setTimeout(()=> waitCanvas(tries+1), 200);
    }
  }
  waitCanvas();

  /* ---------- Global Style Input Patching (Passive) ----------
     If your style inputs mutate idLabel directly, we tap into set calls here
     by defining a proxy once we have a valid object (light approach). */
  (function patchIdLabelSetter(){
    let applied = false;
    Object.defineProperty(window, '__raIdLabelProxyApplied', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: false
    });

    const check = ()=>{
      const c = C();
      if (!c) return;
      if (!window.idLabel || !c.contains(window.idLabel)) return;

      if (applied) return;
      applied = true;

      // Monkey-patch set() to auto snapshot on style changes
      if (typeof window.idLabel.set === 'function' && !window.idLabel.__raSetPatched){
        const origSet = window.idLabel.set;
        window.idLabel.set = function(k,v){
          const result = origSet.call(this, k, v);
            if (typeof k === 'string'){
              if (/font|fill|stroke|align|text|shadow|color|size/i.test(k)){
                scheduleMoveSnapshot();
              }
            } else if (k && typeof k === 'object'){
              const keys = Object.keys(k).join(',');
              if (/(font|fill|stroke|align|text|shadow|color|size)/i.test(keys)){
                scheduleMoveSnapshot();
              }
            }
          return result;
        };
        window.idLabel.__raSetPatched = true;
      }
    };

    // Poll a few times early; then rely on events
    let attempts = 0;
    function poll(){
      check();
      if (attempts++ < 50) setTimeout(poll, 200);
    }
    poll();

    // Also after each repair
    const origRepair = window.raTokenIdRepair;
    window.raTokenIdRepair = function(){
      origRepair();
      applied = false;
      setTimeout(check, 30);
    };
  })();

  log('Token ID Stable V2 patch initialized.');
})();

/* ===============================================================
   RA_UNLOCK_TOKEN_ID_FIX_V1
   Ensures "Unlock All" also unlocks the Token ID label (_raTokenId).
   =============================================================== */
(function RA_UNLOCK_TOKEN_ID_FIX_V1(){
  if (window.__RA_UNLOCK_TOKEN_ID_FIX_V1__) return;
  window.__RA_UNLOCK_TOKEN_ID_FIX_V1__ = true;

  function C(){
    return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  }

  function unlockTokenId(){
    const c = C(); if (!c) return;
    const label = (c.getObjects()||[]).find(o => o && o._raTokenId);
    if (!label) return;

    // Restore interactivity
    label.set({
      selectable: true,
      evented: true,
      hasControls: true,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false
    });

    // Some Fabric builds use per‑axis flags; ensure they’re cleared
    label.lockMovementX = label.lockMovementY =
      label.lockScalingX = label.lockScalingY =
      label.lockRotation = false;

    try {
      // Make sure it gets proper selection handles
      if (c.getActiveObject() !== label){
        c.setActiveObject(label);
      }
    } catch(_){}

    try { label.setCoords && label.setCoords(); } catch(_){}
    try { c.requestRenderAll(); } catch(_){}
  }

  function attach(){
    const btn = document.getElementById('unlockAll');
    if (!btn) {
      // Retry a few times if UI not yet built
      let tries = 0;
      const iv = setInterval(()=>{
        const b = document.getElementById('unlockAll');
        if (b){
          clearInterval(iv);
          attach();
        } else if (++tries > 40){
          clearInterval(iv);
        }
      }, 200);
      return;
    }

    // Add a secondary listener; run AFTER the original handler.
    btn.addEventListener('click', ()=>{
      // Let original listener finish its work first.
      setTimeout(unlockTokenId, 10);
    });

    // Provide a manual helper
    window.raUnlockTokenId = unlockTokenId;
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', attach, { once:true });
  } else {
    attach();
  }
})();

/* ===============================================================
   RA_PHONE_ROTATE_HINT_V1
   Portrait-only rotate suggestion overlay for PHONES (not iPad, not desktop).
   - Appears on phones (touch, non-iPad) in portrait orientation.
   - Encourages landscape usage for better canvas workspace.
   - Dismiss / Don't show again today options.
   - Force test: add ?forcePhone=1 to URL.
   - Public helpers: phoneRotateHintShow(), phoneRotateHintHide(), phoneRotateHintEval()
   =============================================================== */
(function RA_PHONE_ROTATE_HINT_V1(){
  if (window.__RA_PHONE_ROTATE_HINT_V1__) return;
  window.__RA_PHONE_ROTATE_HINT_V1__ = true;

  const LS_KEY_BLOCK = 'phoneRotateHintBlockDay';
  let dismissedSession = false;
  let overlay, panel;
  let resizeTimer = null;

  /* ---------------- Detection ---------------- */
  function isIPad(){
    const ua = navigator.userAgent;
    const legacy = /iPad/i.test(ua);
    const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    const tabletBand = Math.min(screen.width, screen.height) >= 650;
    return (legacy || touchMac) && tabletBand;
  }
  function isPhoneDevice(){
    if (/[?&]forcePhone=1\b/i.test(location.search)) return true;
    if (isIPad()) return false;
    const ua = navigator.userAgent;
    const mobileUA = /(iPhone|Android.*Mobile|Mobile Safari|Mobile;|Pixel)/i.test(ua);
    const coarse = matchMedia('(pointer:coarse)').matches;
    // Heuristic: smaller min screen dimension to exclude tablets.
    const dimBand = Math.min(screen.width, screen.height) < 650;
    return coarse && mobileUA && dimBand;
  }
  function isPortrait(){
    return window.innerHeight >= window.innerWidth;
  }

  /* ---------------- Persistence ---------------- */
  function blockedToday(){
    try {
      const stamp = localStorage.getItem(LS_KEY_BLOCK);
      if (!stamp) return false;
      return stamp === new Date().toISOString().slice(0,10);
    } catch(_) { return false; }
  }
  function blockToday(){
    try {
      localStorage.setItem(LS_KEY_BLOCK, new Date().toISOString().slice(0,10));
    } catch(_) {}
  }

  /* ---------------- Build Overlay ---------------- */
  function build(){
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'phoneRotateHintOverlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-live','polite');
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:999999',
      'display:flex','align-items:center','justify-content:center',
      'background:rgba(0,0,0,.42)',
      'padding:env(safe-area-inset-top,12px) 16px 16px',
      'opacity:0','pointer-events:none',
      'transition:opacity 160ms ease'
    ].join(';');

    panel = document.createElement('div');
    panel.style.cssText = [
      'background:#121418','color:#eef2f6','width:100%','max-width:360px',
      'border:1px solid #2b3138','border-radius:18px','padding:22px 20px',
      'box-shadow:0 10px 32px -6px rgba(0,0,0,.55),0 2px 6px -1px rgba(0,0,0,.4)',
      'font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      'transform:translateY(8px)','opacity:0',
      'transition:opacity 180ms cubic-bezier(.4,.14,.3,1),transform 180ms cubic-bezier(.4,.14,.3,1)'
    ].join(';');

    panel.innerHTML =
      '<div style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
        '<span style="font-size:22px;">🔄</span> Rotate for best workspace' +
      '</div>' +
      '<div style="font-size:14px;opacity:.85;margin-bottom:18px;">Landscape gives more room for the canvas and panels.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
        '<button id="phoneHintOk" style="flex:1 1 auto;background:#2563eb;border:0;color:#fff;padding:10px 14px;border-radius:10px;font-weight:600;cursor:pointer;">Got it</button>' +
        '<button id="phoneHintDismiss" style="flex:1 1 auto;background:#1f242a;border:1px solid #343b44;color:#d1d5db;padding:10px 14px;border-radius:10px;cursor:pointer;">Dismiss</button>' +
        '<button id="phoneHintToday" style="flex:1 1 100%;background:#151a1f;border:1px solid #30363d;color:#9ca3af;padding:8px 12px;border-radius:10px;font-size:12px;cursor:pointer;">Don\'t show again today</button>' +
      '</div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      overlay.style.transition='none';
      panel.style.transition='none';
    }

    overlay.addEventListener('click', e=>{
      if (e.target === overlay) hide();
    });

    document.getElementById('phoneHintOk').onclick = hide;
    document.getElementById('phoneHintDismiss').onclick = function(){ dismissedSession = true; hide(); };
    document.getElementById('phoneHintToday').onclick = function(){ blockToday(); hide(); };
  }

  let showing = false;
  function show(){
    if (showing) return;
    build();
    showing = true;
    overlay.style.pointerEvents='auto';
    requestAnimationFrame(()=>{
      overlay.style.opacity='1';
      panel.style.opacity='1';
      panel.style.transform='translateY(0)';
    });
  }
  function hide(){
    if (!showing) return;
    showing = false;
    overlay.style.opacity='0';
    overlay.style.pointerEvents='none';
    panel.style.opacity='0';
    panel.style.transform='translateY(8px)';
  }

  /* ---------------- Evaluation Logic ---------------- */
  function evaluate(){
    if (!isPhoneDevice()){ hide(); return; }
    if (!isPortrait()){ hide(); return; }
    if (blockedToday() || dismissedSession){ hide(); return; }
    show();
  }

  function scheduleEvaluate(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(evaluate, 90);
  }

  window.addEventListener('resize', scheduleEvaluate, { passive:true });
  window.addEventListener('orientationchange', ()=>{
    // Re-allow hint after user rotates away then back.
    dismissedSession = false;
    setTimeout(evaluate, 140); // allow viewport settle
  }, { passive:true });

  // Public helpers
  window.phoneRotateHintShow = show;
  window.phoneRotateHintHide = hide;
  window.phoneRotateHintEval = evaluate;

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', evaluate, { once:true });
  } else {
    evaluate();
  }

  // Console note
  try {
    console.log('[PhoneRotateHint] Ready. Force show: phoneRotateHintShow(); force hide: phoneRotateHintHide();');
  } catch(_){}
})();

/* ===============================================================
   RA_CURVED_RADIUS_250_ONLY_V1
   Purpose: Force the Curved text feature to use Radius = 250 every time
            the "Curved" checkbox is turned ON (no other behavior changes).
   - Does NOT alter / add reversible logic.
   - Leaves existing curved / linear conversion code untouched.
   - Works by:
       1. Capturing the checkbox change event in the CAPTURE phase so
          we set the radius slider BEFORE the original handler runs.
       2. Fires input/change events so readUI() returns 250.
       3. After the curved object is created (which may be async),
          re‑enforces radius=250 a few times (40/120/240ms) in case
          legacy code overwrites it.
   - Public helper: window.raForceCurvedRadius250()
   - Safe to include multiple times (guarded).
   =============================================================== */
(function RA_CURVED_RADIUS_250_ONLY_V1(){
  if (window.__RA_CURVED_RADIUS_250_ONLY_V1__) return;
  window.__RA_CURVED_RADIUS_250_ONLY_V1__ = true;

  const TARGET_RADIUS = 250;

  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function log(){ /* Uncomment for debug:
    console.log('[CURVE250]', ...arguments); */ }

  /* ------------ DOM Finders ------------ */
  function findCustomTextCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent||''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }

  function findCurvedCheckbox(card){
    if (!card) return null;
    return Array.from(card.querySelectorAll('input[type="checkbox"]'))
      .find(cb=>{
        const lab = card.querySelector(`label[for="${cb.id}"]`) || cb.closest('label');
        return lab && /curved/i.test(lab.textContent||'');
      }) || null;
  }

  function findRadiusSlider(card){
    if (!card) return null;
    // Look for label containing "Radius"
    const lbl = Array.from(card.querySelectorAll('label,span,div'))
      .find(el => /radius/i.test(el.textContent||''));
    if (lbl){
      let scope = lbl.parentElement;
      for (let i=0;i<4 && scope && !scope.querySelector('input[type="range"]');i++){
        scope = scope.parentElement;
      }
      if (scope){
        // Pick the first range with value >= 100 (likely the radius) else first
        const ranges = Array.from(scope.querySelectorAll('input[type="range"]'));
        const likely = ranges.find(r => parseInt(r.value,10) >= 100);
        return likely || ranges[0] || null;
      }
    }
    // Fallback: any range
    return card.querySelector('input[type="range"]');
  }

  function fireValueChange(el){
    if (!el) return;
    try { el.dispatchEvent(new Event('input',  { bubbles:true })); } catch(_){}
    try { el.dispatchEvent(new Event('change', { bubbles:true })); } catch(_){}
  }

  /* ------------ Radius Enforcement ------------ */
  function setRadiusOnSlider(card){
    const slider = findRadiusSlider(card);
    if (!slider) return false;
    if (parseInt(slider.value,10) !== TARGET_RADIUS){
      slider.value = TARGET_RADIUS;
      fireValueChange(slider);
      return true;
    }
    return false;
  }

  function isCurved(o){
    return !!(o && (o._raCurved || o.data?.raType === 'curvedText' || o.raCurve));
  }

  function enforceOnActive(){
    const c = C(); if (!c) return;
    const o = c.getActiveObject && c.getActiveObject();
    if (o && isCurved(o) && o.raCurve){
      if (o.raCurve.radius !== TARGET_RADIUS){
        // Rebuild positions quickly by mimicking existing build logic formula if possible
        o.raCurve.radius = TARGET_RADIUS;
        // If your original code has a function to reflow (e.g. reflectUI or updateCurved),
        // call it here. Otherwise we reposition children directly:
        const kids = o._objects || [];
        const { arc, start, spacing, inward } = o.raCurve;
        const text = o.raCurve.text || extractText(o);
        const chars = kids.length === text.length ? kids : null;
        if (chars){
          const N = chars.length || 1;
            const step = (N>1 ? arc/(N-1) : 0) + (spacing/Math.max(TARGET_RADIUS,1))*(180/Math.PI);
            const startDeg = start - arc/2;
            for (let i=0;i<N;i++){
              const ang = (startDeg + i*step) * Math.PI/180;
              const ch = chars[i];
              ch.left  = TARGET_RADIUS * Math.cos(ang);
              ch.top   = TARGET_RADIUS * Math.sin(ang);
              ch.angle = (startDeg + i*step) + (inward ? -90 : 90);
              ch.setCoords && ch.setCoords();
            }
          o.setCoords && o.setCoords();
          try { c.requestRenderAll(); } catch(_){}
        }
      }
    }
  }

  function extractText(curved){
    if (!curved) return '';
    if (curved.raCurve && curved.raCurve.text) return curved.raCurve.text;
    if (Array.isArray(curved._objects)){
      return curved._objects.map(ch => ch.text || '').join('');
    }
    return '';
  }

  function multiEnforce(card){
    // Set slider BEFORE original handler runs (capture), then re‑enforce after object creation
    setRadiusOnSlider(card);
    [40,120,240].forEach(delay=>{
      setTimeout(()=>{
        setRadiusOnSlider(card);
        enforceOnActive();
      }, delay);
    });
  }

  /* ------------ Wiring ------------ */
  function wire(){
    const card = findCustomTextCard();
    if (!card){ retry(); return; }
    const curvedCB = findCurvedCheckbox(card);
    if (!curvedCB){ retry(); return; }
    if (curvedCB.__raRadius250) return;
    curvedCB.__raRadius250 = true;

    // Capture-phase so we run BEFORE existing change handlers
    curvedCB.addEventListener('change', (e)=>{
      if (curvedCB.checked){
        multiEnforce(card);
      }
    }, true);

    log('Curved radius=250 enforcement wired.');
  }

  function retry(i=0){
    if (i>60) return;
    setTimeout(()=>wire(i+1), 250);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wire, { once:true });
  } else {
    wire();
  }

  /* ------------ Public Helper ------------ */
  window.raForceCurvedRadius250 = function(){
    const card = findCustomTextCard();
    if (!card) return;
    multiEnforce(card);
  };
})();

/* =========================================================
   RA BLUE BUTTONS v3 — tag original buttons (incl. “x”)
   - Works on desktop, iPad, and mobile
   - No layout changes; only adds classes for styling
   ========================================================= */
(function RA_BLUE_BUTTONS_V3(){
  if (window.__RA_BLUE_BUTTONS_V3__) return;
  window.__RA_BLUE_BUTTONS_V3__ = true;

  const qs  = (s,r)=> (r||document).querySelector(s);
  const qsa = (s,r)=> Array.from((r||document).querySelectorAll(s));

  const RIGHT = qs('aside.panel.right') || document;  // safe fallback

  // Map label -> class to add
  const RULES = [
    { re:/^\s*undo/i,          cls:'ra-blue-action' },
    { re:/^\s*redo/i,          cls:'ra-blue-action' },
    { re:/^\s*save\s*draft/i,  cls:'ra-blue-action' },
    { re:/^\s*restore\s*draft/i, cls:'ra-blue-action' }  // keep strong; change to ghost if you prefer
  ];

  function tagActionButtons(scope){
    const btns = qsa('button,[role="button"],.btn', scope);
    btns.forEach(b=>{
      const t = (b.textContent||'').trim();
      for (const r of RULES){
        if (r.re.test(t)) { b.classList.add(r.cls); break; }
      }
    });
  }

  function tagCloseX(scope){
    // Find a “History n / m …” line, then look nearby for a close control
    const nodes = qsa('*', scope);
    const historyLine = nodes.find(n => /history\s+\d+\s*\/\s*\d+/i.test((n.textContent||'')));
    const host = historyLine ? historyLine.parentElement : scope;

    // Candidates around the history line
    let cands = qsa('button,[role="button"],.btn,[class*="close"],[aria-label*="close"],[title*="close"]', host);
    // Prefer an element whose text is literally "x" or "×"
    let closeEl = cands.find(el => /^(x|×)$/i.test((el.textContent||'').trim()));
    if (!closeEl) {
      // Fallback: any element that clearly means “close/clear/dismiss”
      closeEl = cands.find(el => {
        const lab = (el.getAttribute('aria-label')||'').toLowerCase();
        const tit = (el.getAttribute('title')||'').toLowerCase();
        const txt = (el.textContent||'').trim().toLowerCase();
        return /close|clear|dismiss/.test(lab) || /close|clear|dismiss/.test(tit) || txt === 'x' || txt === '×';
      });
    }
    if (closeEl) closeEl.classList.add('ra-blue-ghost'); // or 'ra-blue-action' if you want it full blue
  }

  function apply(){
    tagActionButtons(RIGHT);
    tagCloseX(RIGHT);
  }

  // Run now + keep in sync as the panel updates
  const run = (()=> {
    let raf = 0;
    return ()=> { if (raf) return; raf = requestAnimationFrame(()=>{ raf=0; apply(); }); };
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once:true });
  } else {
    run();
  }

  new MutationObserver(run).observe(RIGHT, { childList:true, subtree:true });
})();

/* =========================================================
   RA GREEN TOKEN BUTTONS v1 — tag "Delete Token ID" & "Load Token ID"
   Works across desktop, iPad, and mobile; survives re-renders.
   ========================================================= */
(function RA_GREEN_TOKEN_BUTTONS_V1(){
  if (window.__RA_GREEN_TOKEN_BUTTONS_V1__) return;
  window.__RA_GREEN_TOKEN_BUTTONS_V1__ = true;

  const qs  = (s,r)=> (r||document).querySelector(s);
  const qsa = (s,r)=> Array.from((r||document).querySelectorAll(s));

  function tag(){
    const left = qs('aside.panel.left') || document;
    // Find the card/section that contains "Token ID Styles"
    const scopes = qsa('aside.panel.left .card, aside.panel.left section, aside.panel.left .panel, aside.panel.left');
    let host = left;
    for (const el of scopes){
      const txt = (el.textContent||'').toLowerCase();
      if (txt.includes('token id styles') || txt.includes('token id')) { host = el; break; }
    }

    // Tag the two buttons
    qsa('button,[role="button"],.btn', host).forEach(b=>{
      const t = (b.textContent||'').trim().toLowerCase();
      if (/^delete\s*token\s*id$/.test(t) || /^load\s*token\s*id$/.test(t)){
        b.classList.add('ra-green-action');
      }
    });
  }

  const run = (()=>{ let raf=0; return ()=>{ if (raf) return; raf=requestAnimationFrame(()=>{raf=0; tag();}); };})();
  if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', run, { once:true }); }
  else { run(); }

  new MutationObserver(run).observe(document.documentElement, { childList:true, subtree:true });
})();

/* ===== Mobile Dock Add‑on: Submit to Contest (non‑destructive) ===== */
(function () {
  const DOCK_SEL = '#raMobileDock';      // your mobile dock element
  const BTN_ID   = 'raDockSubmitBtn';    // id for our add-on button

  function findSubmitBtn() {
    // Try common ids/selectors first, then fall back to text match
    const guesses = [
      '#btnSubmitContest',
      '#submitContest',
      'button[data-action="submit-contest"]',
      'button#contestSubmit',
      'button[name="submit-contest"]'
    ];
    for (const sel of guesses) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return [...document.querySelectorAll('button, a[role="button"]')]
      .find(b => /submit/i.test(b.textContent || '') && /contest/i.test(b.textContent || ''));
  }

  function triggerSubmit() {
    const btn = findSubmitBtn();
    if (!btn) return false;
    btn.click();                 // use your existing handler/modal
    return true;
  }

  function openContest() {       // fallback if submit button not found
    try { window.location.href = '/contest/'; } catch {}
  }

  function ensureBtn(dock) {
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.className = 'dock-btn';
      btn.textContent = 'Submit';
      btn.title = 'Submit to Contest';
      dock.appendChild(btn);
      dock.classList.add('ra-has-contest');
    } else if (btn.parentElement !== dock) {
      dock.appendChild(btn);
    }
    btn.onclick = (e) => { e.preventDefault(); if (!triggerSubmit()) openContest(); };

    // ensure it’s visible on the right
    requestAnimationFrame(() => { try { dock.scrollLeft = dock.scrollWidth; } catch {} });
  }

  function init() {
    const dock = document.querySelector(DOCK_SEL);
    if (dock) ensureBtn(dock);
  }

  // Run now and re-run if the dock is re-rendered
  const obs = new MutationObserver(() => {
    if (!document.getElementById(BTN_ID) && document.querySelector(DOCK_SEL)) init();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

   /* =========================================================
   Export panel → compact "Submit to Contest" + "Open Contest"
   - Buttons sit together at the bottom-right of the Export card
   ========================================================= */
(function mountContestActions(){
  try {
    // Clean up any older versions
    ['raContestLink','raOpenContestBtn','raSendToContest','raSubmitToContest']
      .forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
    const oldRow = document.querySelector('.ra-contest-actions'); if (oldRow) oldRow.remove();

    // Find the right-side Export card
    const right = document.querySelector('aside.panel.right') || document.querySelector('.panel.right');
    if (!right) return;
    const exportCard =
      right.querySelector('.export, [data-card="export"]') ||
      Array.from(right.querySelectorAll('.card, section')).find(n => /export/i.test(n.textContent||'')) ||
      right;

    // Row that holds both buttons, aligned to the right
    const row = document.createElement('div');
    row.className = 'ra-contest-actions';

    // Submit button (compact)
    const submitBtn = document.createElement('button');
    submitBtn.id   = 'raSubmitToContest';
    submitBtn.type = 'button';
    submitBtn.className = 'ra-btn ra-primary';
    submitBtn.textContent = 'Submit to Contest';

    submitBtn.addEventListener('click', async () => {
      try {
        const canvas = document.getElementById('c'); // Fabric lower-canvas
        if (!canvas || typeof canvas.toDataURL !== 'function') {
          alert('Canvas not ready. Try again in a second.'); return;
        }

        const name    = prompt('Display name (shown on leaderboard):', '') || 'Anonymous';
        const caption = prompt('Caption (optional):', '') || '';
        const imageDataUrl = canvas.toDataURL('image/png');

        const r = await fetch('/api/contest/entry', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, caption, imageDataUrl })
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || 'Upload failed');

        alert('Submitted! Open the contest page to see your entry.');
      } catch (e) {
        alert('Submit failed: ' + (e && e.message || e));
      }
    });

    // Open contest button (compact)
    const openBtn = document.createElement('button');
    openBtn.id   = 'raOpenContestBtn';
    openBtn.type = 'button';
    openBtn.className = 'ra-btn ra-ghost';
    openBtn.textContent = 'Open Contest';
    openBtn.addEventListener('click', () => window.open('/contest', '_blank', 'noopener'));

    // Mount under the Export card (bottom)
    row.appendChild(openBtn);
    row.appendChild(submitBtn);
    exportCard.appendChild(row);
  } catch (e) {
    console.warn('Failed to mount contest actions:', e);
  }
})();

/* ===== Admin (/?admin=1): Expand/Collapse the "Published Overlays" section ===== */
(function addPublishedExpandToggle(){
  if (!/[?&]admin=1\b/.test(location.search)) return;

  function findRight(){ return document.querySelector('aside.panel.right') || document.querySelector('.panel.right'); }
  function findTitle() {
    const right = findRight(); if (!right) return null;
    return [...right.querySelectorAll('h1,h2,h3,.section-title')]
      .find(el => /Published Overlays/i.test(el.textContent || '')) || null;
  }

  function mount() {
    const title = findTitle();
    if (!title || title.__raExpandMounted) return;
    title.__raExpandMounted = true;

    const btn = document.createElement('button');
    btn.textContent = 'Show all';
    btn.style.cssText = 'margin-left:8px;font-size:12px;padding:2px 8px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:#1b2538;color:#e8eefc;cursor:pointer;';
    title.appendChild(btn);

    const section = title.closest('section,.card,.group,.panel-section') || title.parentElement;
    let expanded = false;
    const right = findRight();

    function apply() {
      if (expanded) {
        if (right) right.style.overflowY = 'visible';
        section.style.maxHeight = 'none';
        section.style.overflow = 'visible';
        btn.textContent = 'Collapse';
      } else {
        if (right) right.style.overflowY = 'auto';
        section.style.maxHeight = '60vh';
        section.style.overflow = 'auto';
        btn.textContent = 'Show all';
      }
    }
    btn.onclick = () => { expanded = !expanded; apply(); };
    apply();
  }

  const mo = new MutationObserver(mount);
  mo.observe(document.body, { childList:true, subtree:true });
  mount();
})();

/* =========================================================
   LIVE PUBLISHED OVERLAYS (final polish)
   - 3‑column compact grid with internal scroll
   - Hides legacy "Published Overlays" label (not our (live) one)
   - Adds overlay centered & scaled smaller on canvas
   - Ensures tile labels use a readable light color
========================================================= */
(function(){
  // Pull overlays from the live API
  async function fetchLivePack(){
    try {
      const r = await fetch('/api/overlays', { cache: 'no-store' });
      if (!r.ok) return [];
      const j = await r.json().catch(()=>null);
      const arr = (j && Array.isArray(j.overlays)) ? j.overlays : [];
      return arr.filter(o => (o && (o.url || o.dataURL)));
    } catch { return []; }
  }

  // Right panel helper (covers your markup variants)
  function findRightPanel(){
    return document.querySelector('aside.panel.right')
        || document.querySelector('.panel.right')
        || document.querySelector('aside.right')
        || document.querySelector('aside')
        || document.body;
  }

  // Robustly hide the old static "Published Overlays" label (not the new "(live)" one)
  function hideLegacyPublishedLabel(){
    const right = findRightPanel();
    if (!right) return;
    const candidates = right.querySelectorAll('h1,h2,h3,h4,p,div,span,strong,em,.section-title');
    candidates.forEach(node => {
      const txt = (node.textContent || '').trim().toLowerCase();
      if (!txt) return;
      // match exact "published overlays" and ensure it's NOT inside our live section
      if (txt === 'published overlays' && !node.closest('#ra-live-overlays-sec')) {
        node.style.display = 'none';
      }
    });
  }

  // Create (or get) the live section and its grid
  function ensureLiveSection(){
    const right = findRightPanel();
    let section = document.getElementById('ra-live-overlays-sec');
    if (!section) {
      section = document.createElement('section');
      section.id = 'ra-live-overlays-sec';
      section.className = 'panel';
      section.style.border = '1px solid rgba(255,255,255,.12)';
      section.style.borderRadius = '10px';
      section.style.padding = '10px';
      section.style.margin = '12px 0';

      // insert under the main “Overlays” header if we can find it
      const overlaysHeader = [...document.querySelectorAll('h1,h2,h3,.section-title')]
        .find(h => /^\s*Overlays\b/i.test(h.textContent || ''));
      if (overlaysHeader?.parentElement) {
        overlaysHeader.parentElement.insertAdjacentElement('afterend', section);
      } else {
        right.appendChild(section);
      }

      const head = document.createElement('h3');
      head.textContent = 'Published Overlays (live)';
      head.style.margin = '0 0 6px';
      head.style.fontSize = '13px';
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.id = 'ra-live-grid';
      // —— compact 3‑column grid + internal scroll (like the regular shelf)
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)'; // 3 columns
      grid.style.gap = '8px';
      grid.style.maxHeight = '320px';
      grid.style.overflow = 'auto';
      grid.style.padding = '6px';
      grid.style.border = '1px solid rgba(255,255,255,.08)';
      grid.style.background = '#0e1218';
      grid.style.borderRadius = '8px';
      // make sure text inside tiles is readable even if a parent enforces dark text
      grid.style.color = '#cfd8ee';
      section.appendChild(grid);
    }
    return document.getElementById('ra-live-grid');
  }

  // Add clicked overlay to the canvas (centered & scaled smaller)
  function addToCanvas(src, name){
    // If your builder exposes a helper, use it
    if (window.addOverlayFromURL) {
      window.addOverlayFromURL(src, { name });
      return;
    }
    // Fabric fallback
    const canv = window.canvas || window.c || window.fabricCanvas;
    if (window.fabric && canv && typeof canv.add === 'function') {
      fabric.Image.fromURL(src, (img) => {
        const cw = (canv.getWidth ? canv.getWidth() : canv.width)  || 700;
        const ch = (canv.getHeight ? canv.getHeight() : canv.height) || 700;

        // target smaller footprint: fit inside 55% of canvas dims
        const maxW = cw * 0.55;
        const maxH = ch * 0.55;
        const iw = img.width  || maxW;
        const ih = img.height || maxH;
        const scale = Math.min(maxW/iw, maxH/ih, 1);

        img.set({
          originX: 'center',
          originY: 'center',
          left: cw / 2,
          top:  ch / 2,
          selectable: true,
        });
        if (scale && scale !== 1) img.scale(scale);

        canv.add(img);
        canv.setActiveObject?.(img);
        canv.requestRenderAll?.();
      }, { crossOrigin: 'anonymous' });
    }
  }

  function escHtml(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function escAttr(s){ return escHtml(s).replace(/"/g,'&quot;'); }

  // Render tiles into the grid
  function render(list){
    const grid = ensureLiveSection();
    hideLegacyPublishedLabel();  // <— hide the old label whenever we render

    if (!list.length) {
      grid.innerHTML = '<div class="muted">No live overlays published yet.</div>';
      return;
    }

    grid.innerHTML = list.map(o => {
      const src  = o.url || o.dataURL;
      const name = o.name || 'overlay';
      return `
        <button class="ra-ov" title="${escAttr(name)}"
                style="appearance:none;border:0;background:none;padding:0;margin:0;cursor:pointer;">
          <img src="${escAttr(src)}" alt="${escAttr(name)}"
               style="width:100%;aspect-ratio:1/1;object-fit:contain;background:#0a0f14;border-radius:8px;display:block">
          <div style="font-size:11px;margin-top:4px;opacity:.9;color:#cfd8ee;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escHtml(name)}
          </div>
        </button>`;
    }).join('');

    // click -> add to canvas (centered & scaled)
    grid.querySelectorAll('.ra-ov img').forEach(img => {
      img.addEventListener('click', () => addToCanvas(img.src, img.alt));
    });
  }

  // Public hook so you can refresh after publishing from Admin
  window.raReloadLiveOverlays = async function(){
    const pack = await fetchLivePack();
    render(pack);
  };

  // Initial run
  const run = () => setTimeout(window.raReloadLiveOverlays, 150);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

// ===== Rebel Ants: add footer on Builder if missing =====
(() => {
  // If a footer already exists (e.g., on contest), do nothing
  if (document.getElementById('ra-footer')) return;

  const footer = document.createElement('footer');
  footer.className = 'ra-site-footer';
  footer.id = 'ra-footer';

  // Your legal files are at project root per your screenshot
  footer.innerHTML = `
    <nav class="links">
      <a href="/contest/rules.html">Contest Rules</a>
      <a href="/contest/privacy.html">Privacy</a>
      <a href="/contest/terms.html">Terms</a>
      <a href="/contest/moderation.html">Moderation</a>
    </nav>
    <small>© Rebel Ants LLC</small>
  `;

  // Append after paint so it sits above any mobile dock
  requestAnimationFrame(() => document.body.appendChild(footer));
})();

// Lift the footer above the mobile dock on phones/tablets
(function(){
  try{
    const dock = document.querySelector('.ra-mobile-dock');
    const root = document.documentElement;

    function setOffset(){
      const h = dock ? (dock.offsetHeight || 0) : 0;
      root.style.setProperty('--dock-offset', (h ? h + 8 : 0) + 'px'); // +8px breathing room
    }

    if (dock){
      setOffset();
      window.addEventListener('resize', setOffset);
      new ResizeObserver(setOffset).observe(dock);
    }
  }catch(_){}
})();
