// ============================================================================
// 02-json-restore-and-bootstrap.js
// Original app.js lines 623-849 (227 lines)
// ============================================================================


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