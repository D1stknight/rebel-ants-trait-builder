// ============================================================================
// 47-blue-buttons.js
// Original app.js lines 10015-10079 (65 lines)
// ============================================================================


/* =========================================================
   RA BLUE BUTTONS v3 — tag original buttons (incl. “x”)
   - Works on desktop, iPad, and mobile
   - No layout changes; only adds classes for styling
   ========================================================= */
(function RA_BLUE_BUTTONS_V3(){
  if (window.__RA_BLUE_BUTTONS_V3__) return;
  window.__RA_BLUE_BUTTONS_V3__ = true;

  const qs  = (s,r)=> (r||document).querySelector(s);
  const qsa = (s,r)=> Array.from((r||document).querySelectorAll(s));

  const RIGHT = qs('aside.panel.right') || document;  // safe fallback

  // Map label -> class to add
  const RULES = [
    { re:/^\s*undo/i,          cls:'ra-blue-action' },
    { re:/^\s*redo/i,          cls:'ra-blue-action' },
    { re:/^\s*save\s*draft/i,  cls:'ra-blue-action' },
    { re:/^\s*restore\s*draft/i, cls:'ra-blue-action' }  // keep strong; change to ghost if you prefer
  ];

  function tagActionButtons(scope){
    const btns = qsa('button,[role="button"],.btn', scope);
    btns.forEach(b=>{
      const t = (b.textContent||'').trim();
      for (const r of RULES){
        if (r.re.test(t)) { b.classList.add(r.cls); break; }
      }
    });
  }

  function tagCloseX(scope){
    // Find a “History n / m …” line, then look nearby for a close control
    const nodes = qsa('*', scope);
    const historyLine = nodes.find(n => /history\s+\d+\s*\/\s*\d+/i.test((n.textContent||'')));
    const host = historyLine ? historyLine.parentElement : scope;

    // Candidates around the history line
    let cands = qsa('button,[role="button"],.btn,[class*="close"],[aria-label*="close"],[title*="close"]', host);
    // Prefer an element whose text is literally "x" or "×"
    let closeEl = cands.find(el => /^(x|×)$/i.test((el.textContent||'').trim()));
    if (!closeEl) {
      // Fallback: any element that clearly means “close/clear/dismiss”
      closeEl = cands.find(el => {
        const lab = (el.getAttribute('aria-label')||'').toLowerCase();
        const tit = (el.getAttribute('title')||'').toLowerCase();
        const txt = (el.textContent||'').trim().toLowerCase();
        return /close|clear|dismiss/.test(lab) || /close|clear|dismiss/.test(tit) || txt === 'x' || txt === '×';
      });
    }
    if (closeEl) closeEl.classList.add('ra-blue-ghost'); // or 'ra-blue-action' if you want it full blue
  }

  function apply(){
    tagActionButtons(RIGHT);
    tagCloseX(RIGHT);
  }

  // Run now + keep in sync as the panel updates
  const run = (()=> {
    let raf = 0;
    return ()=> { if (raf) return; raf = requestAnimationFrame(()=>{ raf=0; apply(); }); };
  })();