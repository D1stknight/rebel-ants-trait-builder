// ============================================================================
// 25-emoji-pop-placement.js
// Original app.js lines 5261-5317 (57 lines)
// ============================================================================


/* ==========================================================
   RA_EMOJI_POP_PLACEMENT_FIX_V1
   - Keeps the emoji picker fully on-screen.
   - Flips above the button if there isn’t room below.
   - Adds safe max-height + overflow so the bottom rows are reachable.
   ========================================================== */
(() => {
  if (window.__RA_EMOJI_POP_PLACEMENT_FIX_V1__) return;
  window.__RA_EMOJI_POP_PLACEMENT_FIX_V1__ = true;

  const clamp = (v,a,b)=>Math.max(a, Math.min(b, v));

  function placeEmojiPop(){
    const btn = document.getElementById('raEmojiBtn');
    const pop = document.getElementById('raEmojiPop');
    if (!btn || !pop || pop.style.display !== 'block') return;

    const vw = window.innerWidth  || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    // Keep the whole popover inside the viewport and scrollable
    const maxH = Math.min(420, Math.max(240, vh - 24)); // 24px breathing room
    pop.style.maxHeight = maxH + 'px';
    pop.style.overflow  = 'auto';

    // First set near the button, then correct if it overflows
    const rBtn = btn.getBoundingClientRect();

    // Temporarily position to measure its size
    pop.style.left = Math.round(Math.min(rBtn.left, vw - 540)) + 'px';
    pop.style.top  = Math.round(rBtn.bottom + 8) + 'px';

    // Now read actual size
    const rPop = pop.getBoundingClientRect();
    let left = clamp(rBtn.left, 8, vw - rPop.width - 8);
    let top  = rBtn.bottom + 8;

    // If it doesn’t fit below, try above
    if (top + rPop.height > vh - 6) {
      const upTop = rBtn.top - rPop.height - 8;
      top = (upTop >= 8) ? upTop : vh - rPop.height - 6; // clamp to bottom if still too tall
    }
    pop.style.left = Math.round(left) + 'px';
    pop.style.top  = Math.round(Math.max(6, top)) + 'px';
  }

  // Reposition right after the picker opens
  document.addEventListener('click', (e)=>{
    const isEmojiBtn = e.target && (e.target.id === 'raEmojiBtn' || e.target.closest?.('#raEmojiBtn'));
    if (isEmojiBtn) setTimeout(placeEmojiPop, 0);
  }, true);

  // Keep it placed on window changes
  window.addEventListener('resize',           ()=> setTimeout(placeEmojiPop, 0), {passive:true});
  window.addEventListener('orientationchange',()=> setTimeout(placeEmojiPop,100), {passive:true});
})();