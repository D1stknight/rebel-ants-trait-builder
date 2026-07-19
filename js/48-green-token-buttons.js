// ============================================================================
// 48-green-token-buttons.js
// Original app.js lines 10089-10125 (37 lines)
// ============================================================================


/* =========================================================
   RA GREEN TOKEN BUTTONS v1 — tag "Delete Token ID" & "Load Token ID"
   Works across desktop, iPad, and mobile; survives re-renders.
   ========================================================= */
(function RA_GREEN_TOKEN_BUTTONS_V1(){
  if (window.__RA_GREEN_TOKEN_BUTTONS_V1__) return;
  window.__RA_GREEN_TOKEN_BUTTONS_V1__ = true;

  const qs  = (s,r)=> (r||document).querySelector(s);
  const qsa = (s,r)=> Array.from((r||document).querySelectorAll(s));

  function tag(){
    const left = qs('aside.panel.left') || document;
    // Find the card/section that contains "Token ID Styles"
    const scopes = qsa('aside.panel.left .card, aside.panel.left section, aside.panel.left .panel, aside.panel.left');
    let host = left;
    for (const el of scopes){
      const txt = (el.textContent||'').toLowerCase();
      if (txt.includes('token id styles') || txt.includes('token id')) { host = el; break; }
    }

    // Tag the two buttons
    qsa('button,[role="button"],.btn', host).forEach(b=>{
      const t = (b.textContent||'').trim().toLowerCase();
      if (/^delete\s*token\s*id$/.test(t) || /^load\s*token\s*id$/.test(t)){
        b.classList.add('ra-green-action');
      }
    });
  }

  const run = (()=>{ let raf=0; return ()=>{ if (raf) return; raf=requestAnimationFrame(()=>{raf=0; tag();}); };})();
  if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', run, { once:true }); }
  else { run(); }

  new MutationObserver(run).observe(document.documentElement, { childList:true, subtree:true });
})();