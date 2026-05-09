// ============================================================================
// 41-ipad-sticky-layout.js
// Original app.js lines 8676-9025 (350 lines)
// ============================================================================


/* ============================================================
   RA_IPAD_STICKY_LAYOUT_V1
   iPad–only (NOT phones, NOT desktop) three–column sticky layout
   + animated sizing + portrait rotate hint overlay.

   WHAT IT DOES (iPad only):
     • Disables existing mobile flow CSS so layout doesn’t collapse.
     • Creates a horizontal non‑collapsing flex row:
          [ aside.panel.left ] [ main.stage ] [ aside.panel.right ]
     • Sidebars become sticky (independent scroll), middle column scrolls internally.
     • Responsive per orientation (portrait vs landscape) with smooth transitions (180ms).
     • Split view narrow widths auto‑shrink sidebars; horizontal scroll if still too narrow.
     • Portrait rotate overlay encourages landscape (daily “don’t show again” + session dismiss).
     • Respects prefers-reduced-motion (disables transitions / animation).
     • Safe revert / reapply / debug utilities:
         ipadLayoutRevert(), ipadLayoutApply(), ipadLayoutDebug()
       Force test on desktop: add ?forceIpad=1 to URL.

   DOES NOT TOUCH:
     • Desktop sticky layout (pointer:fine) you already added.
     • Phone (true mobile) layout & scripts.
   ============================================================ */
(function RA_IPAD_STICKY_LAYOUT_V1(){
  if (window.__RA_IPAD_STICKY_LAYOUT_V1__) return;
  window.__RA_IPAD_STICKY_LAYOUT_V1__ = true;

  /* ---------- Detection ---------- */
  function isIPad(){
    var ua = navigator.userAgent || '';
    var force = /[?&]forceIpad=1\b/i.test(location.search);
    if (force) return true;
    var legacy = /iPad/i.test(ua);
    var touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    var tabletBand = Math.min(screen.width, screen.height) >= 650; // exclude iPhones
    return (legacy || touchMac) && tabletBand;
  }
  if (!isIPad()) return; // Abort: not iPad

  /* ---------- Config Profiles ---------- */
  var PROFILE = {
    portrait: { sideBase:260, sideMin:250, sideMax:270, midMin:580, stickyTop:8 },
    landscape:{ sideBase:290, sideMin:280, sideMax:300, midMin:700, stickyTop:8 },
    narrow:   { sideBase:240, midMin:520, stickyTop:6 } // split view fallback
  };
  var TRANSITION_MS = 180;
  var EASE = 'cubic-bezier(.4,.14,.3,1)';

  /* ---------- Snapshot / State ---------- */
  var SNAP = {
    applied:false,
    parent:null,parentStyle:'',
    stage:null, stageStyle:'',
    left:null,leftStyle:'',
    right:null,rightStyle:'',
    canvasCard:null, canvasCardStyle:'',
    cssTag:null,
    mobileStyles:[],
    resizeHandler:null,
    orientHandler:null,
    animClass:'ipad-transition'
  };

  var MOBILE_STYLE_IDS = ['ra-mobile-flow-css-v29','ra-mobile-css-fit-v4-style'];

  /* ---------- Utilities ---------- */
  function disableMobileCSS(){
    MOBILE_STYLE_IDS.forEach(function(id){
      var el = document.getElementById(id);
      if (el && !el.__ipadDisabled){
        el.__ipadDisabled = { disabled: el.disabled };
        el.disabled = true;
        SNAP.mobileStyles.push(el);
      }
    });
  }
  function restoreMobileCSS(){
    SNAP.mobileStyles.forEach(function(el){
      if (el.__ipadDisabled){
        el.disabled = el.__ipadDisabled.disabled;
        delete el.__ipadDisabled;
      }
    });
  }
  function unfixCanvasCard(){
    if (window.__RA_UNFIX_CANVAS){
      try { window.__RA_UNFIX_CANVAS(); return; } catch(_){}
    }
    var c = document.getElementById('c');
    if (!c) return;
    var card = c.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper');
    if (card){
      if (!SNAP.canvasCard){
        SNAP.canvasCard = card;
        SNAP.canvasCardStyle = card.getAttribute('style') || '';
      }
      ['position','top','left','right','width','zIndex','transform','margin'].forEach(function(p){ card.style[p]=''; });
      var ghost = document.getElementById('raCanvasGhost'); if (ghost) ghost.remove();
    }
  }
  function findNodes(){
    var stage = document.querySelector('main.stage');
    if (!stage) return null;
    var left  = document.querySelector('aside.panel.left');
    var right = document.querySelector('aside.panel.right');
    var parent = stage.parentElement;
    // Ascend if panels not direct siblings
    if (parent && (left || right)){
      var up = parent;
      while (up && up !== document.body){
        var allInside = true;
        [stage,left,right].forEach(function(n){
          if (n && !up.contains(n)) allInside = false;
        });
        if (allInside){ parent = up; break; }
        up = up.parentElement;
      }
    }
    return { parent:parent, stage:stage, left:left, right:right };
  }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function portrait(){ return window.innerHeight >= window.innerWidth; }

  /* ---------- CSS Injection ---------- */
  function injectCSS(){
    if (SNAP.cssTag) return;
    var st = document.createElement('style');
    st.id = 'ipadStickyLayoutCSS_V1';
    st.textContent =
      '/* iPad sticky layout */' +
      '.ipad-flex-host{display:flex!important;flex-wrap:nowrap!important;align-items:flex-start;gap:16px;overflow-x:auto;overflow-y:visible;}' +
      '.ipad-flex-host > aside.panel.left,' +
      '.ipad-flex-host > aside.panel.right{' +
        'flex:0 0 var(--ipad-side-width,260px);min-width:var(--ipad-side-width,260px);max-width:var(--ipad-side-width,260px);' +
        'box-sizing:border-box;position:sticky;top:var(--ipad-sticky-top,8px);' +
        'max-height:calc(100vh - var(--ipad-side-offset,16px));overflow:auto;scrollbar-width:thin;' +
        'background-clip:padding-box;' +
        'transition: width '+TRANSITION_MS+'ms '+EASE+', max-height '+TRANSITION_MS+'ms '+EASE+', top '+TRANSITION_MS+'ms '+EASE+';' +
      '}' +
      '.ipad-flex-host > main.stage{' +
        'flex:1 1 auto;min-width:var(--ipad-mid-min,600px);box-sizing:border-box;position:relative;' +
        'overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;' +
        'max-height:calc(100vh - var(--ipad-mid-offset,12px));' +
        'transition: max-height '+TRANSITION_MS+'ms '+EASE+', min-width '+TRANSITION_MS+'ms '+EASE+';' +
      '}' +
      /* Transitions toggle class */
      '.ipad-transition *,' +
      '.ipad-transition.ipad-flex-host > aside.panel.left,' +
      '.ipad-transition.ipad-flex-host > aside.panel.right,' +
      '.ipad-transition.ipad-flex-host > main.stage{' +
         'will-change:width,max-height,transform,opacity;' +
      '}' +
      /* Reduced motion */ +
      '@media (prefers-reduced-motion: reduce){' +
        '.ipad-transition *{transition:none!important;animation:none!important;}' +
      '}' +
      /* Optional subtle gradient edges for scroll hint */ +
      '.ipad-scroll-fade::after{' +
        'content:"";position:absolute;left:0;right:0;top:0;height:12px;pointer-events:none;' +
        'background:linear-gradient(to bottom,rgba(0,0,0,.25),rgba(0,0,0,0));' +
      '}' +
      '.ipad-scroll-fade::before{' +
        'content:"";position:absolute;left:0;right:0;bottom:0;height:14px;pointer-events:none;' +
        'background:linear-gradient(to top,rgba(0,0,0,.25),rgba(0,0,0,0));' +
      '}' +
      /* Hide original mobile stage host if present */ +
      '@media (pointer:coarse){#ra-mobile-stage-host,#ra-mobile-stage-frame{display:none!important;}}';
    document.head.appendChild(st);
    SNAP.cssTag = st;
  }

  /* ---------- Apply Layout ---------- */
  function applyStructure(){
    var nodes = findNodes();
    if (!nodes || !nodes.parent || !nodes.stage) return false;

    SNAP.parent = nodes.parent;
    SNAP.stage  = nodes.stage;
    SNAP.left   = nodes.left;
    SNAP.right  = nodes.right;

    if (SNAP.parentStyle === '') SNAP.parentStyle = SNAP.parent.getAttribute('style') || '';
    if (SNAP.stageStyle  === '') SNAP.stageStyle  = SNAP.stage.getAttribute('style')  || '';
    if (SNAP.left && SNAP.leftStyle === '')   SNAP.leftStyle  = SNAP.left.getAttribute('style')  || '';
    if (SNAP.right && SNAP.rightStyle === '') SNAP.rightStyle = SNAP.right.getAttribute('style') || '';

    SNAP.parent.classList.add('ipad-flex-host', SNAP.animClass);
    SNAP.parent.style.alignItems = 'flex-start';

    if (SNAP.stage){
      SNAP.stage.setAttribute('data-ipad-mid','1');
      SNAP.stage.classList.add('ipad-scroll-fade');
    }
    if (SNAP.left)  SNAP.left.setAttribute('data-ipad-side','1');
    if (SNAP.right) SNAP.right.setAttribute('data-ipad-side','1');

    return true;
  }

  /* ---------- Dimension / Orientation Logic ---------- */
  function computeProfile(){
    var w = window.innerWidth;
    var h = window.innerHeight;
    var isPortrait = portrait();
    var base = isPortrait ? PROFILE.portrait : PROFILE.landscape;
    // Narrow override: when split view or very narrow
    var narrowCut = 900;
    if (w < narrowCut){
      base = {
        sideBase: PROFILE.narrow.sideBase,
        sideMin: PROFILE.narrow.sideBase,
        sideMax: PROFILE.narrow.sideBase,
        midMin: PROFILE.narrow.midMin,
        stickyTop: PROFILE.narrow.stickyTop
      };
    }
    return { w:w, h:h, isPortrait:isPortrait, cfg:base };
  }

  function applyDimensions(animated){
    if (!SNAP.parent || !SNAP.stage) return;
    var info = computeProfile();
    var sideW = clamp(info.cfg.sideBase, info.cfg.sideMin, info.cfg.sideMax);
    var midMin = info.cfg.midMin;
    var stickyTop = info.cfg.stickyTop;

    // Set CSS custom props on parent for simpler formulas
    SNAP.parent.style.setProperty('--ipad-side-width', sideW+'px');
    SNAP.parent.style.setProperty('--ipad-mid-min', midMin+'px');
    SNAP.parent.style.setProperty('--ipad-sticky-top', stickyTop+'px');
    SNAP.parent.style.setProperty('--ipad-mid-offset','12px');
    SNAP.parent.style.setProperty('--ipad-side-offset','16px');

    // Horizontal overflow decision
    var totalMin = sideW * ((SNAP.left?1:0)+(SNAP.right?1:0)) + midMin + 16*2; // + gaps approx
    if (info.w < totalMin){
      SNAP.parent.style.overflowX = 'auto';
    } else {
      SNAP.parent.style.overflowX = 'auto'; // keep scroll if needed; consistent
    }

    if (animated){
      // Add transition class if not present
      SNAP.parent.classList.add(SNAP.animClass);
    }
  }

  /* ---------- Resize / Orientation Handlers ---------- */
  var resizeTimer = null;
  function scheduleResize(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      applyDimensions(true);
    }, 70);
  }
  function orientationHandler(){
    // Clear session portrait hint dismissal so overlay can re-show if user returns
    __ROTATE_HINT && __ROTATE_HINT.resetSession && __ROTATE_HINT.resetSession();
    setTimeout(function(){ applyDimensions(true); evaluateRotateHint(); }, 140);
  }

  /* ---------- Rotate Hint Overlay ---------- */
  var __ROTATE_HINT = (function(){
    var overlay, panel;
    var LS_KEY_BLOCK = 'ipadRotateHintBlockDay';
    var dismissedSession = false;

    function blockedToday(){
      try{
        var stamp = localStorage.getItem(LS_KEY_BLOCK);
        if (!stamp) return false;
        return stamp === new Date().toISOString().slice(0,10);
      }catch(_){ return false; }
    }
    function blockToday(){
      try{
        localStorage.setItem(LS_KEY_BLOCK, new Date().toISOString().slice(0,10));
      }catch(_){}
    }
    function build(){
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.id = 'ipadRotateHint';
      overlay.setAttribute('role','dialog');
      overlay.style.cssText = [
        'position:fixed','inset:0','z-index:999999','display:flex',
        'align-items:center','justify-content:center',
        'background:rgba(0,0,0,.38)','padding:env(safe-area-inset-top,12px) 16px 16px',
        'opacity:0','pointer-events:none','transition:opacity 160ms ease'
      ].join(';');
      panel = document.createElement('div');
      panel.style.cssText = [
        'background:#121418','color:#eef2f6','max-width:380px','width:100%',
        'border:1px solid #2b3138','border-radius:18px','padding:24px 22px',
        'box-shadow:0 10px 38px -6px rgba(0,0,0,.55),0 2px 6px -1px rgba(0,0,0,.4)',
        'font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
        'transform:translateY(8px)','opacity:0',
        'transition:opacity 180ms '+EASE+',transform 180ms '+EASE
      ].join(';');
      panel.innerHTML =
        '<div style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:10px;">' +
          '<span style="font-size:24px;">🔄</span> Rotate for best experience' +
        '</div>' +
        '<div style="font-size:14px;opacity:.86;margin-bottom:18px;">Landscape gives you more editing space & keeps panels visible.</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:10px;">' +
          '<button id="ipadHintOk" style="flex:1 1 auto;background:#2563eb;border:0;color:#fff;padding:10px 14px;border-radius:10px;font-weight:600;cursor:pointer;">Got it</button>' +
          '<button id="ipadHintDismiss" style="flex:1 1 auto;background:#1f242a;border:1px solid #343b44;color:#d1d5db;padding:10px 14px;border-radius:10px;cursor:pointer;">Dismiss</button>' +
          '<button id="ipadHintToday" style="flex:1 1 100%;background:#151a1f;border:1px solid #30363d;color:#9ca3af;padding:8px 12px;border-radius:10px;font-size:12px;cursor:pointer;">Don\'t show again today</button>' +
        '</div>';
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches){
        overlay.style.transition='none';
        panel.style.transition='none';
      }

      overlay.addEventListener('click', function(e){ if (e.target === overlay) hide();});
      document.getElementById('ipadHintOk').onclick = hide;
      document.getElementById('ipadHintDismiss').onclick = function(){ dismissedSession = true; hide(); };
      document.getElementById('ipadHintToday').onclick = function(){ blockToday(); hide(); };
    }
    var showing = false;
    function show(){
      if (showing) return;
      build();
      showing = true;
      overlay.style.pointerEvents='auto';
      requestAnimationFrame(function(){
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
    function evaluate(){
      if (!portrait()){ hide(); return; }
      if (blockedToday() || dismissedSession) { hide(); return; }
      show();
    }
    function resetSession(){ dismissedSession = false; }
    return { evaluate:evaluate, hide:hide, show:show, resetSession:resetSession };
  })();