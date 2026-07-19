// ============================================================================
// 14-fix-recenter.js
// Original app.js lines 3691-3759 (69 lines)
// ============================================================================



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