// ============================================================================
// 42-canvas-size-500.js
// Original app.js lines 9124-9297 (174 lines)
// ============================================================================


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