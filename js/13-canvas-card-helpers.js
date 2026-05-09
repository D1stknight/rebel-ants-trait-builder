// ============================================================================
// 13-canvas-card-helpers.js
// Original app.js lines 3648-3690 (43 lines)
// ============================================================================


/* ================= RA_DISABLE_FIXED_CANVAS_ON_MOBILE_v1 =================
   Neutralizes RA_FIXED_CENTER_CANVAS_V1 on mobile only.
   - Reverts "position:fixed" styles on the canvas card.
   - Removes #raCanvasGhost spacer that causes the mid‑page blank gap.
   - Desktop unaffected.
   ======================================================================= */
(() => {
  const MQ = '(max-width: 920px)';
  if (!window.matchMedia(MQ).matches) return;

  function getCanvasCard(){
    const c = document.getElementById('c');
    if (!c) return null;
    return c.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper') || c.parentElement;
  }

  function unfix(){
    const card  = getCanvasCard();
    const ghost = document.getElementById('raCanvasGhost');

    if (ghost){
      ghost.remove(); // this is the big blank spacer
    }
    if (card){
      Object.assign(card.style, {
        position:'', zIndex:'', margin:'', left:'', top:'', right:'', transform:'', width:''
      });
      // mark so the desktop fixer (if any) won’t reapply while on mobile
      card.setAttribute('data-ra-mobile-inflow','1');
    }
  }

  function run(){ if (window.matchMedia(MQ).matches) unfix(); }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run, {once:true});
  } else {
    run();
  }
  window.addEventListener('resize',           run, {passive:true});
  window.addEventListener('orientationchange',() => setTimeout(run, 100), {passive:true});
})();