// ============================================================================
// 34-front-guard-safe.js
// Original app.js lines 6874-6908 (35 lines)
// ============================================================================


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