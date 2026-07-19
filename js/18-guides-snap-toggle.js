// ============================================================================
// 18-guides-snap-toggle.js
// Original app.js lines 4330-4368 (39 lines)
// ============================================================================


/* ================= RA_GUIDES_BUTTON_NUDGE_V1 =================
   Repositions the Guides toggle so it sits right after “Snap: On”.
   No behavior change—purely visual alignment. Safe to stack.
   ============================================================ */
(() => {
  const ID = 'raGuidesToggle';
  const SNAP_ID = 'raSnapToggle';

  function nudge(){
    const btn = document.getElementById(ID);
    if (!btn) return;                    // guides not created yet
    const snap = document.getElementById(SNAP_ID);
    const row  = document.getElementById('raSnapRow') ||
                 (snap && snap.parentNode) ||
                 btn.parentNode;

    // If we can find the Snap toggle, place Guides right after it.
    if (snap && snap.parentNode && snap.nextSibling !== btn) {
      snap.parentNode.insertBefore(btn, snap.nextSibling);
    } else if (row && btn.parentNode !== row) {
      row.appendChild(btn);
    }

    // Tidy spacing/alignment
    btn.style.marginLeft = '8px';
    btn.style.marginRight = '0';
    btn.style.marginTop = '0';
    btn.style.alignSelf = 'center';
  }

  // Run now and keep fixing if the UI re-renders
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', nudge, { once:true });
  } else {
    nudge();
  }
  new MutationObserver(nudge).observe(document.documentElement, { childList:true, subtree:true });
})();