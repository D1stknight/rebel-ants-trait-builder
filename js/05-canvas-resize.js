// ============================================================================
// 05-canvas-resize.js
// Original app.js lines 1531-1849 (319 lines)
// ============================================================================


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