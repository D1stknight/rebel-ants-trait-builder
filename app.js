/* app.js — consolidated, stable build (core features + admin portal) */

(function(){
  'use strict';

  /* ------------ Config ------------ */
  const CONTRACT  = "0x96C1469c1C76E3Bb0e37c23a830d0Eea6BCf9221";
  const RESERVOIR = "https://api.reservoir.tools/tokens/v7?media=true&tokens=";

  // Watermark image: prefer window.__WM_IMG__ (data URL), else a local file
  const WM_SRC = window.__WM_IMG__ || "/watermark.png";

  /* ------------ App state ------------ */
  let canvas, backgroundRect = null, overlayList = [], idLabel = null, baseGroup = null;
  let zoom = 1;
  let autosaveWired = false;

  /* ------------ Utilities ------------ */
  function isDataURL(u){ return typeof u === 'string' && u.startsWith('data:'); }
  function fileToDataURL(file){
    return new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = ()=>resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }
  async function fetchAsDataURL(url){
    const r = await fetch(url, { mode:'cors', cache:'no-store' });
    if (!r.ok) throw new Error('Fetch failed');
    const b = await r.blob();
    return await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); });
  }
  function fabricFromURL(url){
    const opts = isDataURL(url) ? {} : { crossOrigin:'anonymous' };
    return new Promise(res=> fabric.Image.fromURL(url, img=>res(img), opts));
  }
  function bringInterfaceToFront(){ if (idLabel) try { canvas.bringToFront(idLabel); } catch(_){} }

  /* ------------ Fabric setup ------------ */
  function initBackgroundRect(fill){
    backgroundRect = new fabric.Rect({
      left:0, top:0, width:canvas.getWidth(), height:canvas.getHeight(),
      fill:fill, selectable:false, evented:false, hasControls:false
    });
    canvas.add(backgroundRect); canvas.sendToBack(backgroundRect);
  }
  function setCanvasSize(size){
    const prevW = canvas.getWidth() || size, prevH = canvas.getHeight() || size;
    const sx = size/prevW, sy = size/prevH;
    canvas.setWidth(size); canvas.setHeight(size);
    if (backgroundRect){
      backgroundRect.set({ width:size, height:size });
      canvas.sendToBack(backgroundRect);
    }
    canvas.getObjects().forEach(o=>{
      if (o===backgroundRect) return;
      o.scaleX *= sx; o.scaleY *= sy; o.left *= sx; o.top *= sy; o.setCoords();
    });
    canvas.setViewportTransform([1,0,0,1,0,0]);
    canvas.requestRenderAll();
  }
  function setZoom(v){
    zoom = Math.max(0.25, Math.min(6, v));
    canvas.setZoom(zoom);
    const zv = document.getElementById('zoomVal');
    if (zv) zv.textContent = Math.round(zoom*100) + '%';
    canvas.requestRenderAll();
  }

  /* ------------ Base image helpers ------------ */
  function clearBaseOnly(){
    canvas.getObjects().slice().forEach(o=>{ if (o._isBase) canvas.remove(o); });
    baseGroup = null; canvas.requestRenderAll();
  }

  // Deep-swap any old, embedded watermark images inside a group to current WM_SRC
  function swapOldStampsInGroup(group){
    if (!group || group.type!=='group' || !Array.isArray(group._objects)) return;
    const gw = group.getScaledWidth?.()  || (group.width ||0)*(group.scaleX||1);
    const gh = group.getScaledHeight?.() || (group.height||0)*(group.scaleY||1);
    function looksLikeStamp(child){
      if (!child || child.type!=='image') return false;
      if (child._isWatermark || child.raWM) return true;
      try {
        const ow = child.getScaledWidth?.()  || (child.width ||0)*(child.scaleX||1);
        const oh = child.getScaledHeight?.() || (child.height||0)*(child.scaleY||1);
        const small = ow <= gw*0.55 && oh <= gh*0.55;
        const nearTL = (Math.abs(child.left + gw/2) <= 40) && (Math.abs(child.top + gh/2) <= 40);
        const nearBR = (Math.abs(child.left - gw/2) <= 40) && (Math.abs(child.top - gh/2) <= 40);
        const nonInteractive = (child.selectable===false) && (child.evented===false);
        return nonInteractive && small && (nearTL || nearBR);
      } catch { return false; }
    }
    let changed = false;
    group._objects.forEach(child=>{
      if (!looksLikeStamp(child)) return;
      try {
        if (typeof child.setSrc === 'function') {
          child.setSrc(WM_SRC, ()=> canvas && canvas.requestRenderAll && canvas.requestRenderAll());
        } else if (child._element) {
          child._element.src = WM_SRC;
        }
        child._isWatermark = true;
        changed = true;
      } catch {
        try { child.opacity = 0; child.selectable=false; child.evented=false; } catch(_){}
        changed = true;
      }
    });
    if (changed) try { group.addWithUpdate && group.addWithUpdate(); } catch(_){}
  }

  async function loadBaseImage(dataUrl, isFromToken){
    clearBaseOnly();

    const img = await fabricFromURL(dataUrl);
    img.set({ originX:'center', originY:'center' });

    // Fit to canvas (no upscaling beyond 1)
    const cw = canvas.getWidth(), ch = canvas.getHeight();
    const sc = Math.min(cw/img.width, ch/img.height, 1);
    img.scale(sc);

    const center = { left:cw/2, top:ch/2 };

    if (isFromToken){
      // Token (RA) images: no watermark
      img._isBase = true;
      Object.assign(img, center);
      canvas.add(img);
      img.setCoords();
      baseGroup = img;
    } else {
      // Upload/URL: add two corner watermarks in a group
      const wmTL = await fabricFromURL(WM_SRC);
      const wmBR = await fabricFromURL(WM_SRC);
      const bw = img.width*sc, bh = img.height*sc;
      const wmTargetW = bw * 0.15;
      const margin    = Math.max(8, bw*0.02);
      const sTL = wmTargetW / wmTL.width;
      const sBR = wmTargetW / wmBR.width;
      wmTL.scale(sTL); wmBR.scale(sBR);
      Object.assign(wmTL, { selectable:false, evented:false, _isWatermark:true, raWM:true, raPos:'TL' });
      Object.assign(wmBR, { selectable:false, evented:false, _isWatermark:true, raWM:true, raPos:'BR' });
      wmTL.set({ originX:'center', originY:'center',
                 left: -bw/2 + margin + wmTL.width*sTL/2,
                 top:  -bh/2 + margin + wmTL.height*sTL/2 });
      wmBR.set({ originX:'center', originY:'center',
                 left:  bw/2 - margin - wmBR.width*sBR/2,
                 top:   bh/2 - margin - wmBR.height*sBR/2 });

      const group = new fabric.Group([img, wmTL, wmBR], { originX:'center', originY:'center', ...center });
      group._isBase = true;
      swapOldStampsInGroup(group);
      canvas.add(group);
      group.setCoords();
      baseGroup = group;
    }

    // Lock base so it can’t be moved accidentally
    const baseObj = baseGroup;
    if (baseObj){
      baseObj.selectable = false;
      baseObj.evented = false;
      baseObj.hasControls = false;
      baseObj.lockMovementX = baseObj.lockMovementY = true;
    }

    bringInterfaceToFront();
    canvas.requestRenderAll();
  }

  /* ------------ Overlays ------------ */
  async function addOverlayToCanvas(src, isPermanent){
    const img = await fabricFromURL(src);
    const cw = canvas.getWidth(), ch = canvas.getHeight();
    const maxDim = Math.min(cw, ch) * 0.60;
    const iw = img.width || maxDim, ih = img.height || maxDim;
    const sc = Math.min(1, maxDim / Math.max(iw, ih));
    img.set({ originX:'center', originY:'center', left:cw/2, top:ch/2 });
    if (isFinite(sc) && sc>0) img.scale(sc);

    // Mark as overlay for clear-only-overlays functions
    img._kind = 'overlay';

    canvas.add(img).setActiveObject(img);
    bringInterfaceToFront();
    canvas.requestRenderAll();
    return img;
  }

  function reorderOverlay(dir){
    const o = canvas.getActiveObject(); if (!o || o._kind!=='overlay') return;
    const objs = canvas.getObjects();
    const overlays = objs.filter(x => x._kind==='overlay');
    if (overlays.length <= 1) return;

    const overlayIdxs = overlays.map(x => objs.indexOf(x)).sort((a,b)=>a-b);
    const curCanvasIndex = objs.indexOf(o);
    const posInOverlays = overlayIdxs.indexOf(curCanvasIndex);

    if (dir==='front' && posInOverlays < overlayIdxs.length-1){
      const topOverlayCanvasIndex = overlayIdxs[overlayIdxs.length-1];
      canvas.moveTo(o, topOverlayCanvasIndex+1);
    } else if (dir==='back' && posInOverlays > 0){
      const bottomOverlayCanvasIndex = overlayIdxs[0];
      canvas.moveTo(o, bottomOverlayCanvasIndex);
      // ensure not below base
      const baseIdx = objs.findIndex(x=>x._isBase);
      const idx = objs.indexOf(o);
      if (baseIdx>=0 && idx<=baseIdx){ canvas.moveTo(o, baseIdx+1); }
    }
    bringInterfaceToFront();
    canvas.requestRenderAll();
  }

  function renderOverlayGrid(){
    const grid = document.getElementById("overlayGrid");
    if (!grid) return;
    grid.innerHTML = "";
    overlayList.forEach((item, idx)=>{
      const tile = document.createElement("div");
      tile.className = "tile" + (item.perm ? " perm" : "");
      const img = document.createElement("img");
      img.src = item.src; img.alt = item.name; img.title = item.name + (item.perm ? " (permanent)" : "");
      img.addEventListener("click", async ()=>{ await addOverlayToCanvas(item.src, item.perm); });

      if (!item.perm){
        const x = document.createElement("div");
        x.className = "x"; x.textContent = "🗑";
        x.addEventListener("click", (e)=>{ e.stopPropagation(); overlayList.splice(idx,1); renderOverlayGrid(); });
        tile.appendChild(x);
      }
      tile.appendChild(img);
      const cap = document.createElement("div");
      cap.style.fontSize = "11px"; cap.style.color = "#9ca3af"; cap.style.marginTop = "4px";
      cap.textContent = item.name;
      tile.appendChild(cap);
      grid.appendChild(tile);
    });
  }

  /* ------------ Token label ------------ */
  function toRoman(num){
    if (num<=0) return String(num);
    const map=[['M',1000],['CM',900],['D',500],['CD',400],['C',100],['XC',90],['L',50],['XL',40],['X',10],['IX',9],['V',5],['IV',4],['I',1]];
    let out=''; for(const [sym,val] of map){ while(num>=val){ out+=sym; num-=val; } } return out;
  }
  function formatTokenId(displayVal, fmt){
    let num = parseInt(String(displayVal).replace(/[^0-9]/g,''),10);
    if (Number.isNaN(num)) return displayVal;
    switch(fmt){
      case "roman": return toRoman(num);
      case "hex": return "0x"+num.toString(16).toUpperCase();
      case "binary": return "0b"+num.toString(2);
      case "leading": return "#"+String(num).padStart(4,'0');
      default: return "#"+num;
    }
  }
  function addOrUpdateTokenLabel(id){
    const display = document.getElementById("tokenIdDisplay"); if (display) display.value = "#"+id;
    const text = formatTokenId("#"+id, document.getElementById("idFormat")?.value || "plain");
    if (!idLabel){
      idLabel = new fabric.Textbox(text, {
        left: canvas.getWidth()/2, top: 40, originX:'center', originY:'top',
        width: Math.floor(canvas.getWidth()*0.8), textAlign:'center',
        fontFamily: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
        fontSize: parseInt(document.getElementById("idSize")?.value,10)||52,
        fill: document.getElementById("idColor")?.value || "#ffffff",
        stroke: document.getElementById("idStrokeColor")?.value || "#000000",
        strokeWidth: parseInt(document.getElementById("idStrokeWidth")?.value,10)||0,
        editable:false
      });
      idLabel._kind='tokenId';
      canvas.add(idLabel);
    } else {
      idLabel.text = text;
    }
    bringInterfaceToFront();
    idLabel.setCoords();
    canvas.requestRenderAll();
  }

  /* ------------ Export ------------ */
  function doExport(openTab){
    const mult = parseInt(document.getElementById("exportMultiplier")?.value,10) || 2;
    let dataURL;
    try{
      dataURL = canvas.toDataURL({format:"png", enableRetinaScaling:true, multiplier:mult});
    }catch(e){ alert("Export blocked (CORS)."); return; }
    const prev = document.getElementById("exportPreview");
    if (prev) prev.src = dataURL;
    const manualLink = document.getElementById("manualLink");
    if (manualLink){ manualLink.href = dataURL; manualLink.textContent = "Open last export (manual save)"; }
    if (openTab){
      // open via blob for reliability
      fetch(dataURL).then(r=>r.blob()).then(blob=>{
        const url = URL.createObjectURL(blob);
        const w = window.open(url, "_blank", "noopener");
        if (!w) window.location.href = url;
      });
    } else {
      const a = document.createElement("a"); a.href = dataURL; a.download = "rebel-ant-overlay.png";
      document.body.appendChild(a); a.click(); a.remove();
    }
  }

  /* ------------ Token fetch ------------ */
  async function fetchImageByTokenId(contract, tokenId){
    const u = RESERVOIR + encodeURIComponent(`${contract}:${tokenId}`);
    const r = await fetch(u,{headers:{'accept':'application/json'}, cache:'no-store'});
    if(!r.ok) return null;
    const j = await r.json();
    const t = j.tokens && j.tokens[0] && j.tokens[0].token;
    if(!t) return null;
    const m = t.media || {};
    const candidates = [
      (m.original && (m.original.url || m.original.mediaUrl)),
      t.imageLarge, t.image, t.imageUrl, t.imageSmall
    ].filter(Boolean).map(normalize);
    return candidates[0] || null;
  }
  function normalize(u){
    if(!u) return null;
    if(u.startsWith('ipfs://')) return 'https://cloudflare-ipfs.com/ipfs/'+u.replace('ipfs://','').replace(/^ipfs\//,'');
    if(u.startsWith('ar://')) return 'https://arweave.net/'+u.replace('ar://','');
    return u;
  }

  /* ------------ Autosave (simple & safe) ------------ */
  const AUTOSAVE_KEY = 'ra_autosave_v1';
  function saveAutosave(){
    try {
      if (!canvas || !canvas.toJSON) return;
      const json = canvas.toJSON(['_isWatermark','_kind']);
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(json));
    } catch(_){}
  }
  function maybeRestoreAutosave(){
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return;
      if (!confirm('Restore your last session?')) return;
      const json = JSON.parse(raw);
      // Ensure images restore cross-origin
      if (window.fabric && fabric.Image && !fabric.Image._patchedCORS){
        const orig = fabric.Image.fromObject;
        fabric.Image.fromObject = function(obj, cb){
          obj = obj || {}; obj.crossOrigin = obj.crossOrigin || 'anonymous';
          return orig.call(this, obj, cb);
        };
        fabric.Image._patchedCORS = true;
      }
      canvas.loadFromJSON(json, ()=>{
        canvas.renderAll();
        // Swap stamps in any old groups
        canvas.getObjects().forEach(o=>{ if (o.type==='group') swapOldStampsInGroup(o); });
      });
    } catch(_){}
  }
  function wireAutosaveOnce(){
    if (autosaveWired || !canvas) return;
    autosaveWired = true;
    ['object:added','object:modified','object:removed'].forEach(evt=>{
      try { canvas.on(evt, saveAutosave); } catch(_){}
    });
    window.addEventListener('beforeunload', saveAutosave);
    setTimeout(maybeRestoreAutosave, 800);
  }

  /* ------------ Admin portal (dock) ------------ */
  function initAdminDock(){
    const isAdmin = /(\?|&)admin=1\b/.test(location.search);
    if (!isAdmin) return;
    if (document.getElementById('raAdminDock')) return;

    window.raAdminDockPerms = window.raAdminDockPerms || []; // [{name,file,url}]

    const dock = document.createElement('div');
    dock.id = 'raAdminDock';
    dock.style.cssText = [
      'position:fixed','right:16px','bottom:16px','width:320px',
      'background:#0e0f13','border:1px solid #2a2a2e','border-radius:12px',
      'box-shadow:0 10px 24px rgba(0,0,0,.45)','color:#e7e7ea',
      'font:13px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
      'z-index: 999999'
    ].join(';');
    dock.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #222;">
        <strong>Admin Overlays</strong>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="raDockExport"  style="background:#10b981;border:0;border-radius:8px;color:#08130e;padding:6px 10px;cursor:pointer">Export pack</button>
          <button id="raDockToggle"  style="background:#1b1c22;border:1px solid #2a2a2e;border-radius:6px;color:#e7e7ea;padding:4px 8px;cursor:pointer">Hide</button>
        </div>
      </div>
      <div id="raDockBody" style="padding:10px 12px;">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          <button id="raDockAdd"  style="background:#3b82f6;border:0;border-radius:8px;color:#fff;padding:6px 10px;cursor:pointer">Add PNGs</button>
          <button id="raDockClear" style="background:#2a2a2e;border:0;border-radius:8px;color:#ccc;padding:6px 10px;cursor:pointer">Clear</button>
          <div id="raDockMsg" style="opacity:.75;min-height:18px"></div>
        </div>
        <div id="raDockGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:260px;overflow:auto;"></div>
        <div style="opacity:.55;margin-top:8px">Use <em>Publish</em> to add items to the Overlays grid for everyone. You can export them to <code>overlays.json</code> and host it; append <code>?manifest=URL</code> to share.</div>
      </div>
    `;
    document.body.appendChild(dock);

    function setMsg(txt){ const el = document.getElementById('raDockMsg'); if (el) el.textContent = txt||''; }
    function renderTiles(){
      const grid = document.getElementById('raDockGrid'); if (!grid) return;
      grid.innerHTML = '';
      (window.raAdminDockPerms||[]).forEach((it, idx)=>{
        const tile = document.createElement('div');
        tile.style.cssText = 'position:relative;border:1px solid #2a2a2e;border-radius:8px;background:#15161c;padding:6px;text-align:center;';
        tile.innerHTML = `
          <div style="height:80px;display:flex;align-items:center;justify-content:center;">
            <img src="${it.url}" alt="${it.name||''}" style="max-width:100%;max-height:80px;"/>
          </div>
          <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name||''}</div>
          <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;">
            <button data-act="publish" class="raTinyBtn">Publish</button>
            <button data-act="add"      class="raTinyBtn">Add</button>
            <button data-act="del"      class="raTinyBtn" title="Remove">×</button>
          </div>
        `;
        tile.querySelectorAll('.raTinyBtn').forEach(b=>{
          b.style.cssText = 'background:#2a2a2e;border:0;border-radius:6px;color:#ddd;padding:3px 8px;cursor:pointer;font-size:12px;';
        });
        tile.addEventListener('click', async (ev)=>{
          const btn = ev.target.closest('button'); if (!btn) return;
          const act = btn.getAttribute('data-act');
          if (act==='del'){
            const arr = window.raAdminDockPerms||[];
            const i = arr.indexOf(it);
            if (i>=0){
              try{ if (arr[i].url && /^blob:/i.test(arr[i].url)) URL.revokeObjectURL(arr[i].url); }catch(_){}
              arr.splice(i,1);
            }
            renderTiles();
            return;
          }
          if (act==='publish'){
            // Add to permanent overlays grid
            overlayList.unshift({ name: it.name, src: it.url, perm:true });
            renderOverlayGrid();
            setMsg(`Published: ${it.name}`);
            setTimeout(()=>setMsg(''), 900);
            return;
          }
          if (act==='add'){
            await addOverlayToCanvas(it.url, false);
            setMsg(`Added: ${it.name}`);
            setTimeout(()=>setMsg(''), 900);
          }
        });
        grid.appendChild(tile);
      });
    }

    document.getElementById('raDockToggle').addEventListener('click', ()=>{
      const body = document.getElementById('raDockBody');
      const btn  = document.getElementById('raDockToggle');
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? 'block' : 'none';
      btn.textContent = hidden ? 'Hide' : 'Show';
    });
    document.getElementById('raDockExport').addEventListener('click', ()=>{
      const items = overlayList.filter(o=>o.perm).map(o=>({ name:o.name, dataURL:o.src }));
      const blob = new Blob([JSON.stringify({version:1,items})], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'overlays.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 200);
    });
    document.getElementById('raDockAdd').addEventListener('click', ()=>{
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/png'; inp.multiple = true; inp.style.display='none';
      inp.addEventListener('change', (e)=>{
        const files = Array.from(e.target.files||[]);
        if (files.length){
          files.forEach(f=>{
            const url = URL.createObjectURL(f);
            window.raAdminDockPerms.push({ name: f.name.replace(/\.png$/i,'').replace(/[_-]+/g,' ').trim(), file:f, url });
          });
          renderTiles();
        }
        inp.remove();
      }, { once:true });
      document.body.appendChild(inp);
      inp.click();
    });
    document.getElementById('raDockClear').addEventListener('click', ()=>{
      (window.raAdminDockPerms||[]).forEach(it=>{ try{ if (it.url && /^blob:/i.test(it.url)) URL.revokeObjectURL(it.url); }catch(_){ } });
      window.raAdminDockPerms.length = 0; renderTiles();
    });

    renderTiles();
  }

  /* ------------ Manifest loader (optional) ------------ */
  async function loadManifestIfAny(){
    try{
      const q = new URLSearchParams(location.search);
      const manifest = q.get('manifest');
      if (!manifest) return;
      const r = await fetch(manifest + (manifest.includes('?')?'&':'?') + 't=' + Date.now(), { cache:'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !Array.isArray(j.items)) return;
      // Add to permanent overlays
      j.items.forEach(it=>{
        const src = it.dataURL || it.url;
        if (src) overlayList.unshift({ name: it.name || 'overlay', src, perm:true });
      });
      renderOverlayGrid();
    }catch(_){}
  }

  /* ------------ Zoom/pan wiring ------------ */
  function wireZoomPan(){
    if (!canvas || canvas._raZoomPanWired) return;
    canvas._raZoomPanWired = true;
    function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
    function centerPoint(){ return new fabric.Point(canvas.getWidth()/2, canvas.getHeight()/2); }

    let spaceDown = false;
    document.addEventListener('keydown', (e)=>{ if (e.code==='Space'){ spaceDown = true; canvas.defaultCursor='grab'; }});
    document.addEventListener('keyup',   (e)=>{ if (e.code==='Space'){ spaceDown = false; canvas.defaultCursor='default'; }});

    canvas.on('mouse:wheel', function(opt){
      const e = opt.e;
      const panMode = spaceDown || e.shiftKey || e.altKey;
      if (panMode){
        const vt = canvas.viewportTransform;
        vt[4] -= e.deltaX;
        vt[5] -= e.deltaY;
        canvas.requestRenderAll();
      } else {
        let z = canvas.getZoom();
        z *= Math.pow(0.999, e.deltaY);
        z = clamp(z, 0.25, 6);
        const pt = new fabric.Point(e.offsetX, e.offsetY);
        canvas.zoomToPoint(pt, z);
        const zv = document.getElementById('zoomVal');
        if (zv) zv.textContent = Math.round(canvas.getZoom()*100) + '%';
      }
      e.preventDefault(); e.stopPropagation();
    });

    let isPanning = false, last = {x:0,y:0};
    canvas.on('mouse:down', (opt)=>{
      const e = opt.e;
      const rightOrMiddle = e.button===2 || e.button===1 || e.buttons===4;
      if (spaceDown || rightOrMiddle){
        isPanning = true;
        last.x = e.clientX; last.y = e.clientY;
        canvas.setCursor('grabbing');
        e.preventDefault();
      }
    });
    canvas.on('mouse:move', (opt)=>{
      if (!isPanning) return;
      const e = opt.e;
      const vt = canvas.viewportTransform;
      vt[4] += e.clientX - last.x;
      vt[5] += e.clientY - last.y;
      last.x = e.clientX; last.y = e.clientY;
      canvas.requestRenderAll();
      e.preventDefault();
    });
    canvas.on('mouse:up', ()=>{
      isPanning = false;
      canvas.setCursor(spaceDown ? 'grab' : 'default');
    });
  }

  /* ------------ DOM ready ------------ */
  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.fabric){ alert("fabric.js failed to load. Check internet or open via a local server."); return; }

    // Fabric UI tuning (small handles, cyan)
    fabric.Object.prototype.transparentCorners=false;
    fabric.Object.prototype.cornerStyle='circle';
    fabric.Object.prototype.cornerColor='#22d3ee';
    fabric.Object.prototype.cornerStrokeColor='#0b0c10';
    fabric.Object.prototype.cornerSize=9;
    fabric.Object.prototype.borderColor='#22d3ee';
    fabric.Object.prototype.borderScaleFactor=1.2;
    fabric.Object.prototype.rotatingPointOffset=20;

    // Create canvas
    canvas = new fabric.Canvas("c", {
      backgroundColor: "transparent",
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      selectionBorderColor: "#22d3ee",
      selectionColor: "rgba(34,211,238,.08)"
    });
    window.canvas = canvas;

    // Background & size
    initBackgroundRect("#0d0e13");
    const sizeEl = document.getElementById("canvasSize");
    if (sizeEl) sizeEl.value = "700";
    setCanvasSize(parseInt(sizeEl ? sizeEl.value : "700", 10));
    setZoom(1);
    wireZoomPan();

    // Permanents → embed to the grid as non-deletable
    overlayList = (window.__EMBED_OVERLAYS__ || []).map(m => ({ name:m.name, src:m.src, perm:true }));
    await loadManifestIfAny();
    renderOverlayGrid();

    /* ---- Base image: local upload ---- */
    const baseUploadEl = document.getElementById("baseUpload");
    if (baseUploadEl) baseUploadEl.addEventListener("change", async (e)=>{
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const data = await fileToDataURL(f);
      await loadBaseImage(data, false);
    });
    const clearUploadEl = document.getElementById("clearUpload");
    if (clearUploadEl) clearUploadEl.addEventListener("click", ()=>{
      const inp = document.getElementById("baseUpload"); if (inp) inp.value = "";
      clearBaseOnly();
    });

    /* ---- Base image: paste URL ---- */
    const loadUrlBtn = document.getElementById("loadUrl");
    if (loadUrlBtn) loadUrlBtn.addEventListener("click", async ()=>{
      const url = (document.getElementById("baseUrl")?.value || "").trim();
      if (!url) return;
      const data = await fetchAsDataURL(url);
      await loadBaseImage(data, false);
    });

    /* ---- Base image: load by token ID ---- */
    const loadTokenBtn = document.getElementById("loadToken");
    if (loadTokenBtn) loadTokenBtn.addEventListener("click", async ()=>{
      const id = (document.getElementById("tokenIdInput")?.value || "").trim();
      const status = document.getElementById("tokenStatus");
      if (!id){ if (status) status.textContent = "Enter a token ID."; return; }
      if (status) status.textContent = "Fetching token…";
      try{
        const imgUrl = await fetchImageByTokenId(CONTRACT, id);
        if (!imgUrl){ if (status) status.textContent = "No image URL found."; return; }
        if (status) status.textContent = "Downloading image…";
        const data = await fetchAsDataURL(imgUrl);
        await loadBaseImage(data, true);   // token → no watermark
        addOrUpdateTokenLabel(id);
        if (status) status.textContent = "Loaded 👍";
      }catch(e){ if (status) status.textContent = "Failed to load token image."; }
    });

    /* ---- Canvas controls ---- */
    const zi = document.getElementById("zoomIn");
    if (zi) zi.addEventListener("click", ()=> setZoom(canvas.getZoom()*1.15));
    const zo = document.getElementById("zoomOut");
    if (zo) zo.addEventListener("click", ()=> setZoom(canvas.getZoom()/1.15));
    const zr = document.getElementById("zoomReset");
    if (zr) zr.addEventListener("click", ()=>{ setZoom(1); canvas.setViewportTransform([1,0,0,1,0,0]); });
    const sizeSel = document.getElementById("canvasSize");
    if (sizeSel) sizeSel.addEventListener("change", (e)=> setCanvasSize(parseInt(e.target.value, 10)));
    const clearBaseBtn = document.getElementById("clearBase");
    if (clearBaseBtn) clearBaseBtn.addEventListener("click", clearBaseOnly);
    const clearCanvasBtn = document.getElementById("clearCanvas");
    if (clearCanvasBtn) clearCanvasBtn.addEventListener("click", ()=>{
      const keep=[backgroundRect];
      canvas.getObjects().slice().forEach(o=>{ if(!keep.includes(o)) canvas.remove(o); });
      idLabel=null; baseGroup=null;
      canvas.requestRenderAll();
      saveAutosave();
    });

    /* ---- Token label live controls ---- */
    ['change','input'].forEach(ev=>{
      const idFmt  = document.getElementById("idFormat");
      const idSize = document.getElementById("idSize");
      const idCol  = document.getElementById("idColor");
      const idSCol = document.getElementById("idStrokeColor");
      const idSW   = document.getElementById("idStrokeWidth");
      if (idFmt)  idFmt.addEventListener(ev, ()=>{ if(idLabel){ idLabel.text = formatTokenId(document.getElementById("tokenIdDisplay")?.value || "", idFmt.value); canvas.requestRenderAll(); }});
      if (idSize) idSize.addEventListener(ev,()=>{ if(idLabel){ idLabel.set('fontSize', parseInt(idSize.value,10)||52); canvas.requestRenderAll(); }});
      if (idCol)  idCol.addEventListener(ev, ()=>{ if(idLabel){ idLabel.set('fill', idCol.value); canvas.requestRenderAll(); }});
      if (idSCol) idSCol.addEventListener(ev,()=>{ if(idLabel){ idLabel.set('stroke', idSCol.value); canvas.requestRenderAll(); }});
      if (idSW)   idSW.addEventListener(ev, ()=>{ if(idLabel){ idLabel.set('strokeWidth', parseInt(idSW.value,10)||0); canvas.requestRenderAll(); }});
    });
    const delIdBtn = document.getElementById("deleteTokenId");
    if (delIdBtn) delIdBtn.addEventListener("click", ()=>{ if(idLabel){ canvas.remove(idLabel); idLabel=null; canvas.requestRenderAll(); }});

    /* ---- Custom text ---- */
    const addTextBtn = document.getElementById("addCustomText");
    if (addTextBtn) addTextBtn.addEventListener("click", ()=>{
      const val=(document.getElementById("customText")?.value||"").trim(); if(!val) return;
      const txt=new fabric.Textbox(val,{
        left:canvas.getWidth()/2, top:canvas.getHeight()/2, originX:"center", originY:"center",
        width: Math.floor(canvas.getWidth()*0.8), textAlign:"left",
        fontFamily: document.getElementById("fontFamily")?.value || 'Arial',
        fontSize: parseInt(document.getElementById("fontSize")?.value,10)||48,
        fill: document.getElementById("fontColor")?.value || '#ffffff',
        stroke: document.getElementById("strokeColor")?.value || '#000000',
        strokeWidth: parseInt(document.getElementById("strokeWidth")?.value,10)||0,
        editable:true
      });
      txt._kind='customText';
      canvas.add(txt).setActiveObject(txt); bringInterfaceToFront(); canvas.requestRenderAll();
    });
    ['change','input'].forEach(ev=>{
      function upd(prop, val){
        const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set(prop, val); canvas.requestRenderAll(); }
      }
      const ff = document.getElementById("fontFamily"); if (ff) ff.addEventListener(ev,()=>upd('fontFamily', ff.value));
      const fs = document.getElementById("fontSize");  if (fs) fs.addEventListener(ev,()=>upd('fontSize', parseInt(fs.value,10)||48));
      const fc = document.getElementById("fontColor"); if (fc) fc.addEventListener(ev,()=>upd('fill', fc.value));
      const sc = document.getElementById("strokeColor"); if (sc) sc.addEventListener(ev,()=>upd('stroke', sc.value));
      const sw = document.getElementById("strokeWidth"); if (sw) sw.addEventListener(ev,()=>upd('strokeWidth', parseInt(sw.value,10)||0));
    });
    const delSelText = document.getElementById("delSelectedText");
    if (delSelText) delSelText.addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ canvas.remove(o); canvas.requestRenderAll(); }});
    const delAllText = document.getElementById("delAllText");
    if (delAllText) delAllText.addEventListener("click",()=>{ canvas.getObjects().slice().forEach(o=>{ if(o._kind==='customText') canvas.remove(o); }); canvas.requestRenderAll(); });

    /* ---- Selection tools ---- */
    const dupBtn = document.getElementById("duplicate");
    if (dupBtn) dupBtn.addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o) return; o.clone(c=>{ c.set({ left:o.left+20, top:o.top+20 }); canvas.add(c).setActiveObject(c); canvas.requestRenderAll(); }); });
    const delBtn = document.getElementById("delete");
    if (delBtn) delBtn.addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o || o===backgroundRect) return; if(o===baseGroup) return; canvas.remove(o); canvas.requestRenderAll(); });
    const opInp = document.getElementById("opacity");
    if (opInp) opInp.addEventListener("input",(e)=>{ const o=canvas.getActiveObject(); if(!o) return; o.set('opacity', parseFloat(e.target.value)); canvas.requestRenderAll(); });
    const blendSel = document.getElementById("blendMode");
    if (blendSel) blendSel.addEventListener("change",(e)=>{ const o=canvas.getActiveObject(); if(!o) return; o.globalCompositeOperation = e.target.value==="normal" ? null : e.target.value; canvas.requestRenderAll(); });
    const bf = document.getElementById("bringFront"); if (bf) bf.addEventListener("click",()=>reorderOverlay('front'));
    const sb = document.getElementById("sendBack");  if (sb) sb.addEventListener("click",()=>reorderOverlay('back'));
    const fx = document.getElementById("flipX");     if (fx) fx.addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o) return; o.set('flipX', !o.flipX); o.setCoords(); canvas.requestRenderAll(); });
    const fy = document.getElementById("flipY");     if (fy) fy.addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o) return; o.set('flipY', !o.flipY); o.setCoords(); canvas.requestRenderAll(); });
    const lockBtn = document.getElementById("lock"); if (lockBtn) lockBtn.addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o) return;
      o.set({ selectable:false, evented:false, hasControls:false, lockMovementX:true, lockMovementY:true, lockScalingX:true, lockScalingY:true, lockRotation:true }); canvas.requestRenderAll(); });
    const unlockAll = document.getElementById("unlockAll"); if (unlockAll) unlockAll.addEventListener("click",()=>{ canvas.getObjects().forEach(o=>o.set({ selectable:true, evented:true, hasControls:true, lockMovementX:false, lockMovementY:false, lockScalingX:false, lockScalingY:false, lockRotation:false })); canvas.requestRenderAll(); });
    const clearOver = document.getElementById("clearAllOverlays"); if (clearOver) clearOver.addEventListener("click",()=>{ canvas.getObjects().slice().forEach(o=>{ if(o._kind==='overlay') canvas.remove(o); }); canvas.requestRenderAll(); });

    /* ---- Overlays panel & uploads ---- */
    const ovUp = document.getElementById("overlayUpload");
    if (ovUp) ovUp.addEventListener("change", async (e)=>{
      const files = Array.from(e.target.files||[]);
      for (const f of files){
        const data = await fileToDataURL(f);
        overlayList.unshift({ name:f.name, src:data, perm:false });
        await addOverlayToCanvas(data, false);
      }
      renderOverlayGrid(); e.target.value="";
    });
    const ovClr = document.getElementById("clearOverlayGrid");
    if (ovClr) ovClr.addEventListener("click",()=>{
      overlayList = overlayList.filter(o=>o.perm); renderOverlayGrid();
    });

    /* ---- Export buttons ---- */
    const expBtn = document.getElementById("exportPng");
    if (expBtn) expBtn.addEventListener("click", ()=> doExport(false));
    const openTabBtn = document.getElementById("openNewTab");
    if (openTabBtn) openTabBtn.addEventListener("click", ()=> doExport(true));

    // Autosave
    wireAutosaveOnce();

    // Admin portal
    initAdminDock();
  });

})();
