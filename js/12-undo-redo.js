// ============================================================================
// 12-undo-redo.js
// Original app.js lines 3355-3647 (293 lines)
// ============================================================================



(() => {
  if (window.__RA_UNDO_SAFE_V1B__) return;
  window.__RA_UNDO_SAFE_V1B__ = true;

  const MAX = 60;
  const DRAFT_KEY = 'ra_draft_v1';
  const COALESCE_MS = 120;          // broader window & resets on each event
  const AUTO_CLEAR_ON_BASE_SWAP = true;

  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const defer = (fn, ms=0)=>setTimeout(fn, ms);

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }
  let c;

  let history = [];
  let idx = -1;
  let burstTimer = null;
  let lastBaseSignature = null;

  // Guard flags
  let MUTE = 0;
  const isMuted = () => MUTE > 0;

  // Active object tracking (injection of stable ids)
  let nextHistId = 1;
  function ensureId(o){
    if (!o) return;
    if (!o._histId) o._histId = 'H'+(nextHistId++);
  }

  const EXTRA = [
    '_kind','_isBase','_isBgRect','raWM','raPos',
    '_histId','_raSys','_raTokenId','false','false','false','_rabrandbar',
    'selectable','evented','hasControls',
    'lockMovementX','lockMovementY','lockScalingX','lockScalingY','lockRotation',
    'globalCompositeOperation','opacity','flipX','flipY'
  ];

  function snapshotBaseSignature(){
    if (!c) return '';
    const base = (c.getObjects()||[]).find(o=>o && o._isBase);
    if (!base) return '';
    // use src or top-left dimension hash
    const src = base.getSrc && base.getSrc();
    return `${base.type}:${base.width}x${base.height}:${src||''}`;
  }

  function serialize(){
    if (!c || isMuted()) return null;
    (c.getObjects()||[]).forEach(ensureId);
    const j = c.toJSON(EXTRA);
    j.__w  = c.getWidth();
    j.__h  = c.getHeight();
    j.__vt = c.viewportTransform || [1,0,0,1,0,0];
    // store active object id if exists
    const active = c.getActiveObject && c.getActiveObject();
    j.__active = active && active._histId ? active._histId : null;
    return JSON.stringify(j);
  }

  function restore(jsonStr, label=''){
    if (!c || !jsonStr) return;
    MUTE++;
    window.__RA_RESTORING__ = true;
    try {
      const data = JSON.parse(jsonStr);
      c.loadFromJSON(data, () => {
        try {
          if (data.__w && data.__h){ c.setWidth(data.__w); c.setHeight(data.__h); }
          if (Array.isArray(data.__vt)) c.setViewportTransform(data.__vt);

          c.getObjects().forEach(o=>{
            ensureId(o);
            if (o._isBase){
              o.selectable=false; o.evented=false; o.hasControls=false;
              o.lockMovementX=o.lockMovementY=o.lockScalingX=o.lockScalingY=o.lockRotation=true;
            }
            if (o._isBgRect || o._raSys){
              o.selectable=false; o.evented=false;
            }
          });

          // Try to reselect previous active object
          if (data.__active){
            const target = c.getObjects().find(o => o._histId === data.__active);
            if (target) c.setActiveObject(target);
          }

          try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
          // Legacy hook removed
          try { /* no-op */ } catch(_){}

          c.requestRenderAll();
        } finally {
          MUTE--;
          window.__RA_RESTORING__ = false;
          refresh(label);
        }
      });
    } catch(e){
      MUTE--;
      window.__RA_RESTORING__ = false;
      refresh(label);
    }
  }

  function push(label=''){
    const s = serialize(); if (!s) return;
    // Base swap auto-clear (optional)
    if (AUTO_CLEAR_ON_BASE_SWAP){
      const sig = snapshotBaseSignature();
      if (lastBaseSignature && sig && sig !== lastBaseSignature){
        // new base encountered: start fresh
        history = [];
        idx = -1;
      }
      lastBaseSignature = sig;
    }

    // If we undid into the middle, cut tail
    if (idx < history.length - 1) history = history.slice(0, idx + 1);
    if (history[idx] === s){ refresh(label); return; }

    history.push(s);
    if (history.length > MAX){
      history.shift();
    }
    idx = history.length - 1;
    refresh(label);
  }

  function undo(){ if (idx <= 0) return; idx -= 1; restore(history[idx], 'Undo'); }
  function redo(){ if (idx >= history.length - 1) return; idx += 1; restore(history[idx], 'Redo'); }

  // Public API
  function canUndo(){ return idx > 0; }
  function canRedo(){ return idx >= 0 && idx < history.length - 1; }
  function forceSnapshot(label='Manual'){ push(label); }
  function clearHistory(msg='Cleared'){ history=[]; idx=-1; refresh(msg); }

  window.raHistory = {
    undo, redo, push:forceSnapshot,
    canUndo, canRedo,
    clear: clearHistory,
    length: () => history.length,
    index: () => idx
  };

  // ---------- UI ----------
  let ui = {};
  function ensureUI(){
    const existing = {
      undo: $('#raUndoBtn'),
      redo: $('#raRedoBtn'),
      save: $('#raSaveDraftBtn'),
      load: $('#raLoadDraftBtn'),
      clr : $('#raClearDraftBtn'),
      info: $('#raHistInfo')
    };
    if (existing.undo || existing.redo){
      ui = existing;
      if (ui.undo) ui.undo.onclick = undo;
      if (ui.redo) ui.redo.onclick = redo;
      if (ui.save) ui.save.onclick = saveDraft;
      if (ui.load) ui.load.onclick = restoreDraft;
      if (ui.clr)  ui.clr.onclick  = ()=>{ localStorage.removeItem(DRAFT_KEY); refresh('Draft cleared'); };
      return;
    }

    const holder =
      $$('h3').find(h => /selection/i.test((h.textContent||'').trim()))?.parentNode
      || document.body;

    const row = document.createElement('div');
    row.id = 'raHistoryRow';
    row.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center';

    const mk = (id, txt)=>{ const b=document.createElement('button'); b.id=id; b.textContent=txt; b.className='btn small'; return b; };
    const undoB = mk('raUndoBtn','Undo (0)');
    const redoB = mk('raRedoBtn','Redo (0)');
    const saveB = mk('raSaveDraftBtn','Save Draft');
    const loadB = mk('raLoadDraftBtn','Restore Draft');
    const clrB  = mk('raClearDraftBtn','×');
    const info = document.createElement('div');
    info.id='raHistInfo'; info.style.cssText='font-size:11px;opacity:.65';

    row.append(undoB, redoB, saveB, loadB, clrB, info);
    holder.appendChild(row);
    ui = {undo:undoB, redo:redoB, save:saveB, load:loadB, clr:clrB, info};

    undoB.onclick = undo;
    redoB.onclick = redo;
    saveB.onclick = saveDraft;
    loadB.onclick = restoreDraft;
    clrB.onclick  = ()=>{ localStorage.removeItem(DRAFT_KEY); refresh('Draft cleared'); };
  }

  function refresh(msg=''){
    ensureUI();
    const stepsBack = idx;                        // # undo steps available
    const stepsForward = history.length - 1 - idx;
    if (ui.undo) ui.undo.disabled = stepsBack <= 0;
    if (ui.redo) ui.redo.disabled = stepsForward <= 0;
    if (ui.load) ui.load.disabled = !localStorage.getItem(DRAFT_KEY);

    if (ui.undo) ui.undo.textContent = `Undo (${stepsBack})`;
    if (ui.redo) ui.redo.textContent = `Redo (${stepsForward})`;
    if (ui.info) ui.info.textContent = `History ${idx + 1} / ${history.length}${msg ? ' • ' + msg : ''}`;
  }

  // Draft Save/Restore
  function saveDraft(){
    if (idx>=0){
      try {
        localStorage.setItem(DRAFT_KEY, history[idx]);
        refresh('Draft saved');
      } catch(_){
        refresh('Draft failed');
      }
    }
  }
  function restoreDraft(){
    const j = localStorage.getItem(DRAFT_KEY);
    if (!j) return refresh('No draft');
    history = [j]; idx=0;
    restore(j, 'Draft restored');
  }

  // Burst coalescing (resets timer each new qualifying event)
  function schedulePush(label){
    if (isMuted()) return;
    if (burstTimer) clearTimeout(burstTimer);
    burstTimer = setTimeout(()=>{
      burstTimer=null;
      push(label);
    }, COALESCE_MS);
  }

  function isUserObject(o){
    if (!o) return false;

    if (o._isBgRect || o._isBase || o._raSys || o._raTokenId) return false;
    if (false || false || false || o._rabrandbar) return false;
    return true;
  }

  function wire(){
    c = C(); if (!c) return defer(wire, 120);
    ensureUI();

    // Baseline snapshot after initial asynchronous setup
    defer(()=>{ push('Init'); }, 180);

    c.on('object:modified', e=>{
      if (isUserObject(e?.target)) schedulePush('Edit');
    });
    c.on('object:added', e=>{
      if (isUserObject(e?.target)) schedulePush('Add');
    });
    c.on('object:removed', e=>{
      if (isUserObject(e?.target)) schedulePush('Remove');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e)=>{
      const tag=(e.target&&e.target.tagName||'').toLowerCase();
      if (/^(input|textarea|select)$/.test(tag) || e.target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey||e.ctrlKey) && key==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
      else if (((e.metaKey||e.ctrlKey) && key==='z' && e.shiftKey) ||
               ((e.metaKey||e.ctrlKey) && key==='y')){ e.preventDefault(); redo(); }
    });

    // Canvas size dropdown
    const sizeEl = document.getElementById('canvasSize');
    if (sizeEl && !sizeEl.__raHistBound){
      sizeEl.__raHistBound = true;
      sizeEl.addEventListener('change', ()=> schedulePush('Resize'));
    }

    refresh('Ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, {once:true});
  } else {
    wire();
  }
})();