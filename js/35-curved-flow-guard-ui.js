// ============================================================================
// 35-curved-flow-guard-ui.js
// Original app.js lines 6909-6991 (83 lines)
// ============================================================================


/* ========== RA_CURVED_FLOW_GUARD_UI_v3 — require “Add Text” before Curved (UI-only, no canvas edits) ========== */
(()=>{
  if (window.__RA_CURVED_GUARD_UI_V3) return; window.__RA_CURVED_GUARD_UI_V3 = true;

  const C = ()=> window.canvas || null;

  function hasUserText(){
    const c = C(); if (!c) return false;
    const objs = (c.getObjects?.() || []);
    for (const o of objs){
      if (!o || o._isBase || false || o._raTokenId || o._raSys) continue;
      const t = (o.type||'').toLowerCase();
      if (t==='text' || t==='textbox' || t==='i-text') return true;
      if (t==='group'){
        try{
          if (o.getObjects().some(k => ((k.type||'').toLowerCase().includes('text')))) return true;
        }catch(_){}
      }
    }
    return false;
  }

  function findCustomTextCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent||''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }

  function findCurvedControl(card){
    if (!card) return null;
    // Label "Curved" with a checkbox or custom switch.
    const labels = Array.from(card.querySelectorAll('label')).filter(l => /curved/i.test(l.textContent||''));
    for (const lab of labels){
      const id = lab.getAttribute('for');
      if (id){
        const el = document.getElementById(id);
        if (el) return el;
      }
      const cb = lab.querySelector('input[type="checkbox"]');
      if (cb) return cb;
    }
    // Fall back to common “switch” patterns inside the Custom Text card
    return card.querySelector('[role="switch"], .switch, .toggle') || null;
  }

  function showInlineHint(anchor){
    let hint = document.getElementById('raCurvedHintInline');
    if (!hint){
      hint = document.createElement('div');
      hint.id = 'raCurvedHintInline';
      hint.textContent = 'Add Text first, then enable Curved.';
      hint.style.cssText = 'margin-top:6px;font-size:12px;color:#fbbf24;opacity:.95';
      (anchor?.parentElement || anchor || document.body).appendChild(hint);
    }
    clearTimeout(hint._t);
    hint.style.display = '';
    hint._t = setTimeout(()=>{ hint.style.display = 'none'; }, 1800);
  }

  function wire(){
    const card = findCustomTextCard(); if (!card){ setTimeout(wire, 300); return; }
    const ctl  = findCurvedControl(card); if (!ctl){ setTimeout(wire, 300); return; }

    const blockIfNoText = (ev)=>{
      if (hasUserText()) return;              // OK: already have a text object
      try{ ev.stopImmediatePropagation(); }catch(_){}
      try{ ev.preventDefault(); }catch(_){}
      // If it’s a real checkbox, keep the UI in the OFF state
      if ((ctl.tagName||'').toLowerCase()==='input' && ctl.type==='checkbox'){ ctl.checked = false; }
      showInlineHint(ctl);
    };

    // Capture-phase so we run before the app’s own handler
    ctl.addEventListener('change',      blockIfNoText, true);
    ctl.addEventListener('click',       blockIfNoText, true);
    ctl.addEventListener('pointerdown', blockIfNoText, true);
    ctl.addEventListener('keydown',     (e)=>{ if ((e.key===' '||e.key==='Enter') && !hasUserText()){ blockIfNoText(e); }}, true);
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire, { once:true });
  else wire();
})();