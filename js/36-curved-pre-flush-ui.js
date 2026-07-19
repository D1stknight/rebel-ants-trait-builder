// ============================================================================
// 36-curved-pre-flush-ui.js
// Original app.js lines 6992-7058 (67 lines)
// ============================================================================


/* ========== RA_CURVED_PRE_FLUSH_UI_v1 — commit message box before Curved toggles (no canvas edits) ========== */
(()=>{
  if (window.__RA_CURVED_PRE_FLUSH_UI_V1) return; window.__RA_CURVED_PRE_FLUSH_UI_V1 = true;

  const C = ()=> window.canvas || null;

  function hasUserText(){
    const c = C(); if (!c) return false;
    const objs = (c.getObjects?.() || []);
    for (const o of objs){
      if (!o || o._isBase || false || o._raTokenId || o._raSys) continue;
      const t = (o.type||'').toLowerCase();
      if (t==='text' || t==='textbox' || t==='i-text') return true;
      if (t==='group'){
        try{ if (o.getObjects().some(ch => ((ch.type||'').toLowerCase().includes('text')))) return true; }catch(_){}
      }
    }
    return false;
  }

  function findCustomTextCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent||''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }
  function findMessageBox(card){
    return card && (card.querySelector('textarea') ||
                    card.querySelector('input[type="text"]') ||
                    card.querySelector('input:not([type])')) || null;
  }
  function findCurvedControl(card){
    if (!card) return null;
    const labels = Array.from(card.querySelectorAll('label')).filter(l => /curved/i.test(l.textContent||''));
    for (const lab of labels){
      const id = lab.getAttribute('for');
      if (id){ const el = document.getElementById(id); if (el) return el; }
      const cb = lab.querySelector('input[type="checkbox"]'); if (cb) return cb;
    }
    return card.querySelector('[role="switch"], .switch, .toggle') || null;
  }

  function flush(box){
    if (!box) return;
    try { box.dispatchEvent(new Event('input',  { bubbles:true })); } catch(_){}
    try { box.dispatchEvent(new Event('change', { bubbles:true })); } catch(_){}
  }

  function wire(){
    const card = findCustomTextCard(); if (!card){ setTimeout(wire, 300); return; }
    const curved = findCurvedControl(card); if (!curved){ setTimeout(wire, 300); return; }
    const box = findMessageBox(card);

    // Capture phase: run before the app’s own handler
    ['pointerdown','click','change','keydown'].forEach(ev=>{
      curved.addEventListener(ev, (e)=>{
        // Only pre‑commit when a text object already exists; if not, your other guard handles it.
        if (!hasUserText()) return;
        // Commit the latest message so Curved picks it up immediately
        flush(box);
      }, true);
    });
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire, { once:true });
  else wire();
})();