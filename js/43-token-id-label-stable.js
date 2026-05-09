// ============================================================================
// 43-token-id-label-stable.js
// Original app.js lines 9298-9590 (293 lines)
// ============================================================================


/* ===============================================================
   RA_TOKEN_ID_LABEL_STABLE_V2
   Comprehensive stability patch for Token ID label:
     - Prevents duplicate / ghost instances after undo/redo
     - Ensures label stays selectable & bound to window.idLabel
     - Adds debounced history snapshots for moves & style changes
     - Rebinds after JSON restore & history operations
     - Provides manual repair & debug utilities
   Remove older RA_TOKEN_ID_HISTORY_FIX_V1 before adding this.
   =============================================================== */
(function RA_TOKEN_ID_LABEL_STABLE_V2(){
  if (window.__RA_TOKEN_ID_LABEL_STABLE_V2__) return;
  window.__RA_TOKEN_ID_LABEL_STABLE_V2__ = true;

  const DEBOUNCE_MS = 420;
  let moveTimer = null;
  let baselineSnapDone = false;
  let canvasReadyTimer = null;

  function C(){
    return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  }

  function log(){ /* Uncomment for debugging
    console.log('[TOKEN_ID_V2]', ...arguments);
  */ }

  /* ---------- Core Helpers ---------- */
  function tokenIdObjects(c){
    c = c || C();
    if (!c) return [];
    try { return (c.getObjects()||[]).filter(o=>o && o._raTokenId); } catch(_){ return []; }
  }

  function pickSurvivor(list){
    if (!list.length) return null;
    // Keep the topmost (last in stacking order)
    return list[list.length - 1];
  }

  function ensureSelectable(o){
    if (!o) return;
    o.selectable = true;
    o.evented = true;
    o.hasControls = true;
    if (typeof o.set === 'function'){
      try { o.set({ selectable:true, evented:true }); } catch(_){}
    }
  }

  function removeDuplicatesAndRebind(c){
    c = c || C();
    if (!c) return null;
    const list = tokenIdObjects(c);
    if (list.length === 0){
      if (window.idLabel && !c.contains(window.idLabel)){
        delete window.idLabel;
      }
      return null;
    }
    let keep = pickSurvivor(list);
    list.forEach(o=>{
      if (o !== keep){
        try { c.remove(o); } catch(_){}
      }
    });
    // Rebind global pointer
    window.idLabel = keep;
    keep._raTokenId = true;
    ensureSelectable(keep);
    try { c.requestRenderAll(); } catch(_){}
    return keep;
  }

  function repair(){
    const c = C(); if (!c) return;
    removeDuplicatesAndRebind(c);
  }

  /* ---------- History Snapshot Integration ---------- */
  function historyPushFn(){
    if (typeof window.forceSnapshot === 'function') return window.forceSnapshot;
    if (window.raHistory){
      if (typeof window.raHistory.forceSnapshot === 'function') return window.raHistory.forceSnapshot;
      if (typeof window.raHistory.push === 'function') return window.raHistory.push;
    }
    if (typeof window.push === 'function') return window.push;
    return null;
  }

  function snapshot(reason){
    const fn = historyPushFn();
    const c = C();
    if (!fn || !c) return;
    try {
      fn(reason);
    } catch(e){
      log('Snapshot error', e);
    }
  }

  function scheduleMoveSnapshot(){
    clearTimeout(moveTimer);
    moveTimer = setTimeout(()=> snapshot('Token ID Move'), DEBOUNCE_MS);
  }

  function baselineSnapshotOnce(){
    if (baselineSnapDone) return;
    baselineSnapDone = true;
    snapshot('Token ID Baseline');
  }

  /* ---------- Event Wiring on Canvas ---------- */
  function wireCanvas(c){
    if (!c || c.__raTokenIdV2Patched) return;
    c.__raTokenIdV2Patched = true;

    c.on('object:added', e=>{
      const o = e.target;
      if (o && o._raTokenId){
        removeDuplicatesAndRebind(c);
        baselineSnapshotOnce();
      } else {
        // After batch adds (undo/redo), do a microtask cleanup
        queueMicrotask(()=> removeDuplicatesAndRebind(c));
      }
    });

    c.on('object:removed', ()=>{
      queueMicrotask(()=> removeDuplicatesAndRebind(c));
    });

    c.on('object:modified', e=>{
      const o = e.target;
      if (o && o._raTokenId){
        ensureSelectable(o);
        removeDuplicatesAndRebind(c);
        scheduleMoveSnapshot();
      }
    });

    // If style panels update font/size/color via direct global idLabel →
    // we run a passive poll after render to ensure pointer validity.
    c.on('after:render', ()=>{
      if (window.idLabel && !c.contains(window.idLabel)){
        removeDuplicatesAndRebind(c);
      }
    });

    c.on('selection:created', ()=> {
      if (window.idLabel && !c.contains(window.idLabel)){
        removeDuplicatesAndRebind(c);
      }
    });
    c.on('selection:updated', ()=> {
      if (window.idLabel && !c.contains(window.idLabel)){
        removeDuplicatesAndRebind(c);
      }
    });

    // Periodic lightweight guard (stops after ~90s)
    let ticks = 0;
    function periodic(){
      if (ticks++ > 900) return;
      try { removeDuplicatesAndRebind(c); } catch(_){}
      setTimeout(periodic, 100);
    }
    setTimeout(periodic, 1000);
  }

  /* ---------- Undo / Redo Wrappers ---------- */
  function wrapUndoRedo(name){
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__raTokenIdV2Wrapped) return;
    window[name] = function(){
      const r = fn.apply(this, arguments);
      // Let restore finish then cleanup
      setTimeout(()=> { removeDuplicatesAndRebind(C()); }, 40);
      setTimeout(()=> { removeDuplicatesAndRebind(C()); }, 160); // second pass for async add bursts
      return r;
    };
    window[name].__raTokenIdV2Wrapped = true;
  }
  wrapUndoRedo('undo');
  wrapUndoRedo('redo');

  /* ---------- JSON Restore Hook (Heuristic) ---------- */
  // If your code dispatches a custom event after loadFromJSON, catch it
  window.addEventListener('ra-json-restored', ()=>{
    setTimeout(()=> removeDuplicatesAndRebind(C()), 50);
    setTimeout(()=> removeDuplicatesAndRebind(C()), 150);
  });

  /* ---------- Public Utilities ---------- */
  window.raTokenIdRepair = repair;
  window.raTokenIdDebug = function(){
    const c = C();
    const objs = tokenIdObjects(c);
    return {
      count: objs.length,
      hasGlobal: !!window.idLabel,
      globalOnCanvas: !!(window.idLabel && c && c.contains(window.idLabel)),
      objectIds: objs.map(o=>o.__uid || o.__internalId || o.id || '(no-id)')
    };
  };
  window.raTokenIdForceSnapshot = function(label){
    snapshot(label || 'Token ID Manual Snapshot');
  };
  window.raTokenIdSelect = function(){
    const c = C(); if (!c) return;
    const label = tokenIdObjects(c)[0];
    if (label){
      c.setActiveObject(label);
      c.requestRenderAll();
      return true;
    }
    return false;
  };

  /* ---------- Canvas Wait / Init ---------- */
  function waitCanvas(tries=0){
    const c = C();
    if (c){
      wireCanvas(c);
      // Initial cleanup passes
      setTimeout(()=> removeDuplicatesAndRebind(c), 30);
      setTimeout(()=> removeDuplicatesAndRebind(c), 120);
      return;
    }
    if (tries < 80){
      canvasReadyTimer = setTimeout(()=> waitCanvas(tries+1), 200);
    }
  }
  waitCanvas();

  /* ---------- Global Style Input Patching (Passive) ----------
     If your style inputs mutate idLabel directly, we tap into set calls here
     by defining a proxy once we have a valid object (light approach). */
  (function patchIdLabelSetter(){
    let applied = false;
    Object.defineProperty(window, '__raIdLabelProxyApplied', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: false
    });

    const check = ()=>{
      const c = C();
      if (!c) return;
      if (!window.idLabel || !c.contains(window.idLabel)) return;

      if (applied) return;
      applied = true;

      // Monkey-patch set() to auto snapshot on style changes
      if (typeof window.idLabel.set === 'function' && !window.idLabel.__raSetPatched){
        const origSet = window.idLabel.set;
        window.idLabel.set = function(k,v){
          const result = origSet.call(this, k, v);
            if (typeof k === 'string'){
              if (/font|fill|stroke|align|text|shadow|color|size/i.test(k)){
                scheduleMoveSnapshot();
              }
            } else if (k && typeof k === 'object'){
              const keys = Object.keys(k).join(',');
              if (/(font|fill|stroke|align|text|shadow|color|size)/i.test(keys)){
                scheduleMoveSnapshot();
              }
            }
          return result;
        };
        window.idLabel.__raSetPatched = true;
      }
    };

    // Poll a few times early; then rely on events
    let attempts = 0;
    function poll(){
      check();
      if (attempts++ < 50) setTimeout(poll, 200);
    }
    poll();

    // Also after each repair
    const origRepair = window.raTokenIdRepair;
    window.raTokenIdRepair = function(){
      origRepair();
      applied = false;
      setTimeout(check, 30);
    };
  })();