// ============================================================================
// 55-footer-misc.js
// Original app.js lines 10613-10722 (110 lines)
// ============================================================================


/* =========================================================
   Overlay z‑order (late‑binding) — overlay-only reordering
   - Works with “Bring to Front” + “Bring to Back” or “Send to Back”
   - Binds after Fabric is ready; survives UI re-renders
   ========================================================= */
(function(){
  if (window.__raZorderInstalled2) return;
  window.__raZorderInstalled2 = true;

  // How the buttons behave:
  //   'step' -> move one step among overlays (matches your console test)
  //   'edge' -> jump to top/bottom among overlays
  const MODE = 'step';

  // What counts as an overlay in your app
  const isOverlay = o => o && o.type === 'image' && o.selectable !== false;

  // Always fetch the live Fabric canvas (don’t capture it early)
  function getCanv(){
    const cands = [window.canvas, window.fabricCanvas, window.FABRIC_CANVAS, window.builderCanvas];
    for (const c of cands) {
      if (c && typeof c.getObjects === 'function') return c;
    }
    return null;
  }

  // Move one step among overlays only
  function moveStep(dir){
    const canv = getCanv(); if (!canv) return;
    const objs = canv.getObjects();
    const o = canv.getActiveObject?.(); if (!o || !isOverlay(o)) return;

    const ovIdx = objs.map((x,i)=> isOverlay(x) ? i : -1).filter(i => i >= 0);
    const cur   = objs.indexOf(o);
    const pos   = ovIdx.indexOf(cur);
    if (pos === -1) return;

    if (dir === +1 && pos < ovIdx.length-1)      canv.moveTo(o, ovIdx[pos+1]);
    else if (dir === -1 && pos > 0)              canv.moveTo(o, ovIdx[pos-1]);
    else return;

    canv.setActiveObject(o);
    canv.requestRenderAll();
  }

  // Jump to overlay top/bottom (not above watermark / below base)
  function moveEdge(which){
    const canv = getCanv(); if (!canv) return;
    const o = canv.getActiveObject?.(); if (!o || !isOverlay(o)) return;
    const objs = canv.getObjects();
    const ovIdx = objs.map((x,i)=> isOverlay(x) ? i : -1).filter(i => i >= 0);
    if (!ovIdx.length) return;
    const target = (which === 'top') ? ovIdx[ovIdx.length - 1] : ovIdx[0];
    canv.moveTo(o, target);
    canv.setActiveObject(o);
    canv.requestRenderAll();
  }

  // Expose for quick console testing if you want
  window.raStepFwd = () => moveStep(+1);
  window.raStepBack= () => moveStep(-1);
  window.raToFront = () => moveEdge('top');
  window.raToBack  = () => moveEdge('bottom');

  // -------- Button wiring --------
  const right = document.querySelector('aside.panel.right') || document;
  const SEL   = 'button, .btn, [role="button"], .control, .action';
  const norm  = s => (s||'').toLowerCase().replace(/\s+/g,' ').trim();

  // Accept common variants
  const FRONT_KEYS = ['bring to front','bring front','to front','front'];
  const BACK_KEYS  = ['bring to back','send to back','send back','to back','back','bring back'];

  function findBtn(keys){
    const els = [...right.querySelectorAll(SEL)];
    return els.find(el => keys.some(k => norm(el.textContent).includes(k))) || null;
  }

  function wire(btn, fn){
    if (!btn || btn.__raWired) return;
    const handler = () => setTimeout(fn, 40); // run after the app’s own handler
    btn.addEventListener('click', handler, { capture:true });
    btn.addEventListener('pointerdown', handler, { capture:true });
    btn.__raWired = true;
  }

  function rewire(){
    const frontBtn = findBtn(FRONT_KEYS);
    const backBtn  = findBtn(BACK_KEYS);
    const doFront  = (MODE === 'edge') ? () => moveEdge('top')    : () => moveStep(+1);
    const doBack   = (MODE === 'edge') ? () => moveEdge('bottom') : () => moveStep(-1);
    wire(frontBtn, doFront);
    wire(backBtn,  doBack);

    // Debug: you should see this once it latches to real buttons
    console.log('[ra:zorder] wired:',
      !!frontBtn, !!backBtn, '–',
      frontBtn?.textContent?.trim(), '|', backBtn?.textContent?.trim()
    );
  }

  // Wait until Fabric + canvas exist, then wire and keep wiring
  (function wait(){
    if (!window.fabric || !getCanv()) { setTimeout(wait, 120); return; }
    rewire();
    const mo = new MutationObserver(rewire);
    mo.observe(document.body, { childList:true, subtree:true });
  })();
})();