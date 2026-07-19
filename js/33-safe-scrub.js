// ============================================================================
// 33-safe-scrub.js
// Original app.js lines 6841-6873 (33 lines)
// ============================================================================


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