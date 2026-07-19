// ============================================================================
// 45-phone-rotate-hint.js
// Original app.js lines 9673-9838 (166 lines)
// ============================================================================


/* ===============================================================
   RA_PHONE_ROTATE_HINT_V1
   Portrait-only rotate suggestion overlay for PHONES (not iPad, not desktop).
   - Appears on phones (touch, non-iPad) in portrait orientation.
   - Encourages landscape usage for better canvas workspace.
   - Dismiss / Don't show again today options.
   - Force test: add ?forcePhone=1 to URL.
   - Public helpers: phoneRotateHintShow(), phoneRotateHintHide(), phoneRotateHintEval()
   =============================================================== */
(function RA_PHONE_ROTATE_HINT_V1(){
  if (window.__RA_PHONE_ROTATE_HINT_V1__) return;
  window.__RA_PHONE_ROTATE_HINT_V1__ = true;

  const LS_KEY_BLOCK = 'phoneRotateHintBlockDay';
  let dismissedSession = false;
  let overlay, panel;
  let resizeTimer = null;

  /* ---------------- Detection ---------------- */
  function isIPad(){
    const ua = navigator.userAgent;
    const legacy = /iPad/i.test(ua);
    const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    const tabletBand = Math.min(screen.width, screen.height) >= 650;
    return (legacy || touchMac) && tabletBand;
  }
  function isPhoneDevice(){
    if (/[?&]forcePhone=1\b/i.test(location.search)) return true;
    if (isIPad()) return false;
    const ua = navigator.userAgent;
    const mobileUA = /(iPhone|Android.*Mobile|Mobile Safari|Mobile;|Pixel)/i.test(ua);
    const coarse = matchMedia('(pointer:coarse)').matches;
    // Heuristic: smaller min screen dimension to exclude tablets.
    const dimBand = Math.min(screen.width, screen.height) < 650;
    return coarse && mobileUA && dimBand;
  }
  function isPortrait(){
    return window.innerHeight >= window.innerWidth;
  }

  /* ---------------- Persistence ---------------- */
  function blockedToday(){
    try {
      const stamp = localStorage.getItem(LS_KEY_BLOCK);
      if (!stamp) return false;
      return stamp === new Date().toISOString().slice(0,10);
    } catch(_) { return false; }
  }
  function blockToday(){
    try {
      localStorage.setItem(LS_KEY_BLOCK, new Date().toISOString().slice(0,10));
    } catch(_) {}
  }

  /* ---------------- Build Overlay ---------------- */
  function build(){
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'phoneRotateHintOverlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-live','polite');
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:999999',
      'display:flex','align-items:center','justify-content:center',
      'background:rgba(0,0,0,.42)',
      'padding:env(safe-area-inset-top,12px) 16px 16px',
      'opacity:0','pointer-events:none',
      'transition:opacity 160ms ease'
    ].join(';');

    panel = document.createElement('div');
    panel.style.cssText = [
      'background:#121418','color:#eef2f6','width:100%','max-width:360px',
      'border:1px solid #2b3138','border-radius:18px','padding:22px 20px',
      'box-shadow:0 10px 32px -6px rgba(0,0,0,.55),0 2px 6px -1px rgba(0,0,0,.4)',
      'font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      'transform:translateY(8px)','opacity:0',
      'transition:opacity 180ms cubic-bezier(.4,.14,.3,1),transform 180ms cubic-bezier(.4,.14,.3,1)'
    ].join(';');

    panel.innerHTML =
      '<div style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
        '<span style="font-size:22px;">🔄</span> Rotate for best workspace' +
      '</div>' +
      '<div style="font-size:14px;opacity:.85;margin-bottom:18px;">Landscape gives more room for the canvas and panels.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
        '<button id="phoneHintOk" style="flex:1 1 auto;background:#2563eb;border:0;color:#fff;padding:10px 14px;border-radius:10px;font-weight:600;cursor:pointer;">Got it</button>' +
        '<button id="phoneHintDismiss" style="flex:1 1 auto;background:#1f242a;border:1px solid #343b44;color:#d1d5db;padding:10px 14px;border-radius:10px;cursor:pointer;">Dismiss</button>' +
        '<button id="phoneHintToday" style="flex:1 1 100%;background:#151a1f;border:1px solid #30363d;color:#9ca3af;padding:8px 12px;border-radius:10px;font-size:12px;cursor:pointer;">Don\'t show again today</button>' +
      '</div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      overlay.style.transition='none';
      panel.style.transition='none';
    }

    overlay.addEventListener('click', e=>{
      if (e.target === overlay) hide();
    });

    document.getElementById('phoneHintOk').onclick = hide;
    document.getElementById('phoneHintDismiss').onclick = function(){ dismissedSession = true; hide(); };
    document.getElementById('phoneHintToday').onclick = function(){ blockToday(); hide(); };
  }

  let showing = false;
  function show(){
    if (showing) return;
    build();
    showing = true;
    overlay.style.pointerEvents='auto';
    requestAnimationFrame(()=>{
      overlay.style.opacity='1';
      panel.style.opacity='1';
      panel.style.transform='translateY(0)';
    });
  }
  function hide(){
    if (!showing) return;
    showing = false;
    overlay.style.opacity='0';
    overlay.style.pointerEvents='none';
    panel.style.opacity='0';
    panel.style.transform='translateY(8px)';
  }

  /* ---------------- Evaluation Logic ---------------- */
  function evaluate(){
    if (!isPhoneDevice()){ hide(); return; }
    if (!isPortrait()){ hide(); return; }
    if (blockedToday() || dismissedSession){ hide(); return; }
    show();
  }

  function scheduleEvaluate(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(evaluate, 90);
  }

  window.addEventListener('resize', scheduleEvaluate, { passive:true });
  window.addEventListener('orientationchange', ()=>{
    // Re-allow hint after user rotates away then back.
    dismissedSession = false;
    setTimeout(evaluate, 140); // allow viewport settle
  }, { passive:true });

  // Public helpers
  window.phoneRotateHintShow = show;
  window.phoneRotateHintHide = hide;
  window.phoneRotateHintEval = evaluate;

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', evaluate, { once:true });
  } else {
    evaluate();
  }

  // Console note
  try {
    console.log('[PhoneRotateHint] Ready. Force show: phoneRotateHintShow(); force hide: phoneRotateHintHide();');
  } catch(_){}
})();