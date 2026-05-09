// ============================================================================
// 17-guides-top.js
// Original app.js lines 4148-4329 (182 lines)
// ============================================================================


/* ==========================================================
   RA_SMART_GUIDES_ON_TOP_V2
   • Draws guides on Fabric's TOP canvas (contextTop) so they’re above everything.
   • FIX: True canvas center (uses W/2, H/2 correctly).
   • FIX: HiDPI/CSS scaling correct (uses devicePixelRatio/clientWidth mapping).
   • Button now lives in the existing Snap row (away from the “×” button).
   • Auto‑hide after drop; no impact on export or undo/redo.
   ========================================================== */
(() => {
  if (window.__RA_GUIDES_TOP_V2__) return;
  window.__RA_GUIDES_TOP_V2__ = true;

  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const  $ = (s,r=document)=>r.querySelector(s);
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  // ------- options -------
  const S = {
    on: true,
    tol: 12,      // proximity (screen px) to show a guide
    lingerMs: 120 // tiny linger so eyes can register the snap
  };

  // ------- put toggle in your existing "Snap / Selection" row -------
  function placeToggle(){
    const id='raGuidesToggle';
    if ($('#'+id)) return;

    // Prefer your Snap row if present (Center H/V/HV · Snap: On row)
    const snapRow = $('#raSnapRow');
    const holder =
      snapRow ||
      $$('h3').find(h=>/selection/i.test((h.textContent||'').trim()))?.parentNode ||
      document.body;

    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'btn small';
    btn.textContent = 'Guides: On';
    // In the snap row this will sit nicely to the right
    btn.style.marginLeft = snapRow ? 'auto' : '8px';

    btn.onclick = ()=>{
      S.on = !S.on;
      btn.textContent = 'Guides: ' + (S.on ? 'On' : 'Off');
      clearTop();
    };

    holder.appendChild(btn);
  }

  // ------- drawing on Fabric's TOP canvas (always above) -------
  function topCtx(){
    const c=C(); if(!c) return null;
    return (c.getSelectionContext && c.getSelectionContext()) ||
           c.contextTop ||
           (c.upperCanvasEl && c.upperCanvasEl.getContext('2d')) || null;
  }

  function clearTop(){
    const c=C(); const ctx=topCtx(); if(!c||!ctx) return;
    const el=c.upperCanvasEl; if(!el) return;

    const ratio = el.width / Math.max(1, (el.clientWidth||el.width));
    ctx.save();
    // Draw in CSS‑px space so math is easy, but scale to device pixels
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0, el.width/ratio, el.height/ratio);
    ctx.restore();
  }

  function drawLines(lines){
    const c=C(); const ctx=topCtx(); if(!c||!ctx||!lines||!lines.length) return;
    const el=c.upperCanvasEl; if(!el) return;

    const ratio = el.width / Math.max(1, (el.clientWidth||el.width));
    ctx.save();
    // Work in CSS‑px, scale once for HiDPI
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0, el.width/ratio, el.height/ratio);

    lines.forEach(L=>{
      // White halo for contrast
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth   = 6;
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(L.x1, L.y1); ctx.lineTo(L.x2, L.y2); ctx.stroke();

      // Bright core (center=cyan, edge=red)
      ctx.strokeStyle = (L.kind==='edge') ? '#ff4d4d' : '#00e0ff';
      ctx.lineWidth   = 2.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.moveTo(L.x1, L.y1); ctx.lineTo(L.x2, L.y2); ctx.stroke();
    });

    ctx.restore();
  }

  // ------- coordinate helpers (canvas units → CSS‑px) -------
  const vpt = c => (c && c.viewportTransform) || [1,0,0,1,0,0];
  function toCssPx(c,x,y){ const m=vpt(c); return { x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] }; }

  function canvasEdgesCssPx(c){
    const W=c.getWidth(), H=c.getHeight();
    const tl=toCssPx(c,0,0), tr=toCssPx(c,W,0), bl=toCssPx(c,0,H);
    const cc=toCssPx(c,W/2, H/2); // ← FIX: true center (x & y)
    return { left:tl.x, right:tr.x, top:tl.y, bottom:bl.y, cx:cc.x, cy:cc.y };
  }

  function objBoundsCssPx(c,o){
    const br=o.getBoundingRect(true, true); // canvas units, rotation‑aware
    const tl=toCssPx(c, br.left,              br.top);
    const brp=toCssPx(c, br.left+br.width,    br.top+br.height);
    const xMin=Math.min(tl.x, brp.x), xMax=Math.max(tl.x, brp.x);
    const yMin=Math.min(tl.y, brp.y), yMax=Math.max(tl.y, brp.y);
    return { xMin,xMax,yMin,yMax, cx:(xMin+xMax)/2, cy:(yMin+yMax)/2 };
  }

  function guidesFor(c,o){
    const E=canvasEdgesCssPx(c), O=objBoundsCssPx(c,o);
    const near = (a,b)=> Math.abs(a-b) <= S.tol;
    const L=[];
    // centers
    if (near(O.cx,E.cx)) L.push({ x1:E.cx, y1:E.top,    x2:E.cx,    y2:E.bottom, kind:'center' });
    if (near(O.cy,E.cy)) L.push({ x1:E.left, y1:E.cy,    x2:E.right, y2:E.cy,     kind:'center' });
    // edges
    if (near(O.xMin,E.left))   L.push({ x1:E.left,  y1:E.top,    x2:E.left,  y2:E.bottom, kind:'edge' });
    if (near(O.xMax,E.right))  L.push({ x1:E.right, y1:E.top,    x2:E.right, y2:E.bottom, kind:'edge' });
    if (near(O.yMin,E.top))    L.push({ x1:E.left,  y1:E.top,    x2:E.right, y2:E.top,    kind:'edge' });
    if (near(O.yMax,E.bottom)) L.push({ x1:E.left,  y1:E.bottom, x2:E.right, y2:E.bottom, kind:'edge' });
    return L;
  }

  // ------- wire Fabric events -------
  let clearTimer=null;
  function onTransform(e){
    if (!S.on) return;
    const c=C(); if(!c) return;
    const o=e?.target; if(!o || o._isBgRect || o._isBase) return; // only overlays/text/labels
    try { o.setCoords(); } catch(_){}
    drawLines(guidesFor(c,o));
  }
  function onEnd(){
    clearTimeout(clearTimer);
    clearTimer = setTimeout(clearTop, S.lingerMs);
  }

  function wire(){
  const c = C();
  if (!c) return setTimeout(wire, 120);
  if (c.__raGuidesTopWired) return;
  c.__raGuidesTopWired = true;

    // Remove any older overlay‑canvas guides layer if present
    const old = document.getElementById('raGuidesOverlay'); if (old) try{ old.remove(); }catch(_){}

    placeToggle();

    c.on('object:moving',     onTransform);
    c.on('object:scaling',    onTransform);
    c.on('object:rotating',   onTransform);
    c.on('mouse:up',          onEnd);
    c.on('selection:cleared', onEnd);

    // Clean on zoom/pan/resize (if your UI does that)
    c/* removed after:render hook to avoid loops */ // .on('after:render', ()=>{/* keep last guides while dragging; cleared on mouse:up */});
    window.addEventListener('resize', clearTop, {passive:true});
    window.addEventListener('orientationchange', ()=>setTimeout(clearTop,150), {passive:true});
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wire, {once:true});
  else wire();

  // Quick API if you want to tweak later in console:
  window.raGuides = Object.freeze({
    on:(v)=>{ if(typeof v==='boolean'){ S.on=v; const b=$('#raGuidesToggle'); if(b) b.textContent='Guides: '+(S.on?'On':'Off'); if(!v) clearTop(); } return S.on; },
    tolerance:(px)=>{ if(px>0) S.tol=+px; return S.tol; },
    linger:(ms)=>{ if(ms>=0) S.lingerMs=+ms; return S.lingerMs; }
  });
})();