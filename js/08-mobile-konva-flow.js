// ============================================================================
// 08-mobile-konva-flow.js
// Original app.js lines 2202-2371 (170 lines)
// ============================================================================


/* ====================== RA_MOBILE_CSS_FIT_V4 (MOBILE ONLY) ======================
   Coexists with RA_MOBILE_FLOW_v29:
   - If Konva mobile flow (v29) is active, this script no-ops.
   - Otherwise (e.g., Fabric-only), it fits the main canvas via CSS without changing intrinsic size.
   - Hides fixed-center ghost & stray checkerboard siblings once.
   ============================================================================== */
(() => {
  const MQ = '(max-width: 920px)';
  if (!window.matchMedia(MQ).matches) return;
  if (window.__RA_MOBILE_CSS_FIT_V4__) return;
  window.__RA_MOBILE_CSS_FIT_V4__ = true;

  // If Konva mobile flow script is present (v29), it manages layout itself.
  if (window.__RA_MOBILE_STAGE_REFRESH || document.getElementById('ra-mobile-stage-frame')) {
    // Konva flow active → bail
    return;
  }

  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const  $ = (s, r=document)=>r.querySelector(s);

  function isLikelyOffscreenUtilityCanvas(c){
    // Heuristic: extremely small or 0-sized logical canvases used for measurement
    return (c.width <= 2 && c.height <= 2);
  }

  function findStageCanvas(){
    // Prefer a Fabric canvas (id="c") if present
    const primary = $('#c');
    if (primary && primary.width && primary.height) return primary;

    // Otherwise pick the largest non-trivial canvas
    const all = $$('canvas').filter(c => !isLikelyOffscreenUtilityCanvas(c));
    if (!all.length) return null;
    return all.reduce((a,b)=> (b.width * b.height > (a?.width||0)*(a?.height||0) ? b : a), null);
  }

  function hideGhostsAndStrips(wrap){
    const ghost = document.getElementById('raCanvasGhost');
    if (ghost && ghost.getAttribute('data-ra-hidden-gap') !== '1'){
      ghost.style.display = 'none';
      ghost.style.height  = '0px';
      ghost.style.margin  = '0';
      ghost.style.padding = '0';
      ghost.setAttribute('data-ra-hidden-gap', '1');
    }

    [wrap?.previousElementSibling, wrap?.nextElementSibling].forEach(el => {
      if (!el || el.getAttribute('data-ra-hidden-gap') === '1') return;
      const cs = getComputedStyle(el);
      const looksChecker = (cs.backgroundImage||'').includes('linear-gradient')
                        || (cs.backgroundImage||'').includes('repeating');
      const looksEmpty = el.getBoundingClientRect().height < 12 || !(el.textContent||'').trim();
      if (looksChecker || looksEmpty){
        el.style.display = 'none';
        el.style.height  = '0';
        el.style.margin  = '0';
        el.style.padding = '0';
        el.setAttribute('data-ra-hidden-gap', '1');
      }
    });
  }

  let rafPending = false;
  function cssFit(){
    if (!window.matchMedia(MQ).matches) return;
    // Skip if Konva stage is present (let RA_MOBILE_FLOW handle)
    if (window.stage && typeof window.stage.getContent === 'function') return;

    const stage = findStageCanvas();
    if (!stage) return;
    const wrap = stage.parentElement || stage;

    const W = Math.max(1, stage.width);
    const H = Math.max(1, stage.height);

    const host  = wrap.parentElement || document.body;
    const hostW = Math.max(320, host.clientWidth || window.innerWidth);
    const sidePad = 28;
    const targetW = Math.min(W, hostW - sidePad);
    const scale   = Math.min(1, targetW / W);
    const dW      = Math.round(W * scale);
    const dH      = Math.round(H * scale);

    Object.assign(wrap.style, {
      width: dW + 'px',
      height: dH + 'px',
      maxWidth: '100%',
      margin: '0 auto 16px auto',
      position: 'relative'
    });

    $$('canvas', wrap).forEach(c => {
      c.style.width    = dW + 'px';
      c.style.height   = dH + 'px';
      c.style.maxWidth = '100%';
      c.style.display  = 'block';
    });

    hideGhostsAndStrips(wrap);
  }

  function scheduleFit(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      cssFit();
    });
  }

  function bindLoadTriggers(){
    const markers = $$('section,div').filter(n => (n.innerText||'').toLowerCase().includes('rebel ant'));
    markers.forEach(card => {
      $$('button', card).forEach(btn => {
        const t = (btn.textContent||'').toLowerCase().trim();
        if (['load', 'load by token', 'clear upload'].includes(t)){
          if (!btn.__raFitBound){
            btn.__raFitBound = true;
            btn.addEventListener('click', () => setTimeout(scheduleFit, 60), {passive:true});
          }
        }
      });
      const file = $('input[type="file"]', card);
      if (file && !file.__raFitBound){
        file.__raFitBound = true;
        file.addEventListener('change', () => setTimeout(scheduleFit, 60), {passive:true});
      }
    });
  }

  // MutationObserver to refit on dynamic UI changes
  const mo = new MutationObserver(() => {
    if (!window.matchMedia(MQ).matches) return;
    // Skip if Konva stage logic appears later
    if (window.stage && typeof window.stage.getContent === 'function') return;
    bindLoadTriggers();
    scheduleFit();
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('resize',           scheduleFit, {passive:true});
  window.addEventListener('orientationchange',() => setTimeout(scheduleFit, 150), {passive:true});

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { bindLoadTriggers(); scheduleFit(); }, {once:true});
  } else {
    bindLoadTriggers(); scheduleFit();
  }

  const styleId = 'ra-mobile-css-fit-v4-style';
  if (!document.getElementById(styleId)){
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      @media ${MQ} {
        [data-ra-hidden-gap="1"] { display:none !important; height:0 !important; margin:0 !important; padding:0 !important; }
      }
    `;
    document.head.appendChild(s);
  }

  // Public disable if needed
  window.__RA_DISABLE_MOBILE_CSS_FIT = function(){
    mo.disconnect();
    window.removeEventListener('resize', scheduleFit);
    window.removeEventListener('orientationchange', scheduleFit);
  };
})();