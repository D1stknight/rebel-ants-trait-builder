// ============================================================================
// 37-add-text-prime.js
// Original app.js lines 7059-7154 (96 lines)
// ============================================================================


/* ========== RA_ADD_TEXT_PRIME_v1 — keep text visible after 'Add Text' ========== */
(() => {
  const C = () => window.canvas || null;

  // Find the Custom Text card + its pieces
  function findCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent || ''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }
  function findMsg(card){
    return card ? (card.querySelector('textarea, input[type="text"], input:not([type])') || null) : null;
  }
  function findAddBtn(card){
    if (!card) return null;
    return Array.from(card.querySelectorAll('button'))
      .find(b => /(^|\s)add\s*text(\s|$)/i.test(b.textContent || ''));
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

  let LAST_TYPED = '';

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

  function boot(){
    const card   = findCard();
    const msg    = findMsg(card);
    const addBtn = findAddBtn(card);
    const curved = findCurved(card);
    if (!card || !msg || !addBtn){ setTimeout(boot, 250); return; }

    // Remember last non-empty text the user typed
    if (!msg.__raRemember){
      msg.__raRemember = true;
      msg.addEventListener('input', ()=>{
        const v = (msg.value || '').trim();
        if (v) LAST_TYPED = v;
      }, true);
    }

    // After "Add Text", the app clears the box; put the text back and nudge
    if (!addBtn.__raPrime){
      addBtn.__raPrime = true;
      addBtn.addEventListener('click', ()=>{
        // Wait a moment for the app to add the object and clear the field
        setTimeout(()=>{
          if (!msg.value || !msg.value.trim()){
            if (LAST_TYPED){
              msg.value = LAST_TYPED;
              nudge(msg); // keep the new object from vanishing
            } else {
              // Fallback: read whatever text the app just added
              const o = newestUserObject();
              const t = (o && typeof o.text === 'string') ? o.text : '';
              if (t){ msg.value = t; nudge(msg); }
            }
          }
          // If Curved is already ON, select the newest object so it’s easy to move
          if (curved && curved.checked){
            const c = C(); const o = newestUserObject();
            if (c && o){ try{ c.setActiveObject(o); o.setCoords && o.setCoords(); c.requestRenderAll && c.requestRenderAll(); }catch(_){ } }
          }
        }, 30); // if it still blinks, bump to 60–80
      }, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();