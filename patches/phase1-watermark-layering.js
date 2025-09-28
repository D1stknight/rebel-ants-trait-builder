/* ============================================================
 * Phase 1A: Watermark Stabilization + Layer Manager + Overlay Normalization
 * Branch: new-9/25
 * Safe additive patch (no direct removals from app.js yet).
 * ============================================================ */

(function(){
  if (window.__RA_PHASE1_WM_LAYERS_INSTALLED) return;
  window.__RA_PHASE1_WM_LAYERS_INSTALLED = true;

  const DEBUG = true;  // set to false after validation
  const raf = window.requestAnimationFrame || (fn=>setTimeout(fn,16));
  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : window.canvas || null;

  /* ---------------- Event Bus (lightweight) --------------- */
  window.RA = window.RA || {};
  if (!window.RA.bus){
    const listeners = new Map();
    window.RA.bus = {
      on(evt, fn){
        if (!listeners.has(evt)) listeners.set(evt, new Set());
        listeners.get(evt).add(fn);
        return () => { try { listeners.get(evt)?.delete(fn); } catch(_){} };
      },
      off(evt, fn){
        try { listeners.get(evt)?.delete(fn); } catch(_){ }
      },
      emit(evt, payload){
        (listeners.get(evt)||[]).forEach(fn=>{
          try { fn(payload); } catch(e){ console.error('[bus handler error]', evt, e); }
        });
      }
    };
  }

  function log(...a){ if (DEBUG) console.log('[P1]', ...a); }

  /* --------------- Detectors (duplicate tolerant) --------- */
  const isFooter = o => !!(o && (o._raBrandFooter || o._raFooterId === 'footer-group' ||
    (typeof o.text === 'string' && /powered\s+by/i.test(o.text))));
  const isWM     = o => !!(o && (o._raWMCenter === true || o._isWatermark === true || o._raWatermark === true || o._wm));
  const isBase   = o => !!(o && (o._isBase || o._raBaseSig === 'BASE_V1' || o._tokenContract));
  const isBg     = o => !!(o && o._isBgRect);
  const isTokenId= o => !!(o && o._raTokenId);
  const isSys    = o => !!(o && (isWM(o)||isFooter(o)||isBg(o)||isBase(o)||isTokenId(o)||o._raSys));

  function normalizeOverlay(o){
    if (!o) return;
    if (isSys(o)) return;
    if (o._kind === 'overlay') return;
    const t = (o.type||'').toLowerCase();
    if (t.includes('text')) return;    // text overlays handled separately
    o._kind = 'overlay';
  }

  function normalizeAllOverlays(c){
    try { (c.getObjects?.()||[]).forEach(normalizeOverlay); } catch(_){ }
  }

  /* ---------------- Unified Watermark Controller ---------- */
  const UWM = {
    cfg: {
      enabled: true,
      showOnTokens: true,
      showOnUploads: true,
      sizePct: 0.88,
      opacity: 0.18
    },
    reasons: new Set(),
    dirty: false,
    busy: false
  };

  // Attempt to absorb prior admin settings if defined
  try {
    const s = window.__RA_WM_ADMIN_SETTINGS;
    if (s && typeof s === 'object'){
      Object.assign(UWM.cfg, {
        enabled: s.enabled ?? UWM.cfg.enabled,
        showOnTokens: s.showOnTokens ?? UWM.cfg.showOnTokens,
        showOnUploads: s.showOnUploads ?? UWM.cfg.showOnUploads,
        sizePct: s.sizePct ?? UWM.cfg.sizePct,
        opacity: s.opacity ?? UWM.cfg.opacity
      });
    }
  } catch(_){ }

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  function findWM(c){
    const objs = c.getObjects?.()||[];
    for (let o of objs) if (isWM(o)) return o;
    return null;
  }

  function currentContentMode(){
    const c=C(); if (!c) return 'unknown';
    return (c.getObjects?.()||[]).some(o=>isBase(o)) ? 'token' : 'upload';
  }

  function shouldShowWM(){
    if (!UWM.cfg.enabled) return false;
    if (window.__raWMForce && window.__raWMForce.off) return false;
    const mode = currentContentMode();
    if (mode === 'token' && !UWM.cfg.showOnTokens) return false;
    if (mode === 'upload' && !UWM.cfg.showOnUploads) return false;
    return true;
  }

  function ensureNat(wm){
    if (!wm) return;
    if (!wm._natW){
      const sx=wm.scaleX||1, sy=wm.scaleY||1;
      wm._natW = wm.width / sx;
      wm._natH = wm.height / sy;
    }
  }

  function scaleAndSeat(wm, c){
    ensureNat(wm);
    if (!wm._natW) return;
    const cw = c.getWidth?.()||0;
    const targetW = cw * clamp(UWM.cfg.sizePct, 0.3, 1.2);
    const scale = clamp(targetW / wm._natW, 0.05, 5);
    wm.scaleX = wm.scaleY = scale;
    wm.opacity = clamp(UWM.cfg.opacity,0,1);
    wm.originX='center'; wm.originY='center';
    wm.left = (c.getWidth?.()||0)/2;
    wm.top  = (c.getHeight?.()||0)/2;
    wm.evented = false;
    wm.selectable = false;
    try { wm.setCoords(); } catch(_){ }
  }

  function reconcile(reason){
    if (UWM.busy) return;
    UWM.busy = true;
    const c = C();
    if (!c){
      UWM.busy = false;
      return;
    }
    let wm = findWM(c);

    if (!shouldShowWM()){ 
      if (wm){ try { c.remove(wm); c.requestRenderAll(); } catch(_){ } }
      UWM.reasons.clear();
      UWM.busy = false;
      return;
    }

    if (!wm){
      try {
        const imgAsset = window.__RA_WM_IMAGE || window.__RA_WATERMARK_IMAGE;
        if (imgAsset instanceof Image && window.fabric){
          wm = new fabric.Image(imgAsset, {
            _raWMCenter:true,
            _raSys:true,
            selectable:false,
            evented:false,
            opacity:0.01,
            originX:'center', originY:'center'
          });
          c.add(wm);
        }
      } catch(_){ }
      wm = wm || findWM(c);
      if (!wm){
        setTimeout(()=> queue('await-asset'), 120);
        UWM.busy = false;
        return;
      }
    }

    scaleAndSeat(wm, c);
    queueLayer('wm-reconcile');
    try { c.requestRenderAll(); } catch(_){ }
    if (DEBUG) log('Reconciled WM', { reasons:[...UWM.reasons], scale:wm.scaleX });
    UWM.reasons.clear();
    UWM.busy = false;
  }

  function defer(fn, ms=0){ return setTimeout(fn, ms); }

  function queue(reason){
    UWM.reasons.add(reason||'unknown');
    if (UWM._timer) return;
    UWM._timer = defer(()=>{
      UWM._timer = null;
      reconcile('debounced');
    }, 70);
  }

  // Public hook
  window.raWM = window.raWM || {};
  window.raWM.update = (r)=> queue(r||'manual');

  // Monkey patch legacy scalers (if they exist)
  ['ensureCenteredWM','scaleToCanvas','seatAboveBase'].forEach(name=>{
    try {
      if (typeof window[name] === 'function'){
        const orig = window[name];
        window[name] = function(){
          if (DEBUG) log('legacy '+name+' suppressed -> queue');
          queue('legacy:'+name);
        };
      }
    } catch(_){ }
  });

  // Canvas event hookups
  (function ensureCanvas(tries=0){
    const c = C();
    if (!c){
      if (tries < 60) return setTimeout(()=>ensureCanvas(tries+1),120);
      return;
    }
    ['object:added','object:removed','object:modified'].forEach(ev=>{
      try { c.on(ev, e=>{
        if (ev === 'object:added' && e?.target) normalizeOverlay(e.target);
        queue('fabric:'+ev);
        queueLayer('fabric:'+ev);
      }); } catch(_){ }
    });
    queue('canvas-ready');
  })();

  // External events
  ['ra-wm-recalc','ra-collection-change','ra-holder-update',
   'wallet/disconnect','wallet/connect'].forEach(ev=>{
    document.addEventListener(ev, ()=> queue(ev), { passive:true });
  });

  // Resize debounced
  window.addEventListener('resize', (()=> {
    let t=null;
    return ()=>{
      if (t) clearTimeout(t);
      t=setTimeout(()=>{ queue('resize'); queueLayer('resize'); },90);
    };
  })());

  // Guard watcher
  setInterval(()=>{
    const c=C(); if (!c) return;
    const wm=findWM(c);
    if (wm && (wm.scaleX > 6 || wm.scaleX < 0.03)){ 
      if (DEBUG) log('Guard rescale trigger', wm.scaleX);
      queue('guard-scale');
    }
  }, 4000);

  /* ---------------- Layer Manager ------------------------- */
  let layerDirty=false, layerTimer=null;

  function classify(o){
    if (isBg(o)) return 0;
    if (isBase(o)) return 1;
    if (isWM(o)) return 2;
    if (isTokenId(o)) return 5;
    if (isFooter(o)) return 6;
    const t=(o.type||'').toLowerCase();
    if (t.includes('text')) return 4;
    if (!isSys(o)) return 3; // generic overlay
    return 3;
  }

  function enforceLayerOrder(){
    const c = C(); if (!c) return;
    const objs = c.getObjects?.()||[];
    if (!objs.length) return;

    const sorted = objs.slice().sort((a,b)=> classify(a)-classify(b));

    let changed=false;
    for (let i=0;i<sorted.length;i++){ 
      if (sorted[i] !== objs[i]) { changed=true; break; }
    }
    if (!changed) return;

    try {
      // Rebuild ordering by removing & re-adding (preserves object refs & events)
      sorted.forEach(o=> c.bringToFront(o));
    } catch(e){ console.warn('[P1] layer reorder error', e); }
    try { c.requestRenderAll(); } catch(_){ }
    if (DEBUG) log('Layer order enforced');
  }

  function queueLayer(){
    layerDirty = true;
    if (layerTimer) return;
    layerTimer = raf(()=>{
      layerTimer = null;
      if (!layerDirty) return;
      layerDirty = false;
      enforceLayerOrder();
    });
  }

  window.__RA_ENFORCE_LAYERS_NOW = enforceLayerOrder;

  document.addEventListener('ra-anim-before-run', ()=> {
    const c=C(); if (!c) return;
    normalizeAllOverlays(c);
    queueLayer('anim-normalize');
  });

  // Kick
  queue('boot');
  queueLayer('boot');
  normalizeAllOverlays(C());

  if (DEBUG){
    window.__RA_WM_DUMP = ()=>{
      const c=C(); const wm=findWM(c);
      console.log('[P1:dump]', {
        cfg:UWM.cfg,
        wm: wm ? { scale:wm.scaleX, w:wm.width, h:wm.height, natW:wm._natW, natH:wm._natH } : null,
        objs: c?.getObjects?.().length
      });
    };
  }

})();