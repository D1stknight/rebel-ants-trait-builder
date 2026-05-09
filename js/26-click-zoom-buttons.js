// ============================================================================
// 26-click-zoom-buttons.js
// Original app.js lines 5318-5461 (144 lines)
// ============================================================================


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