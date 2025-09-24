(function(){
  /* ===============================
     CONFIG
     =============================== */
  ;(() => {
    // Prefer ?contract=… or window._RA_CONTRACT, else default to Rebel Ants
    const CONTRACT =
      new URLSearchParams(location.search).get('contract')
      || (window._RA_CONTRACT && String(window._RA_CONTRACT))
      || "0x96C1469c1C76E3Bb0e37c23a830d0Eea6BCf9221";

    const RESERVOIR = "https://api.reservoir.tools/tokens/v7?media=true&tokens=";

    // ---- ApeChain RPC default (only if not provided elsewhere)
    if (!window.__APECHAIN_RPC) {
      window.__APECHAIN_RPC = "https://rpc.apecoinchain.org";
    }

    // ---- Watermark...
    const __wmQS = new URLSearchParams(location.search).get('wm');
    let WM_SRC = isAllowedAssetURL(__wmQS) ? __wmQS : "/assets/watermark.png?v=wm10";

    (function checkWatermark(){
      const test = new Image();
      test.crossOrigin = "anonymous";
      test.onerror = () => { WM_SRC = "/watermark.png?v=wm10"; }; // fallback
      test.src = WM_SRC + (WM_SRC.includes("?") ? "&" : "?") + "t=" + Date.now();
    })();
  })();   // closes inner arrow IIFE
})();     // closes the outer IIFE  ✅

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

  /* ===== RA_CLEAR_PATCH_DELAYED_GUARD — preserve base/sys only if NO JSON restore follows ===== */
(function RA_CLEAR_PATCH_DELAYED_GUARD(){
  if (window.__RA_CLEAR_PATCH_DELAYED_GUARD__) return;
  window.__RA_CLEAR_PATCH_DELAYED_GUARD__ = true;

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  function patch(c){
    if (!c || c.__raClearPatched) return;
    const _clear = c.clear.bind(c);

    c.clear = function(){
      // snapshot objects we’d like to preserve on manual clears
      const keep = [];
      (this.getObjects?.()||[]).forEach(o=>{
        if (o && (o._isBase || o._raSys)) keep.push(o);
      });

      _clear(); // perform the real clear

      // If a JSON restore (Undo/Redo/Restore Draft) is happening, skip re-add.
      const me = this;
      setTimeout(()=>{
        if (window.__raLoadingJSON) return; // history is restoring; don’t fight it
        try { keep.forEach(o=> me.add(o)); } catch(_){}
        try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
        try { me.requestRenderAll(); } catch(_){}
      }, 80);
    };

    c.__raClearPatched = true;
  }

  (function wait(){ const c=C(); if (!c){ setTimeout(wait,120); return; } patch(c); })();
})();

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

  function bringInterfaceToFront(){
    if (idLabel) canvas.bringToFront(idLabel);
  }

/* ===== RA_LAYER_ORDER_ENFORCER — deterministic indices ===== */
(function(){
  if (window.__RA_LAYER_ORDER_ENFORCER__) return;
  window.__RA_LAYER_ORDER_ENFORCER__ = true;

  function getBase(c){
    const objs = c.getObjects() || [];
    return objs.find(o => o && o._isBase) || null;
  }

  window.raEnforceLayerOrder = function(){
    const c = window.canvas; if (!c) return;
    try{
      const objs = c.getObjects() || [];

      // 0) Make sure backgroundRect is locked and non-interactive
      if (typeof backgroundRect !== 'undefined' && backgroundRect){
        backgroundRect.selectable = false;
        backgroundRect.evented = false;
        backgroundRect.hasControls = false;
      }

      // 1) Background at index 0
      if (backgroundRect){
        const idx = objs.indexOf(backgroundRect);
        if (idx !== 0) c.moveTo(backgroundRect, 0);
      }

      // 2) Base at index 1
      const base = getBase(c);
      if (base){
        const target = backgroundRect ? 1 : 0;
        const idx = objs.indexOf(base);
        if (idx !== target) c.moveTo(base, target);
      }

      // 3) Overlays next (in their current relative order)
      let next = (backgroundRect ? 1 : 0) + (base ? 1 : 0);
      objs.filter(o => o && o._kind === 'overlay').forEach(o => {
        c.moveTo(o, next++);
      });

      // 4) System/UI elements on top (token label, footers, UI)
      objs.filter(o => o && (o._raSys || o._raTokenId)).forEach(o => {
        c.moveTo(o, next++);
      });

      c.requestRenderAll();
    }catch(_){}
  };
})();

/* (tiny helper used below — keep label above other UI if present) */
function bringInterfaceToFront(){
  try { if (typeof idLabel !== 'undefined' && idLabel) canvas.bringToFront(idLabel); } catch(_){}
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
  if (backgroundRect){ backgroundRect.set({ width:size, height:size }); canvas.sendToBack(backgroundRect); }
  canvas.getObjects().forEach(o=>{
    if (o === backgroundRect) return;
    o.scaleX *= sx; o.scaleY *= sy; o.left *= sx; o.top *= sy; o.setCoords();
  });
  canvas.setViewportTransform([1,0,0,1,0,0]);
  canvas.requestRenderAll();
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

// Place two corner stamps into a center-origin group
async function makeStampedGroup(img, bw, bh, wmWidthRatio){
  const wmTL = await fabricFromURL(WM_SRC);
  const wmBR = await fabricFromURL(WM_SRC);
  const wmTargetW = Math.max(16, bw * wmWidthRatio);
  const margin    = Math.max(6,  bw * 0.02);

  const scaleTL = wmTargetW / wmTL.width;
  const scaleBR = wmTargetW / wmBR.width;
  wmTL.scale(scaleTL); wmBR.scale(scaleBR);

  Object.assign(wmTL, {
    selectable:false, evented:false, hasControls:false,
    _isWatermark:true, raWM:true, raPos:"TL"
  });
  Object.assign(wmBR, {
    selectable:false, evented:false, hasControls:false,
    _isWatermark:true, raWM:true, raPos:"BR"
  });

  wmTL.set({
    originX:"center", originY:"center",
    left: -bw/2 + margin + wmTL.width*scaleTL/2,
    top:  -bh/2 + margin + wmTL.height*scaleTL/2
  });
  wmBR.set({
    originX:"center", originY:"center",
    left:  bw/2 - margin - wmBR.width*scaleBR/2,
    top:   bh/2 - margin - wmBR.height*scaleBR/2
  });

  const group = new fabric.Group([img, wmTL, wmBR], { originX:"center", originY:"center" });
  return group;
}

async function loadBaseImage(dataUrl, isToken){
  clearBaseOnly();
  const img = await fabricFromURL(dataUrl);
  img.set({ originX:"center", originY:"center" });

  // fit to canvas (no upscaling)
  const cw = canvas.getWidth(), ch = canvas.getHeight();
  const sc = Math.min(cw / img.width, ch / img.height, 1);
  img.scale(sc);

  const bw = img.width * sc, bh = img.height * sc;

  let obj;
  if (isToken) {
    // Token = RA (real asset) => NO watermarks
    img._isBase = true;
    lockBaseObject(img);
    img.set({ left:cw/2, top:ch/2 }); img.setCoords();
    obj = img;
  } else {
    // Non-token => add corner stamps
    const group = await makeStampedGroup(img, bw, bh, 0.15);
    group._isBase = true;
    lockBaseObject(group);
    group.set({ left:cw/2, top:ch/2 }); group.setCoords();
    obj = group;
  }

  canvas.add(obj);
  baseGroup = obj;
  bringInterfaceToFront();
  canvas.requestRenderAll();
}

// Add overlay (with small corner stamps unless permanent)
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

function addOrUpdateTokenLabel(id){
  const display = $("tokenIdDisplay");
  if (display) display.value = "#" + id;

  const fmtSel = $("idFormat"); const fmt = fmtSel ? fmtSel.value : "plain";
  const text = formatTokenId("#" + id, fmt);

  const style = {
    fontFamily: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    fontSize: parseInt((($("idSize")||{}).value)||"52",10),
    fill: (($("idColor")||{}).value) || "#ffffff",
    stroke: (($("idStrokeColor")||{}).value) || "transparent",
    strokeWidth: parseInt((($("idStrokeWidth")||{}).value)||"0",10),
  };

  if (!idLabel) {
    idLabel = new fabric.Text(text, {
      left: canvas.getWidth()/2,
      top:  40,
      originX: "center",
      originY: "top",
      textAlign: "center",
      editable: false,
      strokeUniform: true,
      paintFirst: "stroke",
      objectCaching: false,
      perPixelTargetFind: true,
      selectable: false,      // non-interactive
      evented: false,         // non-interactive
      hasControls: false,     // non-interactive
      ...style
    });
    idLabel._kind = 'tokenId';
    idLabel._raTokenId = true;
    idLabel._raSys     = true;
    canvas.add(idLabel);
  } else {
    idLabel.set({ text, ...style });
    idLabel._raTokenId = true;
    idLabel._raSys     = true;
  }

  // Recompute bounds and FORCE to very top
  idLabel.set({ width: undefined });
  if (idLabel.initDimensions) idLabel.initDimensions();
  idLabel.setCoords();

  try {
    const objs = canvas.getObjects() || [];
    canvas.bringToFront(idLabel);
    canvas.moveTo(idLabel, objs.length - 1);
  } catch(_) {}

  try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
  canvas.requestRenderAll();
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
// ===============================
//  DOM READY
// ===============================
document.addEventListener("DOMContentLoaded", () => {
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
  if (sizeEl) sizeEl.value = "700";
  setCanvasSize(parseInt(sizeEl ? sizeEl.value : "700", 10));
  setZoom(1);

  // >>> NEW: run once right after initial layout
  try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_) {}

  // >>> NEW: keep layers sane after *any* canvas change
  try {
    canvas.on('object:added',    () => { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); });
    canvas.on('object:modified', () => { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); });
    canvas.on('object:removed',  () => { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); });
  } catch(_) {}

  // --- keep the rest of your existing boot code below this line ---
  // Permanents → embed to the grid
  overlayList = (window.__EMBED_OVERLAYS__ || []).map(m => ({ name: m.name, src: m.src, perm: true }));
  renderOverlayGrid();

  // -------- Base image: local upload
  safeAddListener("baseUpload", "change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const data = await fileToDataURL(f);
    await loadBaseImage(data, false); // non-token => watermark
  });

  safeAddListener("clearUpload", "click", () => {
    const inp = $("baseUpload"); if (inp) inp.value = "";
    clearBaseOnly();
  });

  // ... any other startup listeners, buttons, etc. ...

});   // <-- closes DOMContentLoaded

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
  
/* ===== RA_HISTORY_STABILIZER ===== */
;(() => {
  if (window.__RA_HISTORY_STABILIZER__) return;
  window.__RA_HISTORY_STABILIZER__ = true;

  function stabilizeFew(){
    let tries = 0;
    const run = ()=>{
      try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
      try { window.canvas && window.canvas.requestRenderAll && window.canvas.requestRenderAll(); } catch(_){}
      if (++tries < 5) setTimeout(run, 60);
    };
    setTimeout(run, 60);
  }

  // Buttons by visible text
  document.addEventListener('click', (e)=>{
    const el = e.target && e.target.closest && e.target.closest('button, a, input[type="button"], input[type="submit"]');
    if (!el) return;
    const t = (el.textContent || el.value || '').toLowerCase().trim();
    if (/^(undo|redo|restore\s*draft|reload\s*draft|load\s*draft)$/.test(t)){
      stabilizeFew();
    }
  }, true);

  // Keyboard: Cmd/Ctrl+Z (and Shift+Cmd/Ctrl+Z)
  document.addEventListener('keydown', (e)=>{
    const z = e.key && e.key.toLowerCase() === 'z';
    if ((e.metaKey || e.ctrlKey) && z) stabilizeFew();
  }, true);
})();
  
 /* ===== RA_JSON_RESTORE_GUARD ===== */
(function RA_JSON_RESTORE_GUARD(){
  if (window.__RA_JSON_RESTORE_GUARD__) return;
  window.__RA_JSON_RESTORE_GUARD__ = true;

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  function patch(c){
    if (!c || c.__raPatchedLoadJSON) return;
    const orig = c.loadFromJSON.bind(c);

    c.loadFromJSON = function(json, cb, reviver){
      const next = (typeof cb === 'function') ? cb : function(){};
      window.__raLoadingJSON = true;
      const done = ()=>{
        window.__raLoadingJSON = false;
        try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
        try { c.requestRenderAll(); } catch(_){}
        next();
      };
      try { return orig(json, done, reviver); }
      catch(e){ window.__raLoadingJSON = false; throw e; }
    };

    c.__raPatchedLoadJSON = true;
  }

  (function wait(){ const c=C(); if (!c) return setTimeout(wait,120); patch(c); })();
})();

/* -------- Base image: load by token (multi-collection) --------
   Reads the selected collection’s contract from your dropdown and
   loads the token’s image via Reservoir (works for Chumpz, Saints, Rebel, etc.)
   UI ids expected:
     - collectionSelect  (or collectionKey)  ← your collection dropdown
     - tokenIdInput      ← input where you type the token id
     - tokenStatus       ← small <span> to show status text (optional)
     - loadToken         ← the “Load Token ID” button
*/
safeAddListener("loadToken","click", async ()=>{
  const statusEl = $("tokenStatus");
  const tokenId  = (($("tokenIdInput")||{}).value || "").trim();
  if (!tokenId){ if (statusEl) statusEl.textContent = "Enter a token ID."; return; }

  // Remember last loaded token for the Styles button
  try { window.__raTokenMemory = String(tokenId).replace(/[^0-9]/g,''); } catch(_){}

  // Find the contract for the currently selected collection
  function selectedContract(){
    const sel = $("collectionSelect") || $("collectionKey") || document.querySelector("[data-ra-collection-select]");
    const opt = sel?.selectedOptions?.[0];
    const fromData = opt?.dataset?.contract || opt?.getAttribute?.("data-contract");
    const val = (fromData || sel?.value || "").trim();

    // If the value already looks like an address, use it
    if (/^0x[a-fA-F0-9]{40}$/.test(val)) return val;

    // Otherwise try a global list if you have one (RA_COLLECTIONS, etc.)
    const list = (window.RA_COLLECTIONS && Array.isArray(window.RA_COLLECTIONS)) ? window.RA_COLLECTIONS : [];
    const hit  = list.find(x => x.key===val || x.slug===val || x.name===val);
    if (hit && (hit.address || hit.contract)) return (hit.address || hit.contract);

    // Safe fallback: your Rebel Ants contract
    return (typeof CONTRACT === "string" && CONTRACT) ? CONTRACT : "0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221";
  }

  const contract = selectedContract();

  if (statusEl) statusEl.textContent = "Fetching token…";
  try{
    // Uses your existing helper (already in your file)
    const imgUrl = await fetchImageByTokenId(contract, tokenId);
    if (!imgUrl){ if (statusEl) statusEl.textContent = "No image URL found."; return; }

    if (statusEl) statusEl.textContent = "Downloading image…";
    const data = await fetchAsDataURL(imgUrl);

    // Mark as token image (no watermarks) and load
    await loadBaseImage(data, true);

    // Tag the base object with the contract so watermark/branding logic can read it
    try{
      const objs = canvas.getObjects() || [];
      const base = objs.find(o => o._isBase && !o._isBgRect);
      if (base) base._tokenContract = contract;
    }catch(_){}

    if (statusEl) statusEl.textContent = "Loaded 👍";

    // Let any watermark/brand-footer listeners re-evaluate
    try { document.dispatchEvent(new Event("ra-wm-recalc")); } catch(_){}
    try { canvas.requestRenderAll(); } catch(_){}
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
safeAddListener("canvasSize","change", (e)=> setCanvasSize(parseInt(e.target.value,10)));
safeAddListener("clearBase","click", clearBaseOnly);
safeAddListener("clearCanvas","click", ()=>{
  raSafeClear(true);          // keep backgroundRect, clear everything else
  idLabel = null; baseGroup = null;
  // After UI clears, re-enforce order on idle so Undo/Restore isn't racing our redraw
  setTimeout(()=>{ try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_) {} }, 60);
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
    canvas.add(c).setActiveObject(c);
    canvas.requestRenderAll();
  });
});

safeAddListener("delete","click", ()=>{
  const o = canvas.getActiveObject();
  if (!o || o===backgroundRect || o._isBase) return;

  // If it’s the Token ID, clear the pointer so it won’t pop back
  try { if (o === idLabel) { idLabel = null; } } catch(_){}

  // Drop the selection layer first (prevents the tall ghost strip)
  try { canvas.discardActiveObject(); } catch(_){}

  canvas.remove(o);
  canvas.requestRenderAll();
});

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
  canvas.getObjects().forEach(o=>{
    if (o === backgroundRect || o._isBase) return; // keep these locked
    o.set({
      selectable:true, evented:true, hasControls:true,
      lockMovementX:false, lockMovementY:false,
      lockScalingX:false, lockScalingY:false,
      lockRotation:false
    });
  });
  canvas.requestRenderAll();
});

safeAddListener("clearAllOverlays","click", ()=>{
  canvas.getObjects().slice().forEach(o=>{ if (o._kind==='overlay') canvas.remove(o); });
  canvas.requestRenderAll();
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

/* -------- Keyboard (Delete/Backspace, Arrows, Cmd/Ctrl+D) -------- */
document.addEventListener("keydown", (e)=>{
  const tag = (e.target && e.target.tagName || "").toLowerCase();
  if (e.target && (e.target.isContentEditable || tag==="input" || tag==="textarea" || tag==="select")) return;

  const o = canvas.getActiveObject();

  // Delete selection
  if (o && (e.key==="Delete" || e.key==="Backspace")){
    if (!o._isBase && o!==backgroundRect){
      try { if (o === idLabel) { idLabel = null; } } catch(_){}
      try { canvas.discardActiveObject(); } catch(_){}
      canvas.remove(o);
      canvas.requestRenderAll();
    }
    e.preventDefault(); return;
  }

  // Duplicate
  if (o && ( (e.metaKey && e.key.toLowerCase()==="d") || (e.ctrlKey && e.key.toLowerCase()==="d") )){
    try {
      o.clone(cl=>{
        cl.set({ left:(o.left||0)+10, top:(o.top||0)+10 });
        canvas.add(cl); canvas.setActiveObject(cl); canvas.requestRenderAll();
      });
    } catch(_){}
    e.preventDefault(); return;
  }

  // Nudge
  const arrows = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"];
  if (o && arrows.includes(e.key)){
    const step = e.shiftKey ? 10 : 1;
    if (e.key==="ArrowLeft")  o.left -= step;
    if (e.key==="ArrowRight") o.left += step;
    if (e.key==="ArrowUp")    o.top  -= step;
    if (e.key==="ArrowDown")  o.top  += step;
    o.setCoords(); canvas.requestRenderAll();
    e.preventDefault();
  }
});

/* -------- SNAP + ALIGN UI (fixed to use window.canvas safely) -------- */
(function snapAlign(){
  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  // UI row (Center buttons + Snap toggle)
  const header = Array.from(document.querySelectorAll("h3")).find(h => (h.textContent||"").trim().toLowerCase()==="selection");
  const holder = header ? header.parentNode : document.body;

  if (!document.getElementById("raSnapRow")){
    const row = document.createElement("div");
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

    // Button wiring uses a fresh canvas reference each click
    document.getElementById("raSnapToggle").onclick = ()=>{
      window.__snapOn = !window.__snapOn;
      document.getElementById("raSnapToggle").textContent = "Snap: " + (window.__snapOn ? "On" : "Off");
    };
    function center(which){
      const c = C(); if (!c) return;
      const o = c.getActiveObject(); if(!o) return;
      if (which==="H" || which==="HV") o.left = c.getWidth()/2;
      if (which==="V" || which==="HV") o.top  = c.getHeight()/2;
      o.setCoords(); c.requestRenderAll();
    }
    document.getElementById("raCenterH").onclick  = ()=>center("H");
    document.getElementById("raCenterV").onclick  = ()=>center("V");
    document.getElementById("raCenterHV").onclick = ()=>center("HV");
  }

  window.__snapOn = true;

  // Fabric event wiring (only once per canvas instance)
  const c = C();
  if (!c) return; // canvas not ready yet — this IIFE is cheap and can re-run later if you call it
  if (c.__snapWired) return;
  c.__snapWired = true;

  function halfW(o){
    return (o.getScaledWidth ? o.getScaledWidth() : (o.width||0)*(o.scaleX||1)) / 2;
  }
  function halfH(o){
    return (o.getScaledHeight? o.getScaledHeight(): (o.height||0)*(o.scaleY||1)) / 2;
  }
  function clampSnap(o){
    if (!window.__snapOn) return;
    const tol = 8, cw=c.getWidth(), ch=c.getHeight();
    const hw=halfW(o), hh=halfH(o);
    // centers
    if (Math.abs(o.left - cw/2) <= tol) o.left = cw/2;
    if (Math.abs(o.top  - ch/2) <= tol) o.top  = ch/2;
    // edges
    if (Math.abs((o.left - hw) - 0)  <= tol) o.left = hw;
    if (Math.abs((o.left + hw) - cw) <= tol) o.left = cw - hw;
    if (Math.abs((o.top  - hh) - 0)  <= tol) o.top  = hh;
    if (Math.abs((o.top  + hh) - ch) <= tol) o.top  = ch - hh;
  }

  c.on("object:moving", e=>{ const o=e.target; if (!o) return; clampSnap(o); o.setCoords(); });
  c.on("mouse:up", ()=> c.requestRenderAll());
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

  // New-tab viewer (prevents Chrome navigating the current tab)
  safeAddListener("openNewTab", "click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Open the viewer
    raOpenNewTabViewer();
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

  // ---- Inline, popup-safe viewer that fits to the browser tab ----
  // Exposed globally so other code can reuse: window.raOpenNewTabViewer()
  window.raOpenNewTabViewer = function raOpenNewTabViewer(){
    if (!window.canvas){ alert("Canvas not ready"); return; }

    // Open a blank tab synchronously (avoids popup blockers)
    const win = window.open("", "_blank", "noopener");
    if (!win){ alert("Popup blocked. Allow popups for this site."); return; }

    // Minimal head+styles
    win.document.title = "Export";
    win.document.head.innerHTML = `
      <meta charset="utf-8">
      <title>Export</title>
      <style>
        html,body{height:100%;margin:0;background:#0b0c10;overflow:auto;}
        .viewer{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0c10;}
        img#raImg{
          display:block;
          max-width:calc(100vw - 32px);
          max-height:calc(100vh - 32px);
          width:auto;height:auto;
          box-shadow:0 8px 24px rgba(0,0,0,.5);
          border-radius:8px;
          image-rendering:auto;
        }
        .hud{
          position:fixed;left:50%;bottom:10px;transform:translateX(-50%);
          color:#e5e7eb;opacity:.75;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
          background:rgba(0,0,0,.35);padding:6px 8px;border-radius:6px;user-select:none
        }
      </style>
    `;
    win.document.body.innerHTML = `
      <div class="viewer"><img id="raImg" alt="export"/></div>
      <div class="hud">Click image to toggle: Fit ↔ Actual size</div>
    `;

    // Read export multiplier from UI (1..8), default 2
    const multEl = document.getElementById("exportMultiplier") || document.getElementById("exportQuality");
    let mult = 2;
    if (multEl){
      const v = parseInt((multEl.value||multEl.textContent||"").replace(/\D+/g,""),10);
      if (v && v>=1 && v<=8) mult = v;
    }

    try{
      const dataUrl = canvas.toDataURL({ format:"png", multiplier: mult, enableRetinaScaling:true });
      const img = win.document.getElementById("raImg");
      img.src = dataUrl;

      // Fit ↔ Actual size toggle
      let fit = true;
      function applyFit(){
        if (fit){
          img.style.maxWidth  = "calc(100vw - 32px)";
          img.style.maxHeight = "calc(100vh - 32px)";
          img.style.width = "auto";
          img.style.height = "auto";
        } else {
          img.style.maxWidth  = "none";
          img.style.maxHeight = "none";
          img.style.width = "auto";  // natural size
          img.style.height = "auto";
        }
      }
      img.addEventListener("click", ()=>{ fit = !fit; applyFit(); });
      applyFit();
    }catch(e){
      win.document.body.innerHTML =
        '<div style="padding:14px;font:14px/1.4 -apple-system,Segoe UI,Arial;color:#e5e7eb">' +
        'Export failed (CORS/security). Try a different image or use a CORS-enabled host.' +
        '</div>';
    }
  };
});  // <-- closes DOMContentLoaded

/* =========================
   RA_CANVAS_RESIZE_SYNC_ONLY_V8
   ========================= */
(function RA_CANVAS_RESIZE_SYNC_ONLY_V8(){
  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  function resizeCanvasAndScale(newSize){
    const c = C(); if (!c) return;
    newSize = parseInt(newSize, 10);
if (!isFinite(newSize)) return;
newSize = Math.max(400, Math.min(2000, newSize)); // clamp 400–2000 px

    const oldW = c.getWidth(), oldH = c.getHeight();
    if (!oldW || !oldH) return;

    if (oldW === newSize && oldH === newSize){
      try { c.setViewportTransform([1,0,0,1,0,0]); } catch(_) {}
      try { c.requestRenderAll(); } catch(_) {}
      return;
    }

    const s = newSize / oldW;
    const oldCenter = new fabric.Point(oldW/2, oldH/2);
    const newCenter = new fabric.Point(newSize/2, newSize/2);

    const objs = (c.getObjects() || []).slice();
    const info = objs.map(o => ({
      o,
      ctr: (typeof o.getCenterPoint === 'function') ? o.getCenterPoint() : new fabric.Point(o.left||0, o.top||0),
      sx: o.scaleX || 1,
      sy: o.scaleY || 1
    }));

    c.setWidth(newSize);
    c.setHeight(newSize);

    const bgRect = (window.backgroundRect && typeof window.backgroundRect.set === 'function') ? window.backgroundRect : null;
    if (bgRect) {
      try {
        bgRect.set({ width: newSize, height: newSize, left: 0, top: 0 });
        c.sendToBack(bgRect);
      } catch(_) {}
    }

    info.forEach(({o, ctr, sx, sy}) => {
      try {
        const vx = ctr.x - oldCenter.x;
        const vy = ctr.y - oldCenter.y;
        const nx = newCenter.x + vx * s;
        const ny = newCenter.y + vy * s;

        o.set({ scaleX: sx * s, scaleY: sy * s });
        if (typeof o.setPositionByOrigin === 'function') {
          o.setPositionByOrigin(new fabric.Point(nx, ny), 'center', 'center');
        } else {
          o.left = nx; o.top = ny;
        }
        o.setCoords();
      } catch(_) {}
    });

    try { c.setViewportTransform([1,0,0,1,0,0]); } catch(_) {}
    const zEl = document.getElementById('zoomVal'); if (zEl) zEl.textContent = '100%';
    try { c.requestRenderAll(); } catch(_) {}
  }

  window.raResizeCanvasAndScale = resizeCanvasAndScale;
  window.setCanvasSize = resizeCanvasAndScale;

  function wireSizeInput(){
    const el = document.getElementById('canvasSize');
    if (el && !el.__raBound) {
      el.__raBound = true;
      el.addEventListener('change', (e)=> resizeCanvasAndScale(parseInt(e.target.value, 10)));
    }
  }

  function wireQuickButtons(){
    if (document.__raSizeCaptureOnly) return;
    document.__raSizeCaptureOnly = true;
    document.addEventListener('click', function(ev){
      const btn = ev.target && ev.target.closest && ev.target.closest('button');
      if (!btn) return;
      const t = (btn.textContent||'').trim();
      if (/^(700|900|1024|1200)$/i.test(t)) {
        ev.preventDefault(); ev.stopImmediatePropagation(); ev.stopPropagation();
        resizeCanvasAndScale(parseInt(t, 10));
      }
    }, true);
  }

  function boot(){ wireSizeInput(); wireQuickButtons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* ==========================================================
   RA_FIXED_CENTER_CANVAS_V1
   ========================================================== */
(function RA_FIXED_CENTER_CANVAS_V1(){
  function byId(id){ return document.getElementById(id); }
  function getCanvasCard(){
    const c = byId('c');
    if (!c) return null;
    return c.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper') || c.parentElement;
  }

  function install(){
    const card = getCanvasCard();
    if (!card) { setTimeout(install, 200); return; }
    if (card.__raFixedCenter) return;
    card.__raFixedCenter = true;

    const ghost = document.createElement('div');
    ghost.id = 'raCanvasGhost';
    ghost.style.width = card.offsetWidth + 'px';
    ghost.style.height = card.offsetHeight + 'px';
    ghost.style.visibility = 'hidden';
    ghost.style.pointerEvents = 'none';
    card.parentNode.insertBefore(ghost, card);

    Object.assign(card.style, {
      position: 'fixed',
      zIndex: 4,
      margin: 0,
      left: '0px',
      top:  '0px',
      right:'auto',
      transform: 'none'
    });

    function place(){
      const rect = ghost.getBoundingClientRect();
      card.style.width = rect.width + 'px';
      card.style.left  = rect.left + 'px';

      const h   = card.offsetHeight || rect.height;
      const top = Math.max(12, Math.round((window.innerHeight - h) / 2));
      card.style.top = top + 'px';
    }

    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    try { new ResizeObserver(place).observe(card); } catch(_) {}
    try { new ResizeObserver(place).observe(ghost); } catch(_) {}
    document.addEventListener('ra:canvas-ready', place);
    place();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();

/* =========================================
   RA_MOBILE_FLOW_v28  — MOBILE ONLY (≤900px)
   - Canvas sits IN THE PAGE FLOW as the first box above “Rebel Ant”
   - Hides the old stage container (kills rogue checkerboard)
   - Proper Konva scaling (stage.scale + content size) so overlays drag correctly
   - Desktop untouched (code is gated by max-width:900px)
   ========================================= */
(() => {
  const CSS = `
    @media (max-width: 900px){
      #ra-mobile-stage-host{
        order:-1; width:100%;
        display:flex; justify-content:center;
        margin:12px 0 8px;
      }
      #ra-mobile-stage-frame{
        width: min(92vw, 620px);
        aspect-ratio: 1 / 1;
        position: relative;
        border-radius: 12px;
        overflow: hidden;
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
      /* Don’t CSS-scale the Konva wrapper; we size it numerically from JS */
      #ra-mobile-stage-frame > .konvajs-content,
      #ra-mobile-stage-frame > canvas{
        position:absolute; top:0; left:0; border-radius:inherit;
      }
      /* Kill any old floaters on mobile */
      .ra-canvas-floater,[data-ra-role="stage-floater"]{ display:none !important; }
    }`;
  const mq = window.matchMedia('(max-width: 900px)');

  let applied = false;
  let styleEl, host, frame, checker, live, origRoot, origRootDisplay;

  function $(q){ return document.querySelector(q); }
  function $$(q){ return Array.from(document.querySelectorAll(q)); }

  function findLive(){
    // Konva wrapper or plain canvas (whichever is used)
    return $('.konvajs-content') || $('#app canvas, .app canvas, main canvas');
  }
  function findUploadCard(){
    const h = $$('h1,h2,h3').find(n => /rebel\s*ant/i.test(n.textContent||''));
    return h ? (h.closest('.card, .panel, section, form, div') || h.parentElement) : null;
  }

  function fitStageIntoFrame(){
    if (!mq.matches || !window.stage || !frame) return;
    try{
      const baseW = window.stage.width();
      const baseH = window.stage.height();
      const side  = Math.max(baseW, baseH) || 1024;
      const target = frame.clientWidth;           // square frame

      // Scale the stage (Konva math, not CSS)
      const scale = target / side;
      window.stage.scale({ x: scale, y: scale });
      window.stage.position({ x: 0, y: 0 });

      // Make the DOM wrapper’s box match the visible size (keeps hit-testing correct)
      const content = window.stage.getContent();  // .konvajs-content
      content.style.width  = `${target}px`;
      content.style.height = `${target}px`;

      window.stage.batchDraw();
    }catch(e){}
  }

  function apply(){
    if (!mq.matches || applied) return;

    live = findLive();
    if (!live) return; // wait until canvas exists

    origRoot = live.parentElement;     // this is the old checkerboard container
    if (!origRoot) return;

    // build our in-flow host
    host = document.createElement('div');
    host.id = 'ra-mobile-stage-host';
    frame = document.createElement('div');
    frame.id = 'ra-mobile-stage-frame';
    checker = document.createElement('div');
    checker.id = 'ra-mobile-checker';
    frame.appendChild(checker);
    host.appendChild(frame);

    // insert BEFORE "Rebel Ant" card so it’s the first box
    const card = findUploadCard();
    const container = card?.parentElement || document.body;
    if (card) container.insertBefore(host, card); else container.prepend(host);

    // move live canvas into our frame
    frame.appendChild(live);

    // hide the old checkerboard container (this is the rogue strip you saw)
    origRootDisplay = origRoot.style.display;
    origRoot.style.display = 'none';

    // stop stage panning (base image stays put); overlays remain draggable
    try { window.stage?.draggable(false); } catch(e){}

    // size correctly now and on rotate/resize
    fitStageIntoFrame();

    applied = true;
  }

  function cleanup(){
    if (!applied) return;
    try{
      if (live && origRoot) origRoot.appendChild(live);
      if (origRoot) origRoot.style.display = origRootDisplay || '';
      host?.remove();
    }catch(e){}
    applied = false;
  }

  // — wiring —
  function kick(){
    if (mq.matches){ apply(); fitStageIntoFrame(); }
    else { cleanup(); }
  }

  // inject CSS once
  styleEl = document.getElementById('ra-mobile-flow-css-v28');
  if (!styleEl){
    styleEl = document.createElement('style');
    styleEl.id = 'ra-mobile-flow-css-v28';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  // react to DOM changes (token loads later)
  const mo = new MutationObserver(() => { if (mq.matches && !applied) apply(); });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('resize', fitStageIntoFrame, {passive:true});
  window.addEventListener('orientationchange', () => setTimeout(fitStageIntoFrame, 200), {passive:true});
  mq.addEventListener?.('change', () => kick());

  // first run
  kick();
})();

/* ====================== RA_mobile_css_fit_inflow_v3 (MOBILE ONLY) ======================
   Fixes mobile crash + keeps the drawing in normal page flow.
   - Removes the bad "$$('.', wrap)" line that crashed Safari.
   - Fits the stage to the phone width via CSS only (exports stay crisp).
   - Hides any stray checkerboard strips and the fixed-layout ghost if present.
   - Never touches desktop.
   ====================================================================== */
(() => {
  const MQ = '(max-width: 920px)';
  if (!window.matchMedia(MQ).matches || window.__RA_MOBILE_CSS_FIT_V3__) return;
  window.__RA_MOBILE_CSS_FIT_V3__ = true;

  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const  $ = (s, r=document)=>r.querySelector(s);

  function findStageCanvas(){
    const all = $$('canvas');
    if (!all.length) return null;
    // pick the intrinsically largest canvas — that's the drawing stage
    return all.reduce((a,b)=> (b.width > (a?.width||0) ? b : a), null);
  }

  function hideGhostsAndStrips(wrap){
    // Kill the fixed-center “ghost” if it exists (causes the huge blank gap)
    const ghost = document.getElementById('raCanvasGhost');
    if (ghost){
      ghost.style.display = 'none';
      ghost.style.height  = '0px';
      ghost.style.margin  = '0';
      ghost.style.padding = '0';
      ghost.setAttribute('data-ra-hidden-gap', '1');
    }

    // Collapse any checkerboard/empty siblings right around the stage block
    [wrap?.previousElementSibling, wrap?.nextElementSibling].forEach(el => {
      if (!el) return;
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

  function cssFit(){
    const stage = findStageCanvas();
    if (!stage) return;

    // Usually the stage’s parent div; fall back to the canvas itself
    const wrap = stage.parentElement || stage;

    // Intrinsic render size (used by export)
    const W = Math.max(1, stage.width);
    const H = Math.max(1, stage.height);

    // Available width inside page
    const host  = wrap.parentElement || document.body;
    const hostW = Math.max(320, host.clientWidth || window.innerWidth);
    const sidePad = 28; // layout breathing room
    const targetW = Math.min(W, hostW - sidePad);
    const scale   = Math.min(1, targetW / W);
    const dW      = Math.round(W * scale);
    const dH      = Math.round(H * scale);

    // View‑only sizing (do NOT change canvas.width/height)
    Object.assign(wrap.style, {
      width: dW + 'px',
      height: dH + 'px',
      maxWidth: '100%',
      margin: '0 auto 16px auto',
      position: 'relative'
    });

    // If the container holds multiple canvases (scene/hit), size them all
    $$('canvas', wrap).forEach(c => {
      c.style.width    = dW + 'px';
      c.style.height   = dH + 'px';
      c.style.maxWidth = '100%';
      c.style.display  = 'block';
    });

    hideGhostsAndStrips(wrap);
  }

  function bindLoadTriggers(){
    // Re-fit after real load actions
    const cards = $$('section,div').filter(n => (n.innerText||'').toLowerCase().includes('rebel ant'));
    cards.forEach(card => {
      $$('button', card).forEach(btn => {
        const t = (btn.textContent||'').toLowerCase().trim();
        if (t === 'load' || t === 'load by token' || t === 'clear upload'){
          if (!btn.__raFitBound){
            btn.__raFitBound = true;
            btn.addEventListener('click', () => setTimeout(cssFit, 60), {passive:true});
          }
        }
      });
      const file = $('input[type="file"]', card);
      if (file && !file.__raFitBound){
        file.__raFitBound = true;
        file.addEventListener('change', () => setTimeout(cssFit, 60), {passive:true});
      }
    });
  }

  // Observe DOM churns so the fit reapplies if the app re-renders
  new MutationObserver(() => { bindLoadTriggers(); cssFit(); })
    .observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('resize',           () => { if (window.matchMedia(MQ).matches) cssFit(); }, {passive:true});
  window.addEventListener('orientationchange',() => setTimeout(cssFit, 150), {passive:true});

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { bindLoadTriggers(); cssFit(); }, {once:true});
  } else {
    bindLoadTriggers(); cssFit();
  }

  // Minimal CSS (mobile only) to make sure hidden gaps stay hidden
  const s = document.createElement('style');
  s.textContent = `
    @media ${MQ} {
      [data-ra-hidden-gap="1"] { display:none !important; height:0 !important; margin:0 !important; padding:0 !important; }
    }
  `;
  document.head.appendChild(s);
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

/* ================= RA_FONT_PICKER_PREVIEW_V2 =================
   - Clean labels in the font dropdown (no long stacks shown).
   - Each option is styled with its font (works in most desktop browsers).
   - Live preview box below the picker updates instantly.
   - Applies to #fontFamily (Custom Text) and, if present, #idFontFamily.
   ============================================================ */
(function RA_FONT_PICKER_PREVIEW_V2(){
  // Curated, cross‑platform stacks (Mac + Windows + Linux fallbacks).
  // Add/remove families freely; the dropdown will rebuild automatically.
  const FONTS = [
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

    // System UI stack for a clean, modern default on any platform:
    { name:'System UI',           stack:"system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }
  ];

  const PICKER_IDS = ['fontFamily', 'idFontFamily']; // second one is optional in your UI

  function ensurePreviewBelow(picker, id){
    const prevId = 'raPreview_' + id;
    let box = document.getElementById(prevId);
    if (!box) {
      box = document.createElement('div');
      box.id = prevId;
      box.style.cssText = [
        'margin-top:6px',
        'padding:8px 10px',
        'border:1px solid #2a2a2e',
        'border-radius:8px',
        'background:#111319',
        'color:#e7e7ea',
        'font-size:15px',
        'line-height:1.35',
        'letter-spacing:.1px'
      ].join(';');
      const label = document.createElement('div');
      label.textContent = 'Preview';
      label.style.cssText = 'font-size:11px;opacity:.65;margin-bottom:4px';
      const text = document.createElement('div');
      text.className = 'raPreviewText';
      text.textContent = 'AaBbCc 1234  #RebelAnts';
      box.appendChild(label);
      box.appendChild(text);
      // insert right after the picker
      picker.parentNode.insertBefore(box, picker.nextSibling);
    }
    return box.querySelector('.raPreviewText');
  }

  function repopulateSelect(selectEl, id){
    // Preserve previously selected stack if it exists
    const current = (selectEl.value || '').trim();

    // Clear & rebuild options
    selectEl.innerHTML = '';
    FONTS.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.stack;         // what Fabric/text actually uses
      opt.textContent = f.name;    // what the user sees
      // Live preview in dropdown (supported in most desktop browsers)
      opt.style.fontFamily = f.stack;
      opt.style.fontSize   = '14px';
      selectEl.appendChild(opt);
    });

    // Keep selection if still available, otherwise default to first
    const found = FONTS.find(f => f.stack === current);
    selectEl.value = found ? found.stack : FONTS[0].stack;

    // Preview box under the picker
    const previewText = ensurePreviewBelow(selectEl, id);
    const updatePreview = () => {
      previewText.style.fontFamily = selectEl.value || FONTS[0].stack;
      // text already set; we just switch the font
    };

    // Wire once
    if (!selectEl.__raFontPreviewBound){
      selectEl.addEventListener('change', updatePreview);
      selectEl.addEventListener('input',  updatePreview);
      selectEl.__raFontPreviewBound = true;
    }
    updatePreview();
  }

  function apply(){
    PICKER_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.__raFontPreviewV2) return;
      el.__raFontPreviewV2 = true;

      if (el.tagName.toLowerCase() === 'select'){
        repopulateSelect(el, id);
      } else {
        // If your UI uses an <input> for fonts, just attach a preview box
        const previewText = ensurePreviewBelow(el, id);
        const update = () => { previewText.style.fontFamily = el.value || FONTS[0].stack; };
        el.addEventListener('input', update);
        el.addEventListener('change', update);
        update();
      }
    });
  }

  // Run now and watch for UI re-renders (defensive)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once:true });
  } else {
    apply();
  }
  new MutationObserver(apply).observe(document.documentElement, { childList:true, subtree:true });
})();

/* ============================ RA_WEBFONTS_LAZY_V1 ============================
   Adds Google web fonts to the existing font picker (and keeps live preview).
   - Injects a single Google Fonts CSS with many families (weights included).
   - Appends a <optgroup label="Web fonts"> to #fontFamily / #idFontFamily.
   - When you select a web font, waits for it to load, then re-renders Fabric.
   ========================================================================= */
(function RA_WEBFONTS_LAZY_V1(){
  // Configure your web fonts here (Google "family=" spec on the right)
  const WEB_FONTS = [
    { name:'Inter',             google:'Inter:wght@400;600;700' },
    { name:'Roboto',            google:'Roboto:wght@400;500;700' },
    { name:'Poppins',           google:'Poppins:wght@400;600;700' },
    { name:'Montserrat',        google:'Montserrat:wght@400;600;700' },
    { name:'Lato',              google:'Lato:wght@400;700' },
    { name:'Raleway',           google:'Raleway:wght@400;600;700' },
    { name:'Oswald',            google:'Oswald:wght@400;600;700' },
    { name:'Nunito',            google:'Nunito:wght@400;600;800' },
    { name:'Source Sans 3',     google:'Source+Sans+3:wght@400;600;700' },
    { name:'Merriweather',      google:'Merriweather:wght@400;700' },
    { name:'Playfair Display',  google:'Playfair+Display:wght@400;700' },
    { name:'Abril Fatface',     google:'Abril+Fatface' },
    { name:'Bebas Neue',        google:'Bebas+Neue' },
    { name:'Dancing Script',    google:'Dancing+Script:wght@400;600' },
    { name:'Pacifico',          google:'Pacifico' },
    { name:'Inconsolata',       google:'Inconsolata:wght@400;700' },
    { name:'Fira Code',         google:'Fira+Code:wght@400;600' },
    { name:'JetBrains Mono',    google:'JetBrains+Mono:wght@400;700' }
  ];

  const PICKERS = ['fontFamily','idFontFamily'];  // #idFontFamily is optional in your UI

  // -------- load Google Fonts CSS once
  function injectCssOnce(){
    if (document.getElementById('raWebFontsCSS')) return;
    const fam = WEB_FONTS.map(f => 'family=' + f.google).join('&');
    const href = 'https://fonts.googleapis.com/css2?' + fam + '&display=swap';

    // Preconnect (nice to have)
    if (!document.querySelector('link[rel="preconnect"][href*="fonts.gstatic"]')){
      const pre1 = document.createElement('link');
      pre1.rel = 'preconnect'; pre1.href = 'https://fonts.gstatic.com'; pre1.crossOrigin = 'anonymous';
      document.head.appendChild(pre1);
    }
    if (!document.querySelector('link[rel="preconnect"][href*="fonts.googleapis"]')){
      const pre2 = document.createElement('link');
      pre2.rel = 'preconnect'; pre2.href = 'https://fonts.googleapis.com';
      document.head.appendChild(pre2);
    }

    const link = document.createElement('link');
    link.id = 'raWebFontsCSS';
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);

    // After CSS parses & fonts load, nudge Fabric so metrics refresh
    const nudge = () => { try { window.canvas && window.canvas.requestRenderAll(); } catch(_){} };
    (document.fonts && document.fonts.ready ? document.fonts.ready.then(nudge) : Promise.resolve().then(nudge));
  }

  // Get a readable CSS stack for a given family (with sensible fallbacks)
  function stackFor(family){
    return `"${family}", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  }

  // Extract first family name from a stack (handles quotes)
  function firstFamily(stack){
    if (!stack) return '';
    const m = stack.match(/^["']?([^"',]+(?:\s[^"',]+)?)["']?/);
    return (m && m[1]) ? m[1].trim() : stack.split(',')[0].trim().replace(/^["']|["']$/g,'');
  }

  // Append an <optgroup> with all web fonts to a <select>
  function extendPicker(select){
    if (!select || select.tagName.toLowerCase() !== 'select') return;
    if (select.querySelector('optgroup[label="Web fonts"]')) return; // already extended

    const og = document.createElement('optgroup');
    og.label = 'Web fonts';
    WEB_FONTS.forEach(f => {
      const opt = document.createElement('option');
      opt.textContent = f.name;
      opt.value = stackFor(f.name);
      // style option with its own font (desktop browsers)
      opt.style.fontFamily = opt.value;
      opt.style.fontSize = '14px';
      og.appendChild(opt);
    });
    select.appendChild(og);

    // When a web font is chosen, wait for it to load then redraw Fabric
    if (!select.__raWebFontsBound){
      const onChange = async () => {
        const fam = firstFamily(select.value);
        try {
          if (document.fonts && fam) { await document.fonts.load(`48px "${fam}"`); }
        } catch(_){}
        try { window.canvas && window.canvas.requestRenderAll(); } catch(_){}
      };
      select.addEventListener('change', onChange);
      select.addEventListener('input', onChange);
      select.__raWebFontsBound = true;
    }
  }

  function apply(){
    injectCssOnce();
    PICKERS.forEach(id => {
      const el = document.getElementById(id);
      if (el) extendPicker(el);
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  } else {
    apply();
  }
  new MutationObserver(apply).observe(document.documentElement, { childList:true, subtree:true });
})();

/* ==========================================================
   RA_MAKE_VIDEO_TOKEN_ONLY_V1
   - Adds a bottom "Video (token-only)" panel.
   - Records a short WebM using an offscreen canvas (no layout changes).
   - Works only when the base image is a token (no watermark group).
   - Desktop & mobile safe. No changes to your Fabric canvas state.
   ========================================================== */
(() => {
  // ---------- Small helpers ----------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInOut = t => t<.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;

  function getFabricCanvas() {
    if (window.canvas && typeof window.canvas.toDataURL === 'function') return window.canvas;
    const el = $('canvas.lower-canvas') || $('canvas.upper-canvas') || $('canvas');
    if (!el) return null;
    // Try to find its Fabric instance
    for (const k in window) {
      try {
        const v = window[k];
        if (v && v.upperCanvasEl && typeof v.toDataURL === 'function') return v;
      } catch(_) {}
    }
    return null;
  }

  // Find the current base object and decide if it’s a token image (no corner stamps).
  function baseIsToken() {
    const c = getFabricCanvas();
    if (!c) return false;
    const base = (c.getObjects() || []).find(o => o && o._isBase === true);
    if (!base) return false;
    // Non-token path in your code builds a Group with two watermark children (raWM:true).
    // Token path uses a plain Image (no watermark group).
    if (base.type === 'image') return true;         // token (no watermarks)
    if (base.type === 'group') {
      const kids = (base._objects || []);
      const hasStamp = kids.some(k => k && (k.raWM || k._isWatermark || k.raPos));
      return !hasStamp; // if somehow no stamps, treat as token; but normally stamps exist
    }
    return false;
  }

  // Try to read a token id for naming (optional)
  function currentTokenId() {
    const box = $('#tokenIdDisplay') || $('#tokenIdInput');
    const raw = (box && (box.value || box.textContent) || '').trim();
    if (!raw) return '';
    const n = parseInt(raw.replace(/[^0-9]/g,''), 10);
    return Number.isFinite(n) ? String(n) : '';
  }

  // Snapshot the Fabric canvas as a high-quality PNG DataURL.
  // We upscale if needed to meet target size (multiplier capped to 3× for safety).
  function snapshotCanvasPNG(targetSide=720) {
    const c = getFabricCanvas();
    if (!c) throw new Error('Canvas not ready');
    const cw = c.getWidth(), ch = c.getHeight();
    const side = Math.max(cw, ch) || 1024;
    const mul = clamp(targetSide / side, 0.25, 3);
    // toDataURL ignores selection handles; exports clean artwork
    return c.toDataURL({ format:'png', enableRetinaScaling:true, multiplier: mul });
  }

  function chooseMimeType() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (const m of candidates) {
      if (MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    }
    return ''; // no support
  }

  // Draw a Ken Burns style frame
  function drawKenBurns(ctx, img, tNorm, res, mode) {
    const W = img.naturalWidth  || img.width;
    const H = img.naturalHeight || img.height;
    // Base "cover" scale so the square video is fully covered
    const cover = Math.max(res / W, res / H);

    // Style profiles
    const zoomIn  = { z0: 1.05, z1: 1.20, pan: 'none' };
    const zoomOut = { z0: 1.20, z1: 1.05, pan: 'none' };
    const panLR   = { z0: 1.12, z1: 1.12, pan: 'lr' };
    const panTB   = { z0: 1.12, z1: 1.12, pan: 'tb' };
    const drift   = { z0: 1.10, z1: 1.18, pan: 'diag' };

    const prof = ({in:zoomIn,out:zoomOut,lr:panLR,tb:panTB,drift:drift})[mode] || zoomIn;

    const e = easeInOut(tNorm);
    const zoom = prof.z0 + (prof.z1 - prof.z0) * e; // smooth zoom

    // Allowed pan range to keep image covering the square after scaling
    const scaledW = W * cover * zoom;
    const scaledH = H * cover * zoom;
    const maxX = Math.max(0, (scaledW - res) / 2);
    const maxY = Math.max(0, (scaledH - res) / 2);

    let shiftX = 0, shiftY = 0;
    if (prof.pan === 'lr')   shiftX = -maxX + 2*maxX*e;
    if (prof.pan === 'tb')   shiftY = -maxY + 2*maxY*e;
    if (prof.pan === 'diag') { shiftX = -maxX + 2*maxX*e; shiftY =  maxY - 2*maxY*e; }

    ctx.save();
    ctx.clearRect(0,0,res,res);
    ctx.translate(res/2 + shiftX, res/2 + shiftY);
    ctx.scale(cover*zoom, cover*zoom);
    ctx.drawImage(img, -W/2, -H/2);
    ctx.restore();
  }

  async function makeVideo({style='in', seconds=5, size=720, statusEl, linkEl, buttonEl}) {
    // Gate: token only
    if (!baseIsToken()) {
      if (statusEl) statusEl.textContent = 'Token-only: load a token image first.';
      return;
    }

    // Snapshot once (clean export of canvas content)
    let dataURL;
    try {
      if (statusEl) statusEl.textContent = 'Preparing snapshot…';
      dataURL = snapshotCanvasPNG(size);
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Snapshot blocked (CORS). Use images with CORS headers/same-origin.';
      return;
    }

    // Build offscreen canvas for animation + recording
    const res = parseInt(size, 10) || 720;
    const fps = 30;
    const totalFrames = Math.max(10, Math.round(seconds * fps));

    const off = document.createElement('canvas');
    off.width = res; off.height = res;
    const ctx = off.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const img = new Image();
    img.src = dataURL;
    await new Promise((r, j) => { img.onload = r; img.onerror = j; });

    // Setup MediaRecorder
    const mime = chooseMimeType();
    if (!mime) {
      if (statusEl) statusEl.textContent = 'This browser cannot record WebM (try Chrome/Edge).';
      return;
    }
    const stream = off.captureStream(fps);
    const chunks = [];
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: res >= 1024 ? 7_000_000 : (res >= 720 ? 5_000_000 : 3_500_000)
    });
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const doneP = new Promise(resolve => { rec.onstop = resolve; });

    // Animate & record
    if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = 'Rendering…'; }
    if (statusEl) statusEl.textContent = 'Rendering video…';

    rec.start();
    const t0 = performance.now();
    let f = 0;

    const modes = { 'Zoom In':'in', 'Zoom Out':'out', 'Pan L→R':'lr', 'Pan T→B':'tb', 'Drift':'drift' };
    const modeKey = modes[style] || style;

    // Frame loop
    function frameLoop(now) {
      const t = Math.min(1, (now - t0) / (seconds * 1000));
      drawKenBurns(ctx, img, t, res, modeKey);
      f++;
      if (t < 1) {
        requestAnimationFrame(frameLoop);
      } else {
        // Pad a couple of frames at the end for encoders that like a tail
        setTimeout(() => rec.stop(), 60);
      }
    }
    requestAnimationFrame(frameLoop);

    await doneP;

    // Build blob + link
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);

    const tid = currentTokenId();
    const niceName = `rebel-ant${tid?`-token-${tid}`:''}-${modeKey}-${res}.webm`;

    if (linkEl) {
      linkEl.href = url;
      linkEl.download = niceName;
      linkEl.style.display = 'inline-block';
      linkEl.textContent = `Download ${niceName}`;
    }
    if (statusEl) statusEl.textContent = `Done (${Math.round(blob.size/1024)} KB).`;

    if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = 'Make Video (Token Only)'; }
  }

  // ---------- UI Panel ----------
  function ensurePanel() {
    if ($('#raVideoPanel')) return $('#raVideoPanel');

    // Try to place under an "Animate" or "Animation" section if it exists; else append to the main content.
    const anchorCard =
      $$('h3,h2').find(h => /animate|animation/i.test((h.textContent||'').toLowerCase()))?.parentElement
      || $('main') || $('.content') || document.body;

    const pane = document.createElement('section');
    pane.id = 'raVideoPanel';
    pane.style.cssText = 'margin:16px 0 28px 0;border:1px solid #222;border-radius:12px;background:#0d0e13;color:#e7e7ea;padding:12px';
    pane.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;font:600 14px/1.2 -apple-system,Segoe UI,Roboto,Arial">Video (token‑only)</h3>
        <span id="raVMsg" style="font:12px/1.2 -apple-system,Segoe UI,Roboto,Arial;opacity:.75"></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <label style="font-size:12px;opacity:.9">Style
          <select id="raVStyle" class="input" style="margin-left:6px">
            <option>Zoom In</option>
            <option>Zoom Out</option>
            <option>Pan L→R</option>
            <option>Pan T→B</option>
            <option selected>Drift</option>
          </select>
        </label>
        <label style="font-size:12px;opacity:.9">Duration
          <select id="raVDur" class="input" style="margin-left:6px">
            <option>3</option>
            <option selected>5</option>
            <option>8</option>
          </select> s
        </label>
        <label style="font-size:12px;opacity:.9">Size
          <select id="raVRes" class="input" style="margin-left:6px">
            <option>512</option>
            <option selected>720</option>
            <option>1024</option>
          </select> px
        </label>
        <button id="raVMake" class="btn" style="margin-left:auto;background:#3b82f6;border:0;border-radius:8px;color:#fff;padding:8px 12px;cursor:pointer">Make Video (Token Only)</button>
        <a id="raVDown" href="#" download style="display:none;margin-left:8px;font-size:12px;text-decoration:underline">Download</a>
      </div>
      <div style="margin-top:8px;font-size:11px;opacity:.65">Tip: Works when your base image was loaded by <em>Token</em>. PNG/URL uploads are blocked from video on purpose.</div>
    `;
    anchorCard.appendChild(pane);

    // Wire button
    const makeBtn = $('#raVMake', pane);
    const msg     = $('#raVMsg', pane);
    const downLn  = $('#raVDown', pane);
    makeBtn.addEventListener('click', async () => {
      downLn.style.display = 'none';
      if (!baseIsToken()) {
        msg.textContent = 'Token-only: load a token image first.';
        return;
      }
      const style = ($('#raVStyle', pane)?.value || 'Drift');
      const secs  = parseInt(($('#raVDur', pane)?.value || '5'), 10);
      const size  = parseInt(($('#raVRes', pane)?.value || '720'), 10);
      await makeVideo({ style, seconds: secs, size, statusEl: msg, linkEl: downLn, buttonEl: makeBtn });
    });

    // Live gate hint: update the message whenever canvas mutates (cheap observer)
    const c = getFabricCanvas();
    if (c && !c.__raVideoGateWired) {
      c.__raVideoGateWired = true;
      c.on('object:added',   () => { if ($('#raVideoPanel')) $('#raVMsg').textContent = ''; });
      c.on('object:removed', () => { if ($('#raVideoPanel')) $('#raVMsg').textContent = ''; });
    }

    return pane;
  }

  // Boot after DOM is ready
  function boot() {
    try { ensurePanel(); } catch(_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();

/* ==========================================================
   RA_WATERMARK_SWITCH_FOUNDATION_V1  — add-only, safe no-op
   What this gives you:
   • One switch to turn ON watermarking for the "Make Video" flow (later).
   • Safe preloading of the watermark as a dataURL (avoids CORS issues).
   • Works with your existing token‑gated video flow.
   • Does nothing until you flip enableVideoWM to true.

   How to enable later (ONE change):
   1) In CONFIG below, change enableVideoWM: false  →  true
   2) Done. No other code edits needed.

   Optional: override watermark via ?wm=https://…/your.png (same as images)
   ========================================================== */
(() => {
  if (window.__RA_WM_BOOTED__) return;
  window.__RA_WM_BOOTED__ = true;

  // ---------- CONFIG (flip these later if you want the watermark) ----------
  const CONFIG = {
    enableVideoWM: false,       // ← flip to true when you want watermark in videos
    wmWidthRatio: 0.12,         // each corner stamp is 12% of the canvas width
    marginRatio:  0.02          // ~2% margin from edges
  };

  // ---------- Watermark loader (robust + CORS-safe) ----------
  const queryWM = new URLSearchParams(location.search).get('wm');
  const candidates = [
    queryWM,                             // highest priority if provided
    '/assets/watermark.png?v=wm10',      // your current primary
    '/watermark.png?v=wm10'              // fallback
  ].filter(Boolean);

  const STATE = {
    url: null,
    img: null,        // HTMLImageElement (decoded from dataURL)
    dataURL: null     // dataURL of the watermark (same-origin safe)
  };

  async function fetchAsDataURL(url){
    const r = await fetch(url, { cache:'no-store', mode:'cors' });
    if (!r.ok) throw new Error('fetch failed');
    const b = await r.blob();
    return await new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(b);
    });
  }

  async function loadWatermark(){
    for (const u of candidates){
      try{
        const data = await fetchAsDataURL(u);
        const img  = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.crossOrigin = 'anonymous';
          im.src = data;
        });
        STATE.url = u; STATE.img = img; STATE.dataURL = data;
        return true;
      }catch(_){/* try next */}
    }
    return false;
  }

  function wmBox(w, h){
    const wmW = Math.max(16, Math.round(w * CONFIG.wmWidthRatio));
    const wmH = Math.round(STATE.img.height * (wmW / STATE.img.width));
    const m   = Math.max(6,  Math.round(w * CONFIG.marginRatio));
    return { wmW, wmH, m };
  }

  // Expose a tiny helper if we ever need to paint on a 2D canvas directly (not used today)
  function paintWMOnCtx(ctx, w, h){
    if (!STATE.img) return;
    const { wmW, wmH, m } = wmBox(w, h);
    try {
      // TL
      ctx.drawImage(STATE.img, m, m, wmW, wmH);
      // BR
      ctx.drawImage(STATE.img, w - m - wmW, h - m - wmH, wmW, wmH);
    } catch(_){}
  }

  // ---------- Fabric helpers: add/remove TEMP watermark objects on the live canvas ----------
  function baseIsToken(){
    const c = window.canvas; if (!c) return false;
    const base = (c.getObjects()||[]).find(o => o._isBase);
    if (!base) return false;
    // In your app: token base = plain Image; upload base = Group (image + 2 small stamps)
    return (base.type === 'image');
  }

  function addTempFabricWM(){
    const c = window.canvas;
    if (!c || !window.fabric || !STATE.img) return null;

    const cw = c.getWidth(), ch = c.getHeight();
    const { wmW, wmH, m } = wmBox(cw, ch);

    // Create two watermark images
    const tl = new fabric.Image(STATE.img, {
      left: m, top: m, selectable: false, evented: false
    });
    const br = new fabric.Image(STATE.img, {
      left: cw - m - wmW, top: ch - m - wmH, selectable: false, evented: false
    });
    const sX = wmW / STATE.img.width, sY = wmH / STATE.img.height;
    tl.scaleX = sX; tl.scaleY = sY;
    br.scaleX = sX; br.scaleY = sY;

    // Tag them so we can cleanly remove later
    tl._raTmpWM = br._raTmpWM = true;

    c.add(tl); c.add(br); c.requestRenderAll();
    return [tl, br];
  }

  function removeTempFabricWM(){
    const c = window.canvas; if (!c) return;
    (c.getObjects()||[]).filter(o => o._raTmpWM).forEach(o => c.remove(o));
    c.requestRenderAll();
  }

  // ---------- Gentle hook for "Make Video" button (no-op until you flip the switch) ----------
  async function ensureWMReady(){ if (!STATE.img) await loadWatermark(); }

  function waitForVideoDone(timeoutMs=60000){
    return new Promise(resolve => {
      const obs = new MutationObserver(() => {
        // heuristic: look for a .webm download link or a status that says done
        const link = document.querySelector('a[download$=".webm"], a[href$=".webm"]');
        const stat = document.getElementById('raAnimStatus');
        if (link || /done|saved|complete/i.test((stat?.textContent||'').toLowerCase())){
          try{ obs.disconnect(); }catch(_){}
          resolve();
        }
      });
      obs.observe(document.body, { childList:true, subtree:true, characterData:true });
      setTimeout(() => { try{ obs.disconnect(); }catch(_){}
        resolve();
      }, timeoutMs);
    });
  }

  function hookMakeVideoButton(){
    if (!CONFIG.enableVideoWM) return; // ← stays dormant until you flip the switch

    // Intercept clicks on any button/link that looks like "Make Video"
    const labels = ['make video','render video','animate','make preview','create video'];
    document.addEventListener('click', async (e) => {
      const el = e.target && e.target.closest && e.target.closest('button, a');
      if (!el) return;

      const t = (el.textContent || el.value || '').toLowerCase().trim();
      if (!labels.some(k => t.includes(k))) return;   // not our button
      if (!window.canvas) return;
      if (!baseIsToken()) return;                      // keep token‑gated semantics

      // Prepare watermark image
      await ensureWMReady();
      if (!STATE.img) return; // nothing to add

      // Add temp WM objects, let the app's own handler run, then remove when done
      addTempFabricWM();          // we do NOT preventDefault; original click proceeds
      waitForVideoDone(60000).then(removeTempFabricWM);
    }, true); // capture=true so we add WM before the app starts recording frames
  }

  // Boot
  hookMakeVideoButton();

  // Expose tiny API for future use (optional)
  window.raWatermark = Object.freeze({
    options: CONFIG,
    url: () => STATE.url,
    dataURL: () => STATE.dataURL,
    img: () => STATE.img,
    ready: ensureWMReady,
    paintOnCtx: paintWMOnCtx,
    addTempFabricWM,
    removeTempFabricWM
  });
})();
/* ==========================================================
   RA_UNDO_REDO_SAFE_MINI_V1
   • Super‑safe: never restores anything unless you click Undo/Redo.
   • Records snapshots after edits only (add/move/scale/rotate/remove).
   • Coalesces bursts (clear / multi‑adds) into one step.
   • Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Ctrl+Y) wired.
   • If your old Undo/Redo buttons exist, it uses them.
     If not, it adds a small row under “Selection”.
   • Does NOT touch desktop/mobile layout or exports.
   ========================================================== */
(() => {
  if (window.__RA_UNDO_SAFE_V1__) return;
  window.__RA_UNDO_SAFE_V1__ = true;

  const MAX = 60;
  const DRAFT_KEY = 'ra_draft_v1';

  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const defer = (fn, ms=0)=>setTimeout(fn, ms);

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }
  let c;
  let history = [];
  let idx = -1;

  // mute while restoring so we don't create snapshots during loadFromJSON
  let MUTE = 0;
  const isMuted = () => MUTE > 0;

  const EXTRA = [
    '_kind','_isBase','_isBgRect','raWM','raPos',
    'selectable','evented','hasControls',
    'lockMovementX','lockMovementY','lockScalingX','lockScalingY','lockRotation',
    'globalCompositeOperation','opacity','flipX','flipY'
  ];

  function serialize(){
    if (!c || isMuted()) return null;
    const j = c.toJSON(EXTRA);
    j.__w  = c.getWidth();
    j.__h  = c.getHeight();
    j.__vt = c.viewportTransform || [1,0,0,1,0,0];
    return JSON.stringify(j);
  }

  function restore(jsonStr, label=''){
    if (!c || !jsonStr) return;
    MUTE++;
    try{
      const data = JSON.parse(jsonStr);
      c.loadFromJSON(data, () => {
        try{
          if (data.__w && data.__h){ c.setWidth(data.__w); c.setHeight(data.__h); }
          if (Array.isArray(data.__vt)) c.setViewportTransform(data.__vt);

          // keep base/bg not selectable
          c.getObjects().forEach(o=>{
            if (o._isBase){
              o.selectable=false; o.evented=false; o.hasControls=false;
              o.lockMovementX=o.lockMovementY=o.lockScalingX=o.lockScalingY=o.lockRotation=true;
            }
          });

          c.requestRenderAll();
        } finally {
          MUTE--;
          refresh(label);
        }
      });
    } catch(_){
      MUTE--; refresh(label);
    }
  }

  function push(label=''){
    const s = serialize(); if (!s) return;
    // if we undid into the middle, drop the tail
    if (idx < history.length - 1) history = history.slice(0, idx + 1);
    if (history[idx] === s) { refresh(label); return; }
    history.push(s);
    if (history.length > MAX) history.shift();
    idx = history.length - 1;
    refresh(label);
  }

  function undo(){ if (idx <= 0) return; idx -= 1; restore(history[idx], 'Undo'); }
  function redo(){ if (idx >= history.length - 1) return; idx += 1; restore(history[idx], 'Redo'); }

  // ---------- UI ----------
  let ui = {};
  function ensureUI(){
    // If your previous buttons exist, wire them
    const existing = {
      undo: $('#raUndoBtn'),
      redo: $('#raRedoBtn'),
      save: $('#raSaveDraftBtn'),
      load: $('#raLoadDraftBtn'),
      clr : $('#raClearDraftBtn'),
      info: $('#raHistInfo')
    };
    if (existing.undo || existing.redo) {
      ui = existing;
      if (ui.undo) ui.undo.onclick = undo;
      if (ui.redo) ui.redo.onclick = redo;
      if (ui.save) ui.save.onclick = saveDraft;
      if (ui.load) ui.load.onclick = restoreDraft;
      if (ui.clr)  ui.clr.onclick  = ()=>{ localStorage.removeItem(DRAFT_KEY); refresh('Draft cleared'); };
      return;
    }

    // Else add a tiny row under “Selection”
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
    undoB.onclick = undo; redoB.onclick = redo;
    saveB.onclick = saveDraft; loadB.onclick = restoreDraft;
    clrB.onclick  = ()=>{ localStorage.removeItem(DRAFT_KEY); refresh('Draft cleared'); };
  }

  function refresh(msg=''){
    ensureUI();
    const canUndo = idx > 0;
    const canRedo = idx >= 0 && idx < history.length - 1;
    if (ui.undo) ui.undo.disabled = !canUndo;
    if (ui.redo) ui.redo.disabled = !canRedo;
    if (ui.load) ui.load.disabled = !localStorage.getItem(DRAFT_KEY);

    if (ui.undo) ui.undo.textContent = `Undo (${canUndo ? idx : 0})`;
    if (ui.redo) ui.redo.textContent = `Redo (${canRedo ? (history.length - 1 - idx) : 0})`;
    if (ui.info) ui.info.textContent = `History ${ idx + 1 } / ${ history.length }${msg ? ' • ' + msg : ''}`;
  }

  // ---------- Draft ----------
  function saveDraft(){ if (idx>=0){ try{ localStorage.setItem(DRAFT_KEY, history[idx]); refresh('Draft saved'); }catch(_){ refresh('Draft failed'); } } }
  function restoreDraft(){
    const j = localStorage.getItem(DRAFT_KEY);
    if (!j) return refresh('No draft');
    history = [j]; idx = 0; restore(j, 'Draft restored');
  }

  // ---------- Wiring (non‑invasive) ----------
  let burstTimer = null;
  function schedulePush(label){ if (isMuted()) return; if (burstTimer) return; burstTimer = setTimeout(()=>{ burstTimer=null; push(label); }, 40); }

  function wire(){
    c = C(); if (!c) return defer(wire, 120);
    ensureUI();

    // Take a baseline snapshot a moment after the app finishes initial setup
    defer(()=>{ push('Init'); }, 150);

    // Fabric events — safe, view‑only recording
    c.on('object:modified', ()=> schedulePush('Edit'));
    c.on('object:added',    (e)=>{ const o=e?.target; if (o && o._isBgRect) return; schedulePush('Add'); });
    c.on('object:removed',  ()=> schedulePush('Remove'));

    // Keyboard shortcuts (ignore when typing)
    document.addEventListener('keydown', (e)=>{
      const tag=(e.target&&e.target.tagName||'').toLowerCase();
      if (/^(input|textarea|select)$/.test(tag) || e.target?.isContentEditable) return;
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
      else if (((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z' && e.shiftKey) ||
               ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='y')){ e.preventDefault(); redo(); }
    });

    // Canvas size dropdown → one snapshot around resize operations
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

/* ==========================================================
   RA_ANIMATE_PREVIEW_VIDEO_V4
   • Presets for: Everything (viewport), Base only, Overlays only, Text only.
   • Overlay presets still auto-scope when "Everything" is selected.
   • Broader, safer target detection (text/overlay/base).
   • Recording: robust MIME selection (VP9→VP8→WebM→MP4 if supported),
     captureStream FPS, auto download link, and safe fallbacks.
   • Preview-safe: state restored; undo/redo not spammed; no layout changes.
   ========================================================== */
(() => {
  if (window.__RA_ANIM_V4__) return; window.__RA_ANIM_V4__ = true;

  const VERSION = '4.0.0';
  const FPS = 30;

  // ---------- Shortcuts ----------
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  // ---------- Easings ----------
  const EASE = {
    linear: t => t,
    ioQuad: t => t<0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2,
    ioSine: t => -(Math.cos(Math.PI*t)-1)/2,
    ioCubic: t => t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2,
    ioBack: t => { const c1=1.70158, c2=c1*1.525; return t<0.5
      ? (Math.pow(2*t,2)*((c2+1)*2*t - c2))/2
      : (Math.pow(2*t-2,2)*((c2+1)*(2*t-2)+c2)+2)/2; },
    ioExpo: t => t===0?0 : t===1?1 : (t<0.5 ? Math.pow(2,20*t-10)/2 : (2 - Math.pow(2,-20*t+10))/2)
  };

  // ---------- Presets ----------
  // kind:'viewport' => whole scene via camera (Everything).
  // kind:'overlays' => overlay items (stickers, shapes, images that are not base/text).
  // kind:'text'     => text/token ID only.
  // kind:'base'     => base image only.
  // Viewport params: z (zoom), x/y (normalized pan: -0.1..+0.1).
  // Object params (overlays/base/text): s (scale), rot (deg), alpha (0..1), dx/dy (px), dxN/dyN (normalized W/H).
  const PRESETS = [
    // — Viewport / Everything —
    {id:'kb_in_ur', name:'Ken Burns — in ↗', kind:'viewport', ease:'ioSine', from:{z:1.00,x:0.00,y:0.00},  to:{z:1.18,x:-0.06,y:+0.06}},
    {id:'kb_in_ul', name:'Ken Burns — in ↖', kind:'viewport', ease:'ioSine', from:{z:1.00,x:0.00,y:0.00},  to:{z:1.18,x:+0.06,y:+0.06}},
    {id:'kb_in_dr', name:'Ken Burns — in ↘', kind:'viewport', ease:'ioSine', from:{z:1.00,x:0.00,y:0.00},  to:{z:1.18,x:-0.06,y:-0.06}},
    {id:'kb_in_dl', name:'Ken Burns — in ↙', kind:'viewport', ease:'ioSine', from:{z:1.00,x:0.00,y:0.00},  to:{z:1.18,x:+0.06,y:-0.06}},
    {id:'kb_out',    name:'Ken Burns — out',    kind:'viewport', ease:'ioSine',  from:{z:1.15,x:0.00,y:0.00},  to:{z:1.00,x: 0.00,y: 0.00}},
    {id:'pan_up',    name:'Pan up (slow)',      kind:'viewport', ease:'ioQuad',  from:{z:1.00,x:0.00,y: 0.06}, to:{z:1.00,x:0.00,y:-0.06}},
    {id:'pan_down',  name:'Pan down (slow)',    kind:'viewport', ease:'ioQuad',  from:{z:1.00,x:0.00,y:-0.06}, to:{z:1.00,x:0.00,y: 0.06}},
    {id:'pan_left',  name:'Pan left (slow)',    kind:'viewport', ease:'ioQuad',  from:{z:1.00,x: 0.06,y:0.00}, to:{z:1.00,x:-0.06,y:0.00}},
    {id:'pan_right', name:'Pan right (slow)',   kind:'viewport', ease:'ioQuad',  from:{z:1.00,x:-0.06,y:0.00}, to:{z:1.00,x: 0.06,y:0.00}},
    {id:'zoom_in',   name:'Zoom in (gentle)',   kind:'viewport', ease:'ioCubic', from:{z:1.00,x:0.00,y:0.00},  to:{z:1.15,x: 0.00,y: 0.00}},
    {id:'zoom_out',  name:'Zoom out (gentle)',  kind:'viewport', ease:'ioCubic', from:{z:1.12,x:0.00,y:0.00},  to:{z:1.00,x: 0.00,y: 0.00}},

    // — Overlays only —
    {id:'ov_pop',      name:'Overlays/Text pop (scale)',        kind:'overlays', ease:'ioBack', from:{s:0.90},     to:{s:1.00}},
    {id:'ov_slide_up', name:'Overlays/Text slide up',           kind:'overlays', ease:'ioSine', from:{dyN:0.14},   to:{dyN:0.00}},
    {id:'ov_slide_dn', name:'Overlays/Text slide down',         kind:'overlays', ease:'ioSine', from:{dyN:-0.14},  to:{dyN:0.00}},
    {id:'ov_slide_l',  name:'Overlays/Text slide in ←',         kind:'overlays', ease:'ioSine', from:{dxN:-0.18},  to:{dxN:0.00}},
    {id:'ov_slide_r',  name:'Overlays/Text slide in →',         kind:'overlays', ease:'ioSine', from:{dxN: 0.18},  to:{dxN:0.00}},
    {id:'ov_fade',     name:'Overlays/Text fade in',            kind:'overlays', ease:'ioCubic',from:{alpha:0.00}, to:{alpha:1.00}},
    {id:'ov_wiggle',   name:'Overlays/Text tiny rotate',        kind:'overlays', ease:'ioSine', from:{rot:-5},     to:{rot:0}},
    {id:'ov_pop_big',  name:'Overlays/Text big pop (stronger)', kind:'overlays', ease:'ioBack', from:{s:0.85},     to:{s:1.00}},

    // — Base only —
    {id:'base_nudge',  name:'Base nudge (gentle zoom in)',      kind:'base',     ease:'ioSine', from:{s:1.00},     to:{s:1.06}},
    {id:'base_slide',  name:'Base slide right a bit',           kind:'base',     ease:'ioQuad', from:{dxN:-0.06},  to:{dxN:0.00}}
  ];

  // ---------- UI dock ----------
  function ensureDock(){
    let dock = $('#raAnimDock');
    if (dock) return dock;

    const host = $$('h3').find(h=>/export/i.test((h.textContent||'').trim()))?.parentNode || document.body;
    dock = document.createElement('div');
    dock.id = 'raAnimDock';
    dock.style.cssText = 'margin:16px 0;padding:12px;border:1px solid #23242a;border-radius:12px;background:#0f1116;color:#e7e7ea';
    dock.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <strong>Animate</strong>
        <span style="opacity:.55;font-size:12px">v${VERSION}</span>
        <label style="display:flex;gap:6px;align-items:center">
          What:
          <select id="raAnimScope">
            <option value="all">Everything (camera)</option>
            <option value="base">Base only</option>
            <option value="overlays">Overlays only</option>
            <option value="text">Text only</option>
          </select>
        </label>
        <label style="display:flex;gap:6px;align-items:center">
          Preset:
          <select id="raAnimPreset"></select>
        </label>
        <label style="display:flex;gap:6px;align-items:center">
          Easing:
          <select id="raAnimEase">
            <option value="ioSine">Smooth (Sine)</option>
            <option value="ioQuad">Natural (Quad)</option>
            <option value="ioCubic">Rounded (Cubic)</option>
            <option value="ioBack">Bounce-back</option>
            <option value="ioExpo">Snappy (Expo)</option>
            <option value="linear">Linear</option>
          </select>
        </label>
        <label style="display:flex;gap:6px;align-items:center">
          Duration: <input id="raAnimDur" type="number" min="2" max="20" value="6" step="0.1" style="width:60px">s
        </label>
        <button id="raAnimPreview" class="btn small">Preview</button>
        <button id="raAnimExport"  class="btn small">Export video</button>
        <span id="raAnimMsg" style="font-size:12px;opacity:.75;"></span>
      </div>
      <video id="raAnimOut" style="display:none;margin-top:10px;max-width:100%;border-radius:8px" controls></video>
      <div id="raAnimDL" style="margin-top:6px"></div>
    `;
    host.appendChild(dock);

    // Fill presets
    const sel = $('#raAnimPreset', dock);
    PRESETS.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });

    // Events
    $('#raAnimPreview', dock).onclick = ()=> run(false);
    $('#raAnimExport',  dock).onclick = ()=> run(true);
    $('#raAnimPreset',  dock).onchange = () => {
      const id = $('#raAnimPreset').value;
      const p  = PRESETS.find(x=>x.id===id);
      if (!p) return;
      // If user has Everything/Base but picked an overlay preset, auto-scope to overlays.
      const scopeEl = $('#raAnimScope');
      if (p.kind==='overlays' && scopeEl.value!=='overlays') {
        scopeEl.value = 'overlays';
        msg('Preset targets overlays → switched "What" to Overlays.');
      }
      // Prefer preset’s ease if it has one
      if (p.ease) $('#raAnimEase').value = p.ease;
    };

    return dock;
  }

  function msg(t){
    const m = $('#raAnimMsg'); if (!m) return;
    m.textContent = t||'';
    if (t) setTimeout(()=>{ if ($('#raAnimMsg')===m) m.textContent=''; }, 2200);
  }

  // ---------- Helpers ----------
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;

  const isBg    = o => !!o._isBgRect;
  const isBase  = o => !!(o._isBase && !o._isBgRect);
  const isText  = o => {
    const k = (o._kind||'').toLowerCase();
    const t = (o.type||'').toLowerCase();
    return k==='customtext' || k==='tokenid' || t==='textbox' || t==='i-text' || t==='text';
  };
  const isOverlay = o => {
    if (isBg(o) || isBase(o) || isText(o)) return false;
    const k = (o._kind||'').toLowerCase();
    // Treat any non-base/non-text drawable as overlay by default.
    return k==='overlay' || k==='sticker' || k==='icon' || true;
  };

  function pickTargets(c, scope){
    const objs = (c.getObjects?.()||[]).filter(o => !isBg(o));
    if (scope==='text')     return objs.filter(isText);
    if (scope==='overlays') return objs.filter(isOverlay);
    if (scope==='base')     return objs.filter(isBase);
    return []; // 'all' uses viewport animation only
  }

  // ---------- Core ----------
  let running=false;
  let lastURL=null;

  async function run(record){
    const c=C(); if(!c){ alert('Canvas not ready'); return; }
    if (running) return;

    ensureDock();
    const scopeEl = $('#raAnimScope');
    const presetEl= $('#raAnimPreset');
    const easeEl  = $('#raAnimEase');
    const durSec  = clamp(parseFloat($('#raAnimDur')?.value||'6'),2,20);
    const dur     = Math.round(durSec*1000);

    const preset  = PRESETS.find(p=>p.id===presetEl.value) || PRESETS[0];
    const ease    = EASE[(easeEl?.value)||preset.ease||'ioQuad'] || EASE.ioQuad;
    const scope   = scopeEl?.value || 'all';

    const W=c.getWidth?.()||0, H=c.getHeight?.()||0, cx=W/2, cy=H/2;

    // Decide mode/targets strictly via the UI scope + pickTargets()
    const viewportOnly = (preset.kind==='viewport' && scope==='all');
    const targets = viewportOnly ? [] : pickTargets(c, scope);

    // Guard rails for empty selections
    if (!viewportOnly && targets.length===0){
      if (scope==='base'){      msg('Load an image first'); return; }
      if (scope==='overlays'){  msg('Add an overlay first'); return; }
      if (scope==='text'){      msg('Add custom text or token ID first'); return; }
    }

    running=true; msg(record?'Recording…':'Playing…');

    // Save state
    const vt0 = (c.viewportTransform||[1,0,0,1,0,0]).slice();
    const active = c.getActiveObject?.(); c.discardActiveObject?.(); c.requestRenderAll?.();

    // Snapshots for object animations
    const snap = new Map();
    const store = o => snap.set(o, {
      left:o.left, top:o.top, scaleX:o.scaleX, scaleY:o.scaleY,
      angle:o.angle, opacity:(o.opacity==null?1:o.opacity)
    });
    targets.forEach(store);

    // Clean previous URL if any
    if (lastURL){ try{ URL.revokeObjectURL(lastURL); }catch(_){ } lastURL=null; }
    $('#raAnimDL')?.replaceChildren?.();

    // Optional recording
    let rec, chunks=[];
    const vidEl = $('#raAnimOut');
    if (record){
      try{
        const el = (c.lowerCanvasEl || c.upperCanvasEl);
        const stream = el?.captureStream ? el.captureStream(FPS) : null;
        const type = pickMimeType();
        if (stream && typeof MediaRecorder!=='undefined'){
          const opts = type ? { mimeType:type } : undefined;
          rec = new MediaRecorder(stream, opts);
          rec.ondataavailable = e=>{ if (e.data && e.data.size) chunks.push(e.data); };
          rec.start();
        } else {
          msg('Recording not supported in this browser');
        }
      }catch(_){ msg('Recording not supported'); }
    }

    const t0 = performance.now(); let rafId=0;

    function applyViewport(z,xN,yN){
      // Center-aware transform: translation keeps origin stable while panning by normalized canvas units
      const e = (1 - z) * cx + xN * W;
      const f = (1 - z) * cy + yN * H;
      c.setViewportTransform?.([z,0,0,z, e, f]);
    }

    function step(now){
      const raw = clamp((now - t0)/dur, 0, 1);
      const t   = ease(raw);

      if (viewportOnly){
        const z  = lerp(preset.from.z, preset.to.z, t);
        const xn = lerp(preset.from.x, preset.to.x, t);
        const yn = lerp(preset.from.y, preset.to.y, t);
        applyViewport(z, xn, yn);
      } else {
        const hasScale = (preset.from?.s!=null && preset.to?.s!=null);
        const hasRot   = (preset.from?.rot!=null && preset.to?.rot!=null);
        const hasAlpha = (preset.from?.alpha!=null && preset.to?.alpha!=null);

        const dx  = (preset.from?.dx!=null && preset.to?.dx!=null) ? lerp(preset.from.dx,  preset.to.dx,  t) : 0;
        const dy  = (preset.from?.dy!=null && preset.to?.dy!=null) ? lerp(preset.from.dy,  preset.to.dy,  t) : 0;
        const dxN = (preset.from?.dxN!=null && preset.to?.dxN!=null)? lerp(preset.from.dxN, preset.to.dxN, t) : 0;
        const dyN = (preset.from?.dyN!=null && preset.to?.dyN!=null)? lerp(preset.from.dyN, preset.to.dyN, t) : 0;

        const dpx = dx + dxN*W;
        const dpy = dy + dyN*H;

        const s   = hasScale ? lerp(preset.from.s,   preset.to.s,   t) : 1.0;
        const rot = hasRot   ? lerp(preset.from.rot, preset.to.rot, t) : 0;
        const a   = hasAlpha ? lerp(preset.from.alpha, preset.to.alpha, t) : null;

        targets.forEach(o=>{
          const o0 = snap.get(o); if(!o0) return;
          o.scaleX = o0.scaleX * s;
          o.scaleY = o0.scaleY * s;
          o.left   = o0.left + dpx;
          o.top    = o0.top  + dpy;
          if (hasRot)   o.angle   = o0.angle + rot;
          if (a!=null)  o.opacity = a * (o0.opacity==null?1:o0.opacity);
          o.setCoords?.();
        });
      }

      c.requestRenderAll?.();
      if (raw<1) { rafId = requestAnimationFrame(step); } else { finish(); }
    }

    function finish(){
      cancelAnimationFrame(rafId);

      if (rec){
        try{
          rec.onstop = ()=>{
            const type = rec.mimeType || 'video/webm';
            const blob = new Blob(chunks, {type});
            const url  = URL.createObjectURL(blob);
            lastURL = url;

            // Video element
            if (vidEl){
              vidEl.style.display='block';
              vidEl.src = url;
              vidEl.play?.().catch(()=>{});
            }

            // Download link
            const dl = $('#raAnimDL');
            if (dl){
              dl.innerHTML = '';
              const a = document.createElement('a');
              a.textContent = 'Download animation';
              a.href = url;
              a.download = `animation_${Date.now()}.${extFromMime(type)}`;
              a.className = 'btn small';
              dl.appendChild(a);
            }

            msg('Done. Preview above or use “Download animation”.');
          };
          rec.stop();
        }catch(_){ /* ignore */ }
      } else {
        msg('Done');
      }

      // Restore state
      try { c.setViewportTransform?.(vt0); } catch(_){}
      targets.forEach(o=>{
        const s = snap.get(o); if(!s) return;
        o.left=s.left; o.top=s.top; o.scaleX=s.scaleX; o.scaleY=s.scaleY; o.angle=s.angle; o.opacity=s.opacity;
        o.setCoords?.();
      });
      if (active) try{ c.setActiveObject?.(active); }catch(_){}
      c.requestRenderAll?.();
      running=false;
    }

    requestAnimationFrame(step);
  }

  // ---------- Utilities ----------
  function pickMimeType(){
    const pref = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4' // may be unsupported in many browsers for MediaRecorder
    ];
    if (typeof MediaRecorder==='undefined' || !MediaRecorder.isTypeSupported) return pref[2];
    for (const t of pref){ if (MediaRecorder.isTypeSupported(t)) return t; }
    return '';
  }
  function extFromMime(t){
    if (!t) return 'webm';
    if (t.includes('mp4')) return 'mp4';
    return 'webm';
  }

  // Build UI now/when ready
  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ensureDock, {once:true});
  } else {
    ensureDock();
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

/* ================= RA_HIDE_TOKEN_VIDEO_PANEL_v1 ================= */
(() => {
  function hide() {
    // Remove by ID if it exists
    const el = document.getElementById('raVideoPanel');
    if (el) el.remove();

    // Fallback: hide any card whose heading says “Video (token‑only)”
    Array.from(document.querySelectorAll('h2,h3')).forEach(h => {
      const t = (h.textContent || '').toLowerCase();
      if (t.includes('video') && t.includes('token')) {
        const card = h.closest('section,div') || h.parentElement;
        if (card) card.style.display = 'none';
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hide, { once:true });
  } else { hide(); }
  new MutationObserver(hide).observe(document.documentElement, { childList:true, subtree:true });
})();

/* ==========================================================
   RA_WM_CENTER_ADMIN_NO_STAMPS_V2
   • Removes corner stamps from EVERY new/old base or overlay.
     (We strip the stamp children out of the group; no re-centering bugs.)
   • One centered watermark layer with admin-only controls.
     - Enable/disable
     - Show on Tokens
     - Show on Uploads
     - Opacity + Size (width % of canvas)
   • No dependency on your Undo/Redo patch and no overrides.
     (We never touch window.raHist and we don’t replace base objects.)
   ========================================================== */
(() => {
  if (window.__RA_WM_CENTER_ADMIN_NO_STAMPS_V2__) return;
  window.__RA_WM_CENTER_ADMIN_NO_STAMPS_V2__ = true;

  // ---------- helpers ----------
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const isAdmin = /\badmin=1\b/i.test(location.search);

  // ---------- persisted state ----------
  const KEY = 'ra_wm_center_admin_v2';
  const STATE = {
    enabled: true,
    showOnTokens:  true,
    showOnUploads: true,
    opacity: 0.18,
    sizePct: 0.88,                         // watermark width as % of canvas width
    img: null,
    dataURL: null
  };
  try { Object.assign(STATE, JSON.parse(localStorage.getItem(KEY)||'{}')); } catch(_){}
  const save = ()=>{ try {
    localStorage.setItem(KEY, JSON.stringify({
      enabled:STATE.enabled,
      showOnTokens:STATE.showOnTokens,
      showOnUploads:STATE.showOnUploads,
      opacity:STATE.opacity,
      sizePct:STATE.sizePct
    }));
  } catch(_){} };

  // ---------- load watermark image (same precedence you’ve used) ----------
const wmParam = new URLSearchParams(location.search).get('wm') || '';
// Allow absolute http(s) URLs or same‑origin absolute paths (block data:, javascript:, etc.)
const queryWM = (/^https?:\/\//i.test(wmParam) || wmParam.startsWith('/')) ? wmParam : null;
const CAND = [ queryWM, '/assets/watermark.png?v=wm10', '/watermark.png?v=wm10' ].filter(Boolean);
  async function fetchAsDataURL(u){
    const r = await fetch(u, { cache:'no-store', mode:'cors' });
    if (!r.ok) throw new Error('x');
    const b = await r.blob();
    return await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); });
  }
  async function ensureWM(){
    if (STATE.img) return true;
    for (const u of CAND){
      try{
        const data = await fetchAsDataURL(u);
        const im = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.crossOrigin='anonymous'; i.src=data; });
        STATE.img = im; STATE.dataURL = im.src; return true;
      }catch(_){}
    }
    return false;
  }

  // ---------- identify base type ----------
  function findBase(c){
    return (c.getObjects()||[]).find(o => o && o._isBase && !o._isBgRect) || null;
  }
  function baseIsToken(base){
    // In your app: tokens were plain Image, uploads were Group.
    // We keep that invariant by stripping stamp children in-place.
    return !!(base && base.type === 'image');
  }

  // ---------- strip corner-stamp children from a group ----------
  function isStamp(o){ return !!(o && (o._isWatermark || o.raWM || o.raPos)); }

  function stripStampsFromGroup(g){
    if (!g || g.type!=='group') return false;
    const kids = (g._objects||[]);
    const has = kids.some(isStamp);
    if (!has) return false;

    // remove only the stamp children; keep the main image and group transform
    kids.slice().forEach(k => { if (isStamp(k)) g.remove(k); });
    try {
      g._calcBounds && g._calcBounds();
      g._updateObjectCoords && g._updateObjectCoords();
      g.dirty = true; g.setCoords();
    } catch(_){}
    return true;
  }

  function cleanCornerStamps(c){
    if (!c) return;
    (c.getObjects()||[]).forEach(o=>{
      if (o.type==='group') stripStampsFromGroup(o);
    });
    c.requestRenderAll();
  }

  // ---------- centered watermark layer ----------
  function ensureCenteredWM(c){
    if (!c || !STATE.img) return;

    const base = findBase(c);
    const hasBase = !!base;
    const isToken = baseIsToken(base);

    const force = (window && window.__raWMForce) || null;
// Personal override (from wallet) wins; else fall back to admin toggles
const shouldShow =
  hasBase && (
    (force && force.off) ? false :
    (force && force.on)  ? true  :
    (STATE.enabled && ((isToken && STATE.showOnTokens) || (!isToken && STATE.showOnUploads)))
  );

    let wm = (c.getObjects()||[]).find(o => o && o._raWMCenter);
    if (!shouldShow){
      if (wm){ c.remove(wm); c.requestRenderAll(); }
      return;
    }

    if (!wm){
      wm = new fabric.Image(STATE.img, {
        originX:'center', originY:'center',
        left:c.getWidth()/2, top:c.getHeight()/2,
        selectable:false, evented:false, hasControls:false,
        _raWMCenter:true, _raSys:true
      });
      c.add(wm);
    }

    const targetW = clamp(Math.round(c.getWidth()*STATE.sizePct), 16, c.getWidth()*1.4);
    const s = targetW / (STATE.img.width||targetW);
    wm.scaleX = s; wm.scaleY = s;
    wm.opacity = clamp(STATE.opacity, 0, 1);
    wm.left = c.getWidth()/2; wm.top = c.getHeight()/2;
    wm.setCoords();
    c.bringToFront(wm);
    c.requestRenderAll();
  }

  // ---------- admin dock (only with ?admin=1) ----------
  function ensureAdminDock(){
    if (!isAdmin) return;

    if ($('#raWmCenterDock')) return;
    const holder =
      $$('h3').find(h=>/selection/i.test((h.textContent||'').trim()))?.parentNode
      || $$('h3').find(h=>/export/i.test((h.textContent||'').trim()))?.parentNode
      || document.body;

    const pane = document.createElement('div');
    pane.id = 'raWmCenterDock';
    pane.style.cssText = 'margin:12px 0;border:1px solid #23242a;border-radius:12px;background:#0f1116;color:#e7e7ea;padding:10px';
    pane.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong>Watermark</strong>
        <div style="display:flex;gap:6px">
          <button id="raWmCRefresh" class="btn small">Refresh</button>
          <button id="raWmCHide" class="btn small">Hide</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
        <label><input id="raWmCEnabled" type="checkbox"> Enabled</label>
        <label><input id="raWmCOnTok"  type="checkbox"> Show on tokens</label>
        <label><input id="raWmCOnUp"   type="checkbox"> Show on uploads</label>
        <label style="display:flex;align-items:center;gap:6px">Opacity
          <input id="raWmCOpacity" type="range" min="0" max="1" step="0.01" style="width:140px">
        </label>
        <label style="display:flex;align-items:center;gap:6px">Size (width %)
          <input id="raWmCSize" type="range" min="0.3" max="1.2" step="0.01" style="width:160px">
        </label>
      </div>
      <div style="margin-top:6px;font-size:11px;opacity:.65">Corner stamps are removed automatically from base & overlays.</div>
    `;
    holder.appendChild(pane);

    $('#raWmCEnabled').checked   = !!STATE.enabled;
    $('#raWmCOnTok').checked     = !!STATE.showOnTokens;
    $('#raWmCOnUp').checked      = !!STATE.showOnUploads;
    $('#raWmCOpacity').value     = STATE.opacity;
    $('#raWmCSize').value        = STATE.sizePct;

    const c = C();
    const sync = ()=>{ save(); ensureCenteredWM(c); };

    $('#raWmCEnabled').onchange = e=>{ STATE.enabled = !!e.target.checked; sync(); };
    $('#raWmCOnTok').onchange   = e=>{ STATE.showOnTokens  = !!e.target.checked; sync(); };
    $('#raWmCOnUp').onchange    = e=>{ STATE.showOnUploads = !!e.target.checked; sync(); };
    $('#raWmCOpacity').oninput  = e=>{ STATE.opacity = clamp(parseFloat(e.target.value||'0.18'),0,1); sync(); };
    $('#raWmCSize').oninput     = e=>{ STATE.sizePct = clamp(parseFloat(e.target.value||'0.88'),0.3,1.2); sync(); };
    $('#raWmCRefresh').onclick  = sync;
    $('#raWmCHide').onclick     = ()=>{ pane.style.display='none'; };
  }

  // ---------- boot & wiring ----------
  async function boot(){
    await ensureWM();
    const c = C(); if (!c) return;

    // 1) immediately remove any stamp-children already present
    cleanCornerStamps(c);

    // 2) watermark in correct state
    ensureCenteredWM(c);

    // 3) watch for future adds/mods
    if (!c.__raNoStampsV2){
      c.__raNoStampsV2 = true;

      c.on('object:added', (e)=>{
        const t = e?.target;
        if (!t) return;

        if (t.type==='group'){
          if (stripStampsFromGroup(t)) c.requestRenderAll();
        }
        // keep WM consistent
        ensureCenteredWM(c);
      });

      c.on('object:modified', ()=> ensureCenteredWM(c));
      c.on('object:removed',  ()=> ensureCenteredWM(c));

    // 🔔 Wallet holder status changed → re-evaluate watermark
    document.addEventListener('ra-holder-update', ()=> ensureCenteredWM(c)); 
    document.addEventListener('ra-wm-recalc',    ()=> ensureCenteredWM(c));
    }

    // 4) keep WM scaled if canvas element resizes
    try {
      const el = c.getElement ? c.getElement() : (c.wrapperEl || c.upperCanvasEl);
      new ResizeObserver(()=> ensureCenteredWM(c)).observe(el);
    } catch(_) {}

    // 5) admin UI
    ensureAdminDock();
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();

/* ==========================================================
   RA_FIX_UPLOAD_RECENTER_AFTER_STRIP_V1
   Keeps newly added base/overlay groups centered after the
   corner-stamp children are removed.
   - Runs after the existing watermark/no-stamps patch.
   - No impact on Undo/Redo (we just correct the initial add).
   ========================================================== */
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
    c.on('after:render', ()=>{/* keep last guides while dragging; cleared on mouse:up */});
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

/* ==========================================================
   RA_WM_GLOBAL_SYNC_v3 — PASTE AT THE VERY BOTTOM OF app.js
   Uses /api/ra-settings to load+save watermark settings for everyone.
   ========================================================== */
(() => {
  const GET_URL  = '/api/ra-settings';  // your endpoint (GET returns {ok, settings:{...}})
  const POST_URL = '/api/ra-settings';  // same endpoint for saving

  const isAdmin = /\badmin=1\b/i.test(location.search);

  function canvas() {
    return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  }

  // Put server values onto the centered watermark layer that's already on the canvas
  function applyToCanvas(settings) {
    if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch(_) {} }

    const c = canvas(); if (!c) return false;
    const wm = (c.getObjects() || []).find(o => o && o._raWMCenter);
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

      // Try now; if the watermark layer isn't on the canvas yet, retry briefly
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
    const wm = (c.getObjects()||[]).find(o => o && o._raWMCenter);
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

/* ==========================================================
   RA_WM_SERVER_MASTER_v1  — PASTE AT THE VERY BOTTOM
   What this does (no other edits needed):
   • Loads settings from /api/ra-settings on open.
   • Makes the three toggles (Enabled / Show on tokens / Show on uploads)
     save to the server AND actually show/hide the watermark.
   • Makes the sliders (Opacity / Size) save to the server and apply.
   • Turns the "Refresh" button into "Save for everyone" + re-apply.
   • Works for admin and non-admin pages.
   ========================================================== */
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
    return (c.getObjects()||[]).find(o => o && o._raWMCenter) || null;
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

  // --- apply settings to the existing centered watermark layer ---
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

  // keep watermark in sync when canvas objects change
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
    // Apply when watermark shows up (the other script adds it)
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

/* ==========================================================
   RA_WM_OVERLAY_ONLY_FALLBACK_v1 — paste at the very bottom
   - If there is NO base image but overlays/text are present,
     show a centered watermark (uses your "Show on uploads" setting).
   - When a base image is added, remove this fallback so your
     normal watermark logic runs as usual.
   ========================================================== */
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

  // Use the watermark image already preloaded by your app (raWatermark).
  async function ensureImage(){
    try {
      if (window.raWatermark && typeof window.raWatermark.ready === 'function'){
        await window.raWatermark.ready();
        return window.raWatermark.img() || null;
      }
    } catch(_){}
    // Fallback (should rarely be needed)
    return await new Promise(res => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.src = '/assets/watermark.png?v=wm10';
    });
  }

  function hasBase(c){
    return !!(c.getObjects()||[]).find(o => o && o._isBase && !o._isBgRect);
  }
  function canvasHasContent(c){
    return !!(c.getObjects()||[]).find(o => o && !o._isBgRect && !o._raWMCenter && !o._raWMOverlayFallback);
  }

  function removeFallback(){
    const c = C(); if (!c) return;
    (c.getObjects()||[]).filter(o => o && o._raWMOverlayFallback).forEach(o => c.remove(o));
    try { c.requestRenderAll(); } catch(_){}
  }

  async function update(){
    const c = C(); if (!c) return;

    if (!settings) await loadSettings();
    // If settings aren't available, or watermarking is globally off, remove and stop.
    if (!settings || !settings.enabled) { removeFallback(); return; }

    const haveBase   = hasBase(c);
    const haveStuff  = canvasHasContent(c);

    // If there is a base image, let the normal watermark handle it.
    if (haveBase) { removeFallback(); return; }

    // Nothing on canvas? nothing to show.
    if (!haveStuff) { removeFallback(); return; }

    // Respect "Show on uploads" for overlay-only use.
    if (!settings.showOnUploads) { removeFallback(); return; }

    // Ensure we have the watermark image
    const img = await ensureImage(); if (!img) return;

    // Create or update the fallback watermark (our own tag; main code won't touch it)
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
  async function connect(){
    const eth = window.ethereum;
    if (!eth){ out.textContent='No wallet detected (MetaMask/Coinbase).'; return; }
    try{
      const accounts = await eth.request({ method:'eth_requestAccounts' });
      const chainId  = await eth.request({ method:'eth_chainId' });
      const address  = accounts?.[0] || null;
      setConnected(!!address, address, chainId, eth, 'Connected. Click “Check holdings”.');
    }catch(_){ out.textContent = 'Connect cancelled or failed.'; }
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
    setDisconnected('Disconnected in app. (Use the wallet menu to fully disconnect this site.)');
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
    qs('#raW_connect', box).style.display  = '';
    btnRefresh.style.display = 'none';
    btnDisc.style.display    = 'none';
    row1.style.display       = 'none';
    actions.style.display    = 'none';
    out.textContent          = msg || '';
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
    ethereum.on?.('accountsChanged', ()=>{ hintEl.textContent='Account changed — click Refresh.'; });
    ethereum.on?.('chainChanged',   cid=>{ chainEl.textContent = netNameFromChainId(cid); hintEl.textContent='Network changed — click Refresh.'; });
  }

  // optional: try a silent refresh on load
  (async ()=>{ try{ await refresh(); }catch(_){} })();
})();

/* ========== RA_WM_HOLDER_GATING_v2 — wallet → watermark behavior (no loops) ========== */
(()=>{
  function apply(detail){
    // keep last known state around for other bits if needed
    window.RA_HOLDER_STATE = detail || window.RA_HOLDER_STATE || {};

    // Rebel holders: locally force watermark OFF (doesn't change admin toggles)
    if (detail && detail.hasRebel) {
      window.__raWMForce = { off: true };
    } else {
      window.__raWMForce = null; // obey admin toggles again
    }

    // Tell the watermark block to recompute using the new flag
    try { document.dispatchEvent(new Event('ra-wm-recalc')); } catch(_) {}
    try { window.canvas && window.canvas.requestRenderAll(); } catch(_) {}
  }

  // Wallet checker emits 'ra-holder-update' with detail: { hasRebel, hasFriend, ... }
  document.addEventListener('ra-holder-update', (e)=> apply(e.detail||{}));
})();

/* ========== RA_BRAND_FOOTER_TOPMOST_LOCKED_v6 — history‑neutral; friend+manual only; black fill + white outline ========== */
(() => {
  const FOOTER_TEXT = 'Powered by Rebel Studios';
  const STYLE = {
    fontFamily: 'Inter, Arial, sans-serif',
    fontSize: 12,
    fill: '#000000',            // black inside
    stroke: '#ffffff',          // white outline
    strokeWidth: 1.6,
    strokeUniform: true,
    opacity: 0.95
  };
  const PAD = 10;
  const toLower = s => (s || '').toLowerCase();

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  // Prefer a tagged base; otherwise use the last image on canvas (manual upload case)
  function findBase(c){
    const objs = c.getObjects?.() || [];
    let base = objs.find(o => o && o._isBase && !o._isBgRect) || null;
    if (base) return base;
    const imgs = objs.filter(o => (o.type === 'image' || o._element) && !o?._raBrandFooter);
    return imgs.length ? imgs[imgs.length - 1] : null;
  }

  function rebelContract(){
    if (typeof CONTRACT === 'string' && CONTRACT) return toLower(CONTRACT);
    const list = Array.isArray(window.RA_COLLECTIONS) ? window.RA_COLLECTIONS : [];
    const r = list.find(x => (x.tag === 'rebel') && (x.address || x.contract));
    if (r) return toLower(r.address || r.contract);
    // Safe default: Rebel Ants mainnet
    return '0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221';
  }

 function shouldShow(c){
  const base = findBase(c);
  if (!base) return true; // manual upload → show the footer

  // SAFE: read the contract tag we put on the base image, lower‑cased
  const cc = toLower((base && base._tokenContract) ? String(base._tokenContract) : '');

  if (!cc) return true;  // no contract info → treat as manual, show the footer
  return (cc !== rebelContract()); // show on friends; hide on Rebel Ants
}
  // Returns true only if we actually changed something (keeps history clean)
  function ensure(){
    const c = C(); if (!c) return false;
    let changed = false;

    let footer = (c.getObjects?.() || []).find(o => o && o._raBrandFooter) || null;
    const show = shouldShow(c);

    if (!show){
      if (footer){
        try { c.remove(footer); changed = true; } catch(_){}
      }
      if (changed) try { c.requestRenderAll(); } catch(_){}
      return changed;
    }

    if (!footer){
      footer = new fabric.Textbox(FOOTER_TEXT, {
        ...STYLE,
        selectable:false, evented:false, hasControls:false,
        lockMovementX:true, lockMovementY:true, hoverCursor:'default',
        _raBrandFooter:true, _raSys:true,
        excludeFromExport:true          // keep out of JSON/history
      });
      c.add(footer);
      changed = true;
    } else {
      // Reassert non‑interactive + exclude from export
      footer.set({
        selectable:false, evented:false, hasControls:false,
        lockMovementX:true, lockMovementY:true, hoverCursor:'default',
        excludeFromExport:true
      });
      // Style reapply is cheap; if identical it won’t dirty
      footer.set(STYLE);
    }

    // Position bottom‑right only if it actually moved
    const wantLeft = c.getWidth() - PAD;
    const wantTop  = c.getHeight() - PAD;
    if (footer.originX !== 'right' || footer.originY !== 'bottom' ||
        Math.round(footer.left) !== Math.round(wantLeft) ||
        Math.round(footer.top)  !== Math.round(wantTop)) {
      footer.set({ originX:'right', originY:'bottom', left:wantLeft, top:wantTop });
      footer.setCoords();
      changed = true;
    }

    // Keep truly topmost, but only if not already there
    const objs = c.getObjects?.() || [];
    if (objs[objs.length - 1] !== footer){
      try { c.bringToFront(footer); changed = true; } catch(_){}
    }

    if (changed) try { c.requestRenderAll(); } catch(_){}
    return changed;
  }

  function boot(){
    const c = C(); if (!c) return setTimeout(boot, 120);
    ensure();

    // Refit on canvas resize
    try {
      const el = c.getElement ? c.getElement() : (c.wrapperEl || c.upperCanvasEl);
      new ResizeObserver(() => { ensure(); }).observe(el);
    } catch(_){}

    // Minimal, history‑friendly triggers:
    c.on?.('object:added',   e => { if (!e?.target?._raBrandFooter) ensure(); });
    c.on?.('object:removed', e => { if (!e?.target?._raBrandFooter) ensure(); });

    // If something is brought to front, we’ll catch it next frame without spamming history
    let rafScheduled = false;
    c.on?.('after:render', () => {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => { rafScheduled = false; ensure(); });
    });

    // App‑level events that can change what should show
    ['ra-collection-change','ra-wm-recalc','ra-holder-update'].forEach(ev=>{
      document.addEventListener(ev, () => { ensure(); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
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
    const imgs = objs.filter(o => (o.type === 'image' || o._element) && !o._raBrandFooter);
    base = imgs[imgs.length-1] || null;
  }
  if (!base) return;
  base._tokenContract = (meta.contract||'').toLowerCase();
  base._tokenChain    = meta.chain;
  base._tokenName     = meta.name;
  try { document.dispatchEvent(new CustomEvent('ra-collection-change', { detail: meta })); } catch(_){}
  try { c.requestRenderAll(); } catch(_){}
}

async function loadTokenFromCollection(tokenId, col){
  const contract = (col && col.address) || '';
  if (!contract){ alert('No contract for selected collection.'); return; }

  const slug = col.slug || chainSlugFromId(col.chainId) || 'ethereum';
  const tokenKey = `${contract}:${tokenId}`;
  const url = `https://api.reservoir.tools/tokens/v7?tokens=${encodeURIComponent(tokenKey)}&chain=${encodeURIComponent(slug)}&includeAttributes=false&limit=1`;

  const r = await fetch(url, { headers:{ 'accept':'application/json' }, cache:'no-store' });
  if (!r.ok){ alert('Lookup failed for that token.'); return; }

  const j = await r.json();
  const t = j?.tokens?.[0]?.token || {};
  const media = t.media || {};
  const img = normalizeUrl(
    (media.original && (media.original.url || media.original.mediaUrl)) ||
    t.imageLarge || t.image || t.imageSmall
  );
  if (!img){ alert('No image found for that token.'); return; }

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
  // Tag the base so the footer/watermark can react
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
  const isSys = o => !!(o && (o._isBase || o._raBrandFooter || o._raSys));
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
      if (!o || o._isBase || o._raBrandFooter || o._raTokenId || o._raSys) continue;
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
      if (!o || o._isBase || o._raBrandFooter || o._raTokenId || o._raSys) continue;
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

/* ========== RA_CURVED_PRIME_v1 — keep text visible when Curved is ticked ========== */
(() => {
  const C = () => window.canvas || null;

  // Find the Custom Text card and its controls
  function findCustomTextCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent || ''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }
  function findMsgInput(card){
    return card ? (card.querySelector('textarea, input[type="text"], input:not([type])') || null) : null;
  }
  function findCurvedCheckbox(card){
    if (!card) return null;
    const boxes = Array.from(card.querySelectorAll('input[type="checkbox"]'));
    for (const cb of boxes){
      const lab = card.querySelector(`label[for="${cb.id}"]`) || cb.closest('label');
      const txt = (lab && lab.textContent ? lab.textContent : '').toLowerCase();
      if (txt.includes('curved')) return cb;
    }
    return null;
  }

  // Get the currently selected text on canvas (ignores base/footer/token‑id)
  function activeCanvasText(){
    const c = C(); if (!c) return null;
    const a = c.getActiveObject && c.getActiveObject();
    if (!a) return null;
    const isSys = o => !!(o && (o._isBase || o._raBrandFooter || o._raSys || o._raTokenId));
    if (isSys(a)) return null;

    const isText = o => (o && (String(o.type||'').toLowerCase().includes('text')));
    if (isText(a)) return a;

    if (typeof a.getObjects === 'function'){
      try { return a.getObjects().find(isText) || null; } catch(_) {}
    }
    return null;
  }

  function nudgeInput(el){
    try { el.dispatchEvent(new Event('input',  { bubbles:true })); } catch(_){}
    try { el.dispatchEvent(new Event('change', { bubbles:true })); } catch(_){}
  }

  function onCurvedToggle(){
    const card = findCustomTextCard(); if (!card) return;
    const msg  = findMsgInput(card);  if (!msg)   return;
    const cb   = findCurvedCheckbox(card);       if (!cb)   return;

    // Only do work when turning Curved ON
    if (!cb.checked) return;

    // If the app cleared the message box after "Add Text", repopulate it from the selected text
    if (!msg.value || !msg.value.trim()){
      const t = activeCanvasText();
      if (t && typeof t.text === 'string'){
        msg.value = t.text;
      }
    }

    // Nudge the app so it rebuilds the curved text immediately (so it doesn't "disappear")
    nudgeInput(msg);

    // After the app rebuilds, select the newest non-system object so it's easy to move
    const c = C(); if (!c) return;
    setTimeout(() => {
      try{
        const objs = c.getObjects ? c.getObjects() : [];
        for (let i = objs.length - 1; i >= 0; i--){
          const o = objs[i];
          if (!o) continue;
          if (o._isBase || o._raBrandFooter || o._raSys || o._raTokenId) continue;
          if (o.visible === false) o.visible = true;
          c.setActiveObject(o);
          o.setCoords && o.setCoords();
          break;
        }
        c.requestRenderAll && c.requestRenderAll();
      }catch(_){}
    }, 40);
  }

  function boot(){
    const card = findCustomTextCard();
    const cb   = findCurvedCheckbox(card);
    if (!card || !cb){ setTimeout(boot, 250); return; }

    // Hook once
    if (cb.__raPrimeHooked) return;
    cb.__raPrimeHooked = true;
    cb.addEventListener('change', () => setTimeout(onCurvedToggle, 10), true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
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
  function isSys(o){ return !!(o && (o._isBase || o._raBrandFooter || o._raSys || o._raTokenId)); }
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
  function isSys(o){ return !!(o && (o._isBase || o._raBrandFooter || o._raSys || o._raTokenId)); }
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

/* ========== RA_WATERMARK_HARDLOCK_v1 — keep big watermark unmovable, even after "Unlock All" ========== */
(() => {
  function C(){ return window.canvas || null; }

  // Identify the big watermark. We lock "system" overlays but leave base, footer and token-ID alone.
  function isWM(o){
    if (!o) return false;
    if (o._raWM || o._raWatermark || o._isWatermark || o._wm) return true; // common flags
    // Treat other system overlays as locked too, but allow footer / token-ID / base / bg
    if (o._raSys && !o._raBrandFooter && !o._raTokenId && !o._isBase && !o._isBgRect) return true;
    const n = (o.name||o.id||'').toString().toLowerCase();
    if (n.includes('watermark') || n === 'wm') return true;
    return false;
  }

  function hardLock(o){
    if (!o) return;
    o.set?.({ selectable:false, evented:false, hasControls:false, lockMovementX:true, lockMovementY:true });
    o.selectable = false; o.evented = false; o.hasControls = false;
    o.lockMovementX = true; o.lockMovementY = true;
  }

  function relockAll(){
    const c=C(); if (!c) return;
    (c.getObjects?.()||[]).forEach(o => { if (isWM(o)) hardLock(o); });
    try{ c.discardActiveObject(); c.requestRenderAll(); }catch(_){}
  }

  function hookUnlockAllButton(){
    const buttons = Array.from(document.querySelectorAll('button'));
    const unlockBtn = buttons.find(b => /unlock\s*all/i.test((b.textContent||'').trim()));
    if (!unlockBtn) return;
    // After Unlock All fires, immediately re-lock the watermark
    unlockBtn.addEventListener('click', ()=> setTimeout(relockAll,0), true);
  }

  function boot(){
    const c=C(); if (!c){ setTimeout(boot,200); return; }
    relockAll();                         // lock now
    document.addEventListener('ra-wm-recalc', ()=> setTimeout(relockAll,0)); // lock after WM toggles
    c.on?.('object:added', e => { const o=e?.target; if (isWM(o)) setTimeout(relockAll,0); }); // lock if reinserted
    hookUnlockAllButton();
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();

/* ==========================================================
   RA_OPEN_NEW_TAB_VIEWER_V2 (HARDENED)
   - Hooks ONLY the button with id="openNewTab" (no text sniffing)
   - Opens a clean viewer tab first, then sends a Blob URL (Safari-safe)
   - Never navigates the original tab
   - Paste at the VERY BOTTOM of app.js
   ========================================================== */
(function RA_OPEN_NEW_TAB_VIEWER_V2(){
  if (window.__RA_OPEN_NEW_TAB_VIEWER_V2__) return;
  window.__RA_OPEN_NEW_TAB_VIEWER_V2__ = true;

  function getCanvas(){
    if (window.canvas && typeof window.canvas.toDataURL === 'function') return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas.lower-canvas') || document.querySelector('canvas');
    if (el){
      for (const k in window){
        try{
          const v = window[k];
          if (v && v.upperCanvasEl && typeof v.toDataURL === 'function') { window.canvas = v; return v; }
        }catch(_){}
      }
    }
    return null;
  }

  function getMultiplier(){
    const el = document.getElementById('exportMultiplier') || document.getElementById('exportQuality');
    const raw = (el?.value || el?.textContent || '').trim();
    const m = parseInt((raw.match(/([1-8])/)||[])[1] || '2', 10);
    return Math.min(8, Math.max(1, m || 2));
  }

  function openViewer(){
    const c = getCanvas();
    if (!c){ alert('Canvas not ready'); return; }

    // Open the tab immediately (user gesture → popup-safe)
    const win = window.open('about:blank','_blank');
    if (!win){ alert('Popup blocked. Allow popups or use the Download button.'); return; }

    // Lightweight viewer shell
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Export</title>
      <style>
        html,body{height:100%;margin:0;background:#0b0c10;overflow:auto;}
        .viewer{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0c10;}
        img{display:block;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);width:auto;height:auto;
            box-shadow:0 8px 24px rgba(0,0,0,.5);border-radius:8px;image-rendering:auto;}
        .hud{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);
             color:#e5e7eb;opacity:.75;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
             background:rgba(0,0,0,.35);padding:6px 8px;border-radius:6px;user-select:none}
      </style></head><body>
        <div class="viewer"><img id="raImg" alt="export"></div>
        <div class="hud">Click image to toggle: Fit ↔ Actual size</div>
        <script>
          (function(){
            var img = document.getElementById('raImg'), fit = true;
            function apply(){ if (fit){ img.style.maxWidth='calc(100vw - 32px)'; img.style.maxHeight='calc(100vh - 32px)'; }
                              else { img.style.maxWidth='none'; img.style.maxHeight='none'; } }
            img.addEventListener('click', function(){ fit=!fit; apply(); });
            apply();
            window.addEventListener('message', function(ev){
              if (ev && ev.data && ev.data.type==='ra-img') { img.src = ev.data.url; }
            }, false);
            setTimeout(function(){
              if (!img.src) {
                document.body.insertAdjacentHTML(
                  'beforeend',
                  '<div style="position:fixed;left:50%;top:10px;transform:translateX(-50%);color:#e5e7eb;opacity:.75;font:12px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial">No image received.</div>'
                );
              }
            }, 2000);
          })();
        <\/script>
      </body></html>`;
    win.document.open(); win.document.write(html); win.document.close();

    // Produce the PNG and send a Blob URL to the viewer (more reliable than giant data: URLs)
    try{
      const mult = getMultiplier();
      const dataUrl = c.toDataURL({ format:'png', multiplier: mult, enableRetinaScaling:true });
      fetch(dataUrl).then(r=>r.blob()).then(blob=>{
        const url = URL.createObjectURL(blob);
        try { win.postMessage({ type:'ra-img', url }, '*'); } catch(_){}
        const tid = setInterval(()=>{ if (win.closed){ URL.revokeObjectURL(url); clearInterval(tid); } }, 4000);
      }).catch(()=>{
        try{ win.document.body.innerHTML =
          '<div style="padding:14px;font:14px/1.4 -apple-system,Segoe UI,Arial;color:#e5e7eb">Export failed (CORS/security). Use same-origin or CORS-enabled images.</div>'; }catch(_){}
      });
    }catch(e){
      try{ win.document.body.innerHTML =
        '<div style="padding:14px;font:14px/1.4 -apple-system,Segoe UI,Arial;color:#e5e7eb">Export blocked (CORS). Use same-origin or CORS-enabled images.</div>'; }catch(_){}
    }
  }

  // Capture ONLY the actual “Open in new tab” button (id="openNewTab")
  document.addEventListener('click', function(e){
    const btn = e.target && e.target.closest && e.target.closest('#openNewTab');
    if (!btn) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    openViewer();
  }, true);
})();

/* ===== RA_CLEAR_PATCH_DELAYED_GUARD — preserve base/sys only if NO JSON restore follows ===== */
(function RA_CLEAR_PATCH_DELAYED_GUARD(){
  if (window.__RA_CLEAR_PATCH_DELAYED_GUARD__) return;
  window.__RA_CLEAR_PATCH_DELAYED_GUARD__ = true;

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  function patch(c){
    if (!c || c.__raClearPatched) return;
    const _clear = c.clear.bind(c);

    c.clear = function(){
      // Snapshot keepers BEFORE clearing
      const keep = [];
      (this.getObjects?.()||[]).forEach(o=>{
        if (o && (o._isBase || o._raSys)) keep.push(o);
      });

      // Perform the real clear
      _clear();

      // Defer re-add: if a JSON load kicks off immediately, we skip
      const me = this;
      setTimeout(()=> {
        if (window.__raLoadingJSON) return; // JSON restore in progress → do not re-add
        try { keep.forEach(o=> me.add(o)); } catch(_){}
        try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
        try { me.requestRenderAll(); } catch(_){}
      }, 80);
    };

    c.__raClearPatched = true;
  }

  (function wait(){ const c=C(); if (!c){ setTimeout(wait,150); return; } patch(c); })();
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
    (c.getObjects() || []).slice().forEach(o => { if (o && o._isBase) c.remove(o); });
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
