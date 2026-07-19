// ============================================================================
// 38-curved-prime.js
// Original app.js lines 7155-7233 (79 lines)
// ============================================================================


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
  function isSys(o){ return !!(o && (o._isBase || false || o._raSys || o._raTokenId)); }
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