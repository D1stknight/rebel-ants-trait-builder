// ============================================================================
// 01-token-id-debug.js
// Original app.js lines 127-622 (496 lines)
// ============================================================================


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
  const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!r.ok) throw new Error('fetch failed');
  const b = await r.blob();
  return await new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(b);
  });
}

function normalize(u){
  if (!u) return null;
  if (u.startsWith("ipfs://"))
    return "https://gateway.pinata.cloud/ipfs/"+u.replace("ipfs://","").replace(/^ipfs\//,"");
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

  const s = String(u || "");

  // 1) Still block truly dangerous schemes
  if (/^\s*(javascript:|file:)/i.test(s)) return false;

  // 2) Explicitly allow our safe/expected cases
  if (/^data:image\//i.test(s)) return true;  // allow data:image/... base64 (our proxy prefetch)
  if (s.startsWith("/api/proxy-img?") || s.startsWith("/api/proxy-img2?")) return true; // allow our proxy endpoints

  // 3) Allow http(s) and same-origin relative paths
  try {
    const url = new URL(s, location.origin);
    return url.protocol === "http:" || url.protocol === "https:" || !/^[a-z][a-z0-9+\-.]*:/i.test(s);
  } catch (_){
    // Treat as relative unless it *looks* like a scheme
    return !/^[a-z][a-z0-9+\-.]*:/i.test(s);
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