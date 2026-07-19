// ============================================================================
// 06-canvas-fixed-center.js
// Original app.js lines 1850-2003 (154 lines)
// ============================================================================


/* ==========================================================
   RA_FIXED_CENTER_CANVAS_V2 (Phase 2 aware)
   - Fixes ghost dimension staleness
   - Optional true viewport centering (config)
   - Throttled reposition
   - Safe cleanup + re-init guard
   ========================================================== */
(function RA_FIXED_CENTER_CANVAS_V2(){
  if (window.__RA_FIXED_CENTER_INIT__) return;
  window.__RA_FIXED_CENTER_INIT__ = true;

  // Config flags (tweak as desired)
  const TRUE_VIEWPORT_CENTER = true;   // if false: keep original column X position
  const MIN_TOP              = 12;     // clamp so it never hugs the very top
  const DISABLE_MOBILE_MAX_W = 640;    // disable on very narrow viewports (set null to always enable)
  const Z_INDEX              = 40;     // slightly above typical UI, below modals you might set later

  function byId(id){ return document.getElementById(id); }
  function getCanvasCard(){
    const c = byId('c');
    if (!c) return null;
    return c.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper') || c.parentElement;
  }

  function install(){
    const card = getCanvasCard();
    if (!card) { setTimeout(install, 180); return; }
    if (card.__raFixedCenterApplied) return;
    card.__raFixedCenterApplied = true;

    // Respect mobile disable
    if (DISABLE_MOBILE_MAX_W && window.innerWidth <= DISABLE_MOBILE_MAX_W) {
      return; // leave in flow
    }

    // Create/update ghost placeholder
    const ghost = document.createElement('div');
    ghost.id = 'raCanvasGhost';
    ghost.setAttribute('aria-hidden','true');
    ghost.style.visibility = 'hidden';
    ghost.style.pointerEvents = 'none';
    ghost.style.width  = card.offsetWidth + 'px';
    ghost.style.height = card.offsetHeight + 'px';

    // Insert ghost just before card so layout stays
    card.parentNode.insertBefore(ghost, card);

    // Capture initial flow rect for column anchoring
    let initialRect = ghost.getBoundingClientRect();

    Object.assign(card.style, {
      position: 'fixed',
      zIndex: String(Z_INDEX),
      margin: 0,
      left: '0px',
      top:  '0px',
      right:'auto',
      transform: 'none'
    });

    // Throttle reposition inside rAF
    let pending = false;
    function requestPlace(){
      if (pending) return;
      pending = true;
      requestAnimationFrame(()=>{
        pending = false;
        place();
      });
    }

    // Late reflows (background image, fonts, injected cards) can shift the
    // column after install; re-place once things settle.
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestPlace); } catch(_){}
    window.addEventListener('load', requestPlace);
    setTimeout(requestPlace, 600);
    setTimeout(requestPlace, 1800);

    function updateGhostSize(){
      // Keep ghost dimension synced in case card interior changed
      try {
        ghost.style.width  = card.offsetWidth + 'px';
        ghost.style.height = card.offsetHeight + 'px';
      } catch(_) {}
    }

    function place(){
      if (!document.body.contains(card)) return; // removed
      updateGhostSize();
      const gRect = ghost.getBoundingClientRect();

      // Column X origin (from initialRect, to maintain original horizontal alignment if not centering)
      if (!initialRect || !initialRect.width) initialRect = gRect;

      const cardHeight = card.offsetHeight || gRect.height;
      let top = Math.max(MIN_TOP, Math.round((window.innerHeight - cardHeight) / 2));

      // On very tall layouts you may prefer not to overly center—optionally clamp
      // Example: if (cardHeight > window.innerHeight * 0.9) top = MIN_TOP;

      let left;
      if (TRUE_VIEWPORT_CENTER){
        // Fully center in viewport horizontally
        const cardWidth = card.offsetWidth || gRect.width;
        left = Math.max(0, Math.round((window.innerWidth - cardWidth) / 2));
      } else {
        // Maintain column alignment using original flow X
        left = Math.round(gRect.left);
      }

      card.style.top  = top  + 'px';
      card.style.left = left + 'px';
      card.style.width = gRect.width + 'px';
    }

    // Observers
    let roCard, roGhost;
    try {
      roCard = new ResizeObserver(()=> requestPlace());
      roCard.observe(card);
    } catch(_) {}
    try {
      roGhost = new ResizeObserver(()=> requestPlace());
      roGhost.observe(ghost);
    } catch(_) {}

    window.addEventListener('scroll', requestPlace, { passive: true });
    window.addEventListener('resize', requestPlace);

    document.addEventListener('ra:canvas-ready', requestPlace);

    // Public cleanup if needed
    window.__RA_UNFIX_CANVAS = function(){
      try {
        window.removeEventListener('scroll', requestPlace);
        window.removeEventListener('resize', requestPlace);
        roCard && roCard.disconnect();
        roGhost && roGhost.disconnect();
      } catch(_) {}
      if (card && document.body.contains(card)){
        card.style.position = '';
        card.style.top = '';
        card.style.left = '';
        card.style.width = '';
        card.style.zIndex = '';
      }
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      card && (card.__raFixedCenterApplied = false);
      window.__RA_FIXED_CENTER_INIT__ = false;
    };

    place();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();