// ============================================================================
// 07-mobile-css.js
// Original app.js lines 2004-2201 (198 lines)
// ============================================================================


/* =========================================
   RA_MOBILE_FLOW_v29  — MOBILE ONLY (≤900px)
   - Canvas/Stage enters normal page flow above "Rebel Ant"
   - Hides original Konva container (removes stray checkerboard)
   - Scales via stage.scale (no CSS transforms) + syncs DOM size
   - Debounced resize/orientation handling
   - Clean teardown when leaving mobile breakpoint
   ========================================= */
(() => {
  const MEDIA_Q = '(max-width: 900px)';
  const CSS = `
    @media ${MEDIA_Q}{
      #ra-mobile-stage-host{
        order:-1;
        width:100%;
        display:flex;
        justify-content:center;
        margin:12px 0 8px;
      }
      #ra-mobile-stage-frame{
        width: min(92vw, 620px);
        aspect-ratio: 1 / 1;
        position: relative;
        border-radius: 12px;
        overflow: hidden;
        background:#0d0e13;
      }
      #ra-mobile-checker{
        position:absolute; inset:0; border-radius:inherit; pointer-events:none;
        background-image:
          linear-gradient(45deg, rgba(0,0,0,.35) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(0,0,0,.35) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(0,0,0,.35) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(0,0,0,.35) 75%);
        background-size: 24px 24px;
        background-position: 0 0, 0 12px, 12px -12px, -12px 0px;
      }
      #ra-mobile-stage-frame > .konvajs-content,
      #ra-mobile-stage-frame > canvas{
        position:absolute; top:0; left:0; border-radius:inherit;
      }
      .ra-canvas-floater,[data-ra-role="stage-floater"]{ display:none !important; }
    }`;

  const mq = window.matchMedia(MEDIA_Q);
  let applied = false;
  let styleEl, host, frame, checker, live, origRoot, origRootDisplay, mo;
  let rafPending = false;

  function $(q){ return document.querySelector(q); }
  function $$(q){ return Array.from(document.querySelectorAll(q)); }

  function findKonvaContent(){
    // Prefer window.stage.getContent if stage exists
    if (window.stage && typeof window.stage.getContent === 'function') {
      return window.stage.getContent();
    }
    // Fallback: first konvajs-content that is not obviously Fabric
    const candidates = $$('.konvajs-content');
    if (candidates.length) return candidates[0];
    return null;
  }

  function findUploadCard(){
    const h = $$('h1,h2,h3').find(n => /rebel\s*ant/i.test((n.textContent||'')));
    return h ? (h.closest('.card, .panel, section, form, div') || h.parentElement) : null;
  }

  function debounced(fn){
    return function(){
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(()=>{
        rafPending = false;
        fn();
      });
    };
  }

  const fitStageIntoFrame = debounced(function fit(){
    if (!mq.matches || !applied || !frame) return;
    if (!window.stage){
      // Retry shortly until stage is ready
      setTimeout(fitStageIntoFrame, 120);
      return;
    }
    try {
      const content = window.stage.getContent?.() || live;
      if (!content) return;

      // Logical base size (assumes square or uses max dimension)
      const baseW = window.stage.width();
      const baseH = window.stage.height();
      const logicalSide = Math.max(baseW, baseH) || 1024;

      const targetPx = frame.clientWidth; // square frame width

      // Scale the stage itself (Konva coordinate system remains logical)
      const scale = targetPx / logicalSide;
      window.stage.scale({ x: scale, y: scale });
      window.stage.position({ x: 0, y: 0 });

      // Reflect visual size in DOM for proper pointer mapping
      content.style.width  = `${targetPx}px`;
      content.style.height = `${targetPx}px`;

      // Optionally you could also do: window.stage.batchDraw();
      window.stage.draw();
    } catch(_) {}
  });

  function apply(){
    if (!mq.matches || applied) return;
    // Guard: only proceed if we have a Konva environment (avoid hijacking Fabric canvas)
    const konvaContent = findKonvaContent();
    if (!konvaContent) return;

    live = konvaContent;
    origRoot = live.parentElement;
    if (!origRoot) return;

    host = document.createElement('div');
    host.id = 'ra-mobile-stage-host';
    frame = document.createElement('div');
    frame.id = 'ra-mobile-stage-frame';
    checker = document.createElement('div');
    checker.id = 'ra-mobile-checker';
    frame.appendChild(checker);
    host.appendChild(frame);

    const card = findUploadCard();
    const container = card?.parentElement || document.body;
    if (card) container.insertBefore(host, card); else container.prepend(host);

    frame.appendChild(live);

    origRootDisplay = origRoot.style.display;
    origRoot.style.display = 'none';

    try { window.stage?.draggable(false); } catch(_) {}

    fitStageIntoFrame();
    applied = true;
  }

  function cleanup(){
    if (!applied) return;
    try {
      if (live && origRoot) origRoot.appendChild(live);
      if (origRoot) origRoot.style.display = origRootDisplay || '';
      host?.remove();
    } catch(_) {}
    applied = false;
  }

  function kick(){
    if (mq.matches) {
      apply();
      fitStageIntoFrame();
    } else {
      cleanup();
    }
  }

  // Inject CSS once
  styleEl = document.getElementById('ra-mobile-flow-css-v29');
  if (!styleEl){
    styleEl = document.createElement('style');
    styleEl.id = 'ra-mobile-flow-css-v29';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  // Observe DOM to catch late stage creation (e.g., async mount)
  if (!mo){
    mo = new MutationObserver(() => {
      if (mq.matches && !applied) apply();
    });
    mo.observe(document.documentElement, { childList:true, subtree:true });
  }

  window.addEventListener('resize', fitStageIntoFrame, {passive:true});
  window.addEventListener('orientationchange', () => setTimeout(fitStageIntoFrame, 200), {passive:true});
  mq.addEventListener?.('change', kick);

  // Expose manual toggles if needed
  window.__RA_MOBILE_STAGE_REFRESH = fitStageIntoFrame;
  window.__RA_DISABLE_MOBILE_FLOW = function(){
    cleanup();
    mq.removeEventListener?.('change', kick);
    window.removeEventListener('resize', fitStageIntoFrame);
    window.removeEventListener('orientationchange', fitStageIntoFrame);
    mo && mo.disconnect();
  };

  kick();
})();