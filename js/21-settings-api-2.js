// ============================================================================
// 21-settings-api-2.js
// Original app.js lines 4646-4710 (65 lines)
// ============================================================================


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