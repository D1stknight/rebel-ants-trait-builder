// ============================================================================
// 23-settings-api-4.js
// Original app.js lines 4847-4985 (139 lines)
// ============================================================================


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