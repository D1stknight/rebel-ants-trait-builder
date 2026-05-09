// ============================================================================
// 44-unlock-token-id.js
// Original app.js lines 9591-9672 (82 lines)
// ============================================================================


  log('Token ID Stable V2 patch initialized.');
})();

/* ===============================================================
   RA_UNLOCK_TOKEN_ID_FIX_V1
   Ensures "Unlock All" also unlocks the Token ID label (_raTokenId).
   =============================================================== */
(function RA_UNLOCK_TOKEN_ID_FIX_V1(){
  if (window.__RA_UNLOCK_TOKEN_ID_FIX_V1__) return;
  window.__RA_UNLOCK_TOKEN_ID_FIX_V1__ = true;

  function C(){
    return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  }

  function unlockTokenId(){
    const c = C(); if (!c) return;
    const label = (c.getObjects()||[]).find(o => o && o._raTokenId);
    if (!label) return;

    // Restore interactivity
    label.set({
      selectable: true,
      evented: true,
      hasControls: true,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false
    });

    // Some Fabric builds use per‑axis flags; ensure they’re cleared
    label.lockMovementX = label.lockMovementY =
      label.lockScalingX = label.lockScalingY =
      label.lockRotation = false;

    try {
      // Make sure it gets proper selection handles
      if (c.getActiveObject() !== label){
        c.setActiveObject(label);
      }
    } catch(_){}

    try { label.setCoords && label.setCoords(); } catch(_){}
    try { c.requestRenderAll(); } catch(_){}
  }

  function attach(){
    const btn = document.getElementById('unlockAll');
    if (!btn) {
      // Retry a few times if UI not yet built
      let tries = 0;
      const iv = setInterval(()=>{
        const b = document.getElementById('unlockAll');
        if (b){
          clearInterval(iv);
          attach();
        } else if (++tries > 40){
          clearInterval(iv);
        }
      }, 200);
      return;
    }

    // Add a secondary listener; run AFTER the original handler.
    btn.addEventListener('click', ()=>{
      // Let original listener finish its work first.
      setTimeout(unlockTokenId, 10);
    });

    // Provide a manual helper
    window.raUnlockTokenId = unlockTokenId;
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', attach, { once:true });
  } else {
    attach();
  }
})();