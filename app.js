(function(){
  const CONTRACT="0x96C1469c1C76E3Bb0e37c23a830d0Eea6BCf9221";
  const RESERVOIR="https://api.reservoir.tools/tokens/v7?media=true&tokens=";
  const WM_SRC = window.__WM_IMG__; // base watermark image (png data uri)

  // Fabric UI tuning
  fabric.Object.prototype.transparentCorners=false;
  fabric.Object.prototype.cornerStyle='circle';
  fabric.Object.prototype.cornerColor='#22d3ee';
  fabric.Object.prototype.cornerStrokeColor='#0b0c10';
  fabric.Object.prototype.cornerSize=9; // smaller handles
  fabric.Object.prototype.borderColor='#22d3ee';
  fabric.Object.prototype.borderScaleFactor=1.2;
  fabric.Object.prototype.rotatingPointOffset=20;

  let canvas, backgroundRect=null, overlayList=[], idLabel=null, baseGroup=null;
  let zoom=1;

  document.addEventListener("DOMContentLoaded", ()=>{
    if(!window.fabric){ alert("fabric.js failed to load. Check internet or open via a local server."); return; }
    canvas=new fabric.Canvas("c",{ backgroundColor:"transparent", preserveObjectStacking:true, enableRetinaScaling:true, selectionBorderColor:'#22d3ee', selectionColor:'rgba(34,211,238,.08)'});
    window.canvas = c;    
    initBackgroundRect("#0d0e13");
    setCanvasSize(parseInt(document.getElementById("canvasSize").value,10));
    setZoom(1);

    // Permanents
    overlayList=(window.__EMBED_OVERLAYS__||[]).map(m=>({name:m.name, src:m.src, perm:true}));
    renderOverlayGrid();

    // Upload base
    document.getElementById("baseUpload").addEventListener("change", async (e)=>{
      const f=e.target.files?.[0]; if(!f) return;
      const data=await fileToDataURL(f);
      await loadBaseImage(data,false); // non-RA => add watermarks
    });
    document.getElementById("clearUpload").addEventListener("click", ()=>{
      document.getElementById("baseUpload").value="";
      clearBaseOnly();
    });

    // Paste URL
    document.getElementById("loadUrl").addEventListener("click", async ()=>{
      const url=document.getElementById("baseUrl").value.trim(); if(!url) return;
      const data=await fetchAsDataURL(url);
      await loadBaseImage(data,false);
    });

    // Token loader (v21d flow)
    document.getElementById("loadToken").addEventListener("click", async ()=>{
      const id=(document.getElementById("tokenIdInput").value||"").trim();
      const status=document.getElementById("tokenStatus");
      if(!id){ status.textContent="Enter a token ID."; return; }
      status.textContent="Fetching token…";
      try{
        const imgUrl=await fetchImageByTokenId(CONTRACT,id);
        if(!imgUrl){ status.textContent="No image URL found."; return; }
        status.textContent="Downloading image…";
        const data=await fetchAsDataURL(imgUrl);
        await loadBaseImage(data,true); // RA => no watermark
        addOrUpdateTokenLabel(id); // auto ID label
        status.textContent="Loaded 👍";
      }catch(e){ status.textContent="Failed to load token image."; }
    });

    // Canvas controls
    document.getElementById("zoomIn").addEventListener("click",()=>setZoom(zoom*1.1));
    document.getElementById("zoomOut").addEventListener("click",()=>setZoom(zoom/1.1));
    document.getElementById("zoomReset").addEventListener("click",()=>{ setZoom(1); canvas.setViewportTransform([1,0,0,1,0,0]); });
    document.getElementById("canvasSize").addEventListener("change",(e)=>setCanvasSize(parseInt(e.target.value,10)));
    document.getElementById("clearBase").addEventListener("click",clearBaseOnly);
    document.getElementById("clearCanvas").addEventListener("click",()=>{
      const keep=[backgroundRect];
      canvas.getObjects().slice().forEach(o=>{ if(!keep.includes(o)) canvas.remove(o); });
      idLabel=null; baseGroup=null; canvas.requestRenderAll();
    });

    // Token ID style live controls
    ['change','input'].forEach(ev=>{
      document.getElementById("idFormat").addEventListener(ev,()=>{ if(idLabel) { idLabel.text = formatTokenId(document.getElementById("tokenIdDisplay").value, document.getElementById("idFormat").value); canvas.requestRenderAll(); }});
      document.getElementById("idSize").addEventListener(ev,()=>{ if(idLabel){ idLabel.set('fontSize', parseInt(document.getElementById("idSize").value,10)||52); canvas.requestRenderAll(); }});
      document.getElementById("idColor").addEventListener(ev,()=>{ if(idLabel){ idLabel.set('fill', document.getElementById("idColor").value); canvas.requestRenderAll(); }});
      document.getElementById("idStrokeColor").addEventListener(ev,()=>{ if(idLabel){ idLabel.set('stroke', document.getElementById("idStrokeColor").value); canvas.requestRenderAll(); }});
      document.getElementById("idStrokeWidth").addEventListener(ev,()=>{ if(idLabel){ idLabel.set('strokeWidth', parseInt(document.getElementById("idStrokeWidth").value,10)||0); canvas.requestRenderAll(); }});
    });
    document.getElementById("deleteTokenId").addEventListener("click",()=>{ if(idLabel){ canvas.remove(idLabel); idLabel=null; canvas.requestRenderAll(); }});

    // Custom text
    document.getElementById("addCustomText").addEventListener("click",()=>{
      const val=(document.getElementById("customText").value||"").trim(); if(!val) return;
      const txt=new fabric.Textbox(val,{ left:canvas.getWidth()/2, top:canvas.getHeight()/2, originX:"center", originY:"center",
        width: Math.floor(canvas.getWidth()*0.8), textAlign:"left",
        fontFamily: document.getElementById("fontFamily").value,
        fontSize: parseInt(document.getElementById("fontSize").value,10)||48,
        fill: document.getElementById("fontColor").value,
        stroke: document.getElementById("strokeColor").value,
        strokeWidth: parseInt(document.getElementById("strokeWidth").value,10)||0,
        editable:true
      });
      txt._kind='customText';
      canvas.add(txt).setActiveObject(txt); bringInterfaceToFront(); canvas.requestRenderAll();
    });
    ['change','input'].forEach(ev=>{
      document.getElementById("fontFamily").addEventListener(ev,()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('fontFamily', document.getElementById("fontFamily").value); canvas.requestRenderAll(); }});
      document.getElementById("fontSize").addEventListener(ev,()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('fontSize', parseInt(document.getElementById("fontSize").value,10)||48); canvas.requestRenderAll(); }});
      document.getElementById("fontColor").addEventListener(ev,()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('fill', document.getElementById("fontColor").value); canvas.requestRenderAll(); }});
      document.getElementById("strokeColor").addEventListener(ev,()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('stroke', document.getElementById("strokeColor").value); canvas.requestRenderAll(); }});
      document.getElementById("strokeWidth").addEventListener(ev,()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('strokeWidth', parseInt(document.getElementById("strokeWidth").value,10)||0); canvas.requestRenderAll(); }});
    });
    document.getElementById("delSelectedText").addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ canvas.remove(o); canvas.requestRenderAll(); }});
    document.getElementById("delAllText").addEventListener("click",()=>{ canvas.getObjects().slice().forEach(o=>{ if(o._kind==='customText') canvas.remove(o); }); canvas.requestRenderAll(); });

    // Selection tools
    document.getElementById("duplicate").addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o) return; o.clone(c=>{ c.set({ left:o.left+20, top:o.top+20 }); canvas.add(c).setActiveObject(c); canvas.requestRenderAll(); }); });
    document.getElementById("delete").addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o || o===backgroundRect) return; if(o===baseGroup) return; canvas.remove(o); canvas.requestRenderAll(); });
    document.getElementById("opacity").addEventListener("input",(e)=>{ const o=canvas.getActiveObject(); if(!o) return; o.set('opacity', parseFloat(e.target.value)); canvas.requestRenderAll(); });
    document.getElementById("blendMode").addEventListener("change",(e)=>{ const o=canvas.getActiveObject(); if(!o) return; o.globalCompositeOperation = e.target.value==="normal" ? null : e.target.value; canvas.requestRenderAll(); });
    document.getElementById("bringFront").addEventListener("click",()=>reorderOverlay('front'));
    document.getElementById("sendBack").addEventListener("click",()=>reorderOverlay('back'));
    document.getElementById("flipX").addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o) return; o.toggle('flipX'); canvas.requestRenderAll(); });
    document.getElementById("flipY").addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o) return; o.toggle('flipY'); canvas.requestRenderAll(); });
    document.getElementById("lock").addEventListener("click",()=>{ const o=canvas.getActiveObject(); if(!o) return; lockObj(o,true); });
    document.getElementById("unlockAll").addEventListener("click",()=>{ canvas.getObjects().forEach(o=>lockObj(o,false)); canvas.requestRenderAll(); });
    document.getElementById("clearAllOverlays").addEventListener("click",()=>{ canvas.getObjects().slice().forEach(o=>{ if(o._kind==='overlay') canvas.remove(o); }); canvas.requestRenderAll(); });

    // Overlays panel & uploads
    document.getElementById("overlayUpload").addEventListener("change", async (e)=>{
      const files=Array.from(e.target.files||[]);
      for(const f of files){
        const data=await fileToDataURL(f);
        overlayList.unshift({name:f.name, src:data, perm:false});
        await addOverlayToCanvas(data,false); // auto place on canvas
      }
      renderOverlayGrid(); e.target.value="";
    });

    document.getElementById("clearOverlayGrid").addEventListener("click",()=>{
      overlayList=overlayList.filter(o=>o.perm); renderOverlayGrid();
    });
  });

  // ---------- Core helpers ----------
  function initBackgroundRect(fill){
    backgroundRect=new fabric.Rect({ left:0, top:0, width:canvas.getWidth(), height:canvas.getHeight(), fill:fill, selectable:false, evented:false, hasControls:false });
    canvas.add(backgroundRect); canvas.sendToBack(backgroundRect);
  }
  function setCanvasSize(size){
    const prevW=canvas.getWidth()||size, prevH=canvas.getHeight()||size;
    const sx=size/prevW, sy=size/prevH;
    canvas.setWidth(size); canvas.setHeight(size);
    if(backgroundRect){ backgroundRect.set({ width:size, height:size }); canvas.sendToBack(backgroundRect); }
    canvas.getObjects().forEach(o=>{ if(o===backgroundRect) return; o.scaleX*=sx; o.scaleY*=sy; o.left*=sx; o.top*=sy; o.setCoords(); });
    canvas.setViewportTransform([1,0,0,1,0,0]); canvas.requestRenderAll();
  }
  function setZoom(v){ zoom=Math.max(0.2,Math.min(4,v)); canvas.setZoom(zoom); const zv=document.getElementById("zoomVal"); if(zv) zv.textContent=Math.round(zoom*100)+'%'; canvas.requestRenderAll(); }
  function lockObj(o,val){ o.set({ selectable:!val, evented:!val, hasControls:!val, lockMovementX:val, lockMovementY:val, lockScalingX:val, lockScalingY:val, lockRotation:val }); }
  function bringInterfaceToFront(){ if(idLabel) canvas.bringToFront(idLabel); }

  function clearBaseOnly(){
    canvas.getObjects().slice().forEach(o=>{ if(o._isBase) canvas.remove(o); });
    baseGroup=null; canvas.requestRenderAll();
  }

  async function loadBaseImage(dataUrl, isRebel){
    // remove old base
    clearBaseOnly();

    // create base image
    const img = await fabricFromURL(dataUrl);
    img.set({ originX:'center', originY:'center' });

    // scale to fit (no upscaling >1)
    const cw=canvas.getWidth(), ch=canvas.getHeight();
    const sc=Math.min(cw/img.width, ch/img.height, 1);
    img.scale(sc);

    if(isRebel){
      img._isBase=true;
      canvas.add(img);
      img.set({ left:cw/2, top:ch/2 }); img.setCoords();
      baseGroup = img;
    }else{
      // add two corner watermarks grouped with base
      const wmTL = await fabricFromURL(WM_SRC);
      const wmBR = await fabricFromURL(WM_SRC);
      const bw = img.width*sc, bh=img.height*sc;
      const wmTargetW = bw*0.15; const margin = Math.max(8, bw*0.02);
      const scaleTL = wmTargetW / wmTL.width; const scaleBR = wmTargetW / wmBR.width;
      wmTL.scale(scaleTL); wmBR.scale(scaleBR);
      // place relative to center-origin image
      wmTL.set({ originX:'center', originY:'center', left: -bw/2 + margin + wmTL.width*scaleTL/2, top: -bh/2 + margin + wmTL.height*scaleTL/2, selectable:false, evented:false });
      wmBR.set({ originX:'center', originY:'center', left: +bw/2 - margin - wmBR.width*scaleBR/2, top: +bh/2 - margin - wmBR.height*scaleBR/2, selectable:false, evented:false });

      const group = new fabric.Group([img, wmTL, wmBR], { left:cw/2, top:ch/2, originX:'center', originY:'center' });
      group._isBase=true;
      canvas.add(group); group.setCoords();
      baseGroup = group;
    }

    // keep base behind overlays; keep interface on top
    if(backgroundRect){ canvas.sendToBack(backgroundRect); }
    if(baseGroup){ canvas.sendToBack(baseGroup); canvas.bringForward(baseGroup); }
    bringInterfaceToFront();
    canvas.requestRenderAll();
  }

  async function addOverlayToCanvas(dataUrl, isPermanent){
    const img = await fabricFromURL(dataUrl);
    img.set({ originX:'center', originY:'center' });
    const size = Math.min(canvas.getWidth(), canvas.getHeight())*0.6;
    const sc = Math.min(size/img.width, size/img.height, 1);
    img.scale(sc);

    let obj;
    if(isPermanent){
      img._kind='overlay';
      obj = img;
    } else {
      // Group with tiny corner watermarks
      const wmTL = await fabricFromURL(WM_SRC);
      const wmBR = await fabricFromURL(WM_SRC);
      const bw = img.width*sc, bh=img.height*sc;
      const wmTargetW = Math.max(16, bw*0.08);
      const margin = Math.max(6, bw*0.02);
      const scaleTL = wmTargetW / wmTL.width; const scaleBR = wmTargetW / wmBR.width;
      wmTL.scale(scaleTL); wmBR.scale(scaleBR);
      wmTL.set({ originX:'center', originY:'center', left: -bw/2 + margin + wmTL.width*scaleTL/2, top: -bh/2 + margin + wmTL.height*scaleTL/2, selectable:false, evented:false });
      wmBR.set({ originX:'center', originY:'center', left: +bw/2 - margin - wmBR.width*scaleBR/2, top: +bh/2 - margin - wmBR.height*scaleBR/2, selectable:false, evented:false });
      const group = new fabric.Group([img, wmTL, wmBR], { originX:'center', originY:'center' });
      group._kind='overlay';
      obj = group;
    }
    canvas.add(obj);
    obj.set({ left:canvas.getWidth()/2, top:canvas.getHeight()/2 }); obj.setCoords();
    canvas.setActiveObject(obj);
    bringInterfaceToFront();
    canvas.requestRenderAll();
    return obj;
  }

  // Reorder within overlay band only
  function reorderOverlay(dir){
    const o=canvas.getActiveObject(); if(!o || o._kind!=='overlay') return;
    const objs=canvas.getObjects();
    const baseIndex = objs.findIndex(x=>x._isBase);
    // overlay band are objects with _kind='overlay'
    const overlays = objs.filter(x=>x._kind==='overlay');
    if(overlays.length<=1) return;
    const currentIndex = overlays.indexOf(o);
    if(dir==='front' && currentIndex < overlays.length-1){
      // move after the last overlay in canvas stacking
      const overlayCanvasIndices = overlays.map(x=>objs.indexOf(x)).sort((a,b)=>a-b);
      const topOverlayCanvasIndex = overlayCanvasIndices[overlayCanvasIndices.length-1];
      canvas.moveTo(o, topOverlayCanvasIndex+1);
    }else if(dir==='back' && currentIndex>0){
      const overlayCanvasIndices = overlays.map(x=>objs.indexOf(x)).sort((a,b)=>a-b);
      const bottomOverlayCanvasIndex = overlayCanvasIndices[0];
      canvas.moveTo(o, bottomOverlayCanvasIndex);
      // ensure not below base
      const idx = objs.indexOf(o);
      const bidx = objs.findIndex(x=>x._isBase);
      if(bidx>=0 && idx<=bidx){ canvas.moveTo(o, bidx+1); }
    }
    bringInterfaceToFront();
    canvas.requestRenderAll();
  }

  // Overlay grid render (permanents clickable)
  function renderOverlayGrid(){
    const grid=document.getElementById("overlayGrid"); grid.innerHTML="";
    overlayList.forEach((item, idx)=>{
      const tile=document.createElement("div"); tile.className="tile"+(item.perm?" perm":"");
      const img=document.createElement("img"); img.src=item.src; img.alt=item.name; img.title=item.name+(item.perm?" (permanent)":"");
      img.addEventListener("click", async ()=>{ await addOverlayToCanvas(item.src, item.perm); });
      if(!item.perm){
        const x=document.createElement("div"); x.className="x"; x.textContent="🗑"; x.addEventListener("click",(e)=>{ e.stopPropagation(); overlayList.splice(idx,1); renderOverlayGrid(); });
        tile.appendChild(x);
      }
      tile.appendChild(img);
      const cap=document.createElement("div"); cap.style.fontSize="11px"; cap.style.color="#9ca3af"; cap.style.marginTop="4px"; cap.textContent=item.name; tile.appendChild(cap);
      grid.appendChild(tile);
    });
  }

  // Token ID label helpers
  function addOrUpdateTokenLabel(id){
    const display = document.getElementById("tokenIdDisplay");
    display.value = "#"+id;
    const text = formatTokenId(display.value, document.getElementById("idFormat").value);
    if(!idLabel){
      idLabel = new fabric.Textbox(text, {
        left: canvas.getWidth()/2, top: 40, originX:'center', originY:'top',
        width: Math.floor(canvas.getWidth()*0.8), textAlign:'center',
        fontFamily: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
        fontSize: parseInt(document.getElementById("idSize").value,10)||52,
        fill: document.getElementById("idColor").value,
        stroke: document.getElementById("idStrokeColor").value,
        strokeWidth: parseInt(document.getElementById("idStrokeWidth").value,10)||0,
        editable:false
      });
      idLabel._kind='tokenId';
      canvas.add(idLabel);
    }else{
      idLabel.text = text;
    }
    bringInterfaceToFront();
    idLabel.setCoords();
    canvas.requestRenderAll();
  }
  function formatTokenId(displayVal, fmt){
    // displayVal is like "#1234" maybe; extract numeric
    let num = parseInt(String(displayVal).replace(/[^0-9]/g,''),10);
    if(Number.isNaN(num)) return displayVal;
    switch(fmt){
      case "roman": return toRoman(num);
      case "hex": return "0x"+num.toString(16).toUpperCase();
      case "binary": return "0b"+num.toString(2);
      case "leading": return "#"+String(num).padStart(4,'0');
      default: return "#"+num;
    }
  }
  function toRoman(num){
    if (num<=0) return String(num);
    const map=[['M',1000],['CM',900],['D',500],['CD',400],['C',100],['XC',90],['L',50],['XL',40],['X',10],['IX',9],['V',5],['IV',4],['I',1]];
    let out=''; for(const [sym,val] of map){ while(num>=val){ out+=sym; num-=val; } } return out;
  }

  // Export buttons (same as v23i)
  document.addEventListener("DOMContentLoaded", ()=>{
    document.getElementById("exportPng").addEventListener("click", ()=> doExport(false));
    document.getElementById("openNewTab").addEventListener("click", ()=> doExport(true));
  });
  function doExport(openTab){
    const mult=parseInt(document.getElementById("exportMultiplier").value,10)||2;
    let dataURL;
    try{
      dataURL=canvas.toDataURL({format:"png", enableRetinaScaling:true, multiplier:mult});
    }catch(e){ alert("Export blocked."); return; }
    document.getElementById("exportPreview").src=dataURL;
    const a=document.createElement("a"); a.href=dataURL; a.download="rebel-ant-overlay.png";
    document.getElementById("manualLink").href=dataURL; document.getElementById("manualLink").textContent="Open last export (manual save)";
    if(openTab){
      // open blob for reliability
      fetch(dataURL).then(r=>r.blob()).then(blob=>{
        const url=URL.createObjectURL(blob);
        const w=window.open(url, "_blank", "noopener");
        if(!w){ window.location.href=url; }
      });
    }else{
      document.body.appendChild(a); a.click(); a.remove();
    }
  }

  // ------- Fetch helpers -------
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
  async function fileToDataURL(file){ return await new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(file); }); }
  async function fetchAsDataURL(url){ const r=await fetch(url,{mode:'cors'}); if(!r.ok) throw new Error("Fetch failed"); const b=await r.blob(); return await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); }); }
  async function fabricFromURL(url){ return await new Promise((res)=> fabric.Image.fromURL(url, img=>res(img), { crossOrigin:'anonymous' })); }

})();

// ===== AUTOSAVE (simple & safe) =====
const AUTOSAVE_KEY = 'ra_autosave_v1';

// Save current canvas to the browser
function saveAutosave() {
  try {
    if (!window.canvas) return;
    const json = canvas.toJSON(['_isWatermark','_isOverlayWM']); // keep our flags
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(json));
  } catch(e) { /* ignore */ }
}

// Ask to restore the last session
function maybeRestoreAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return;
    if (!confirm('Restore your last session?')) return;
    const json = JSON.parse(raw);
    canvas.loadFromJSON(json, () => {
      canvas.renderAll();
      // Re-hide watermarks if needed (Pro, etc.)
      if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
    });
  } catch(e) { /* ignore */ }
}

// Start autosave when the canvas actually exists
(function startAutosaveWhenReady(){
  const timer = setInterval(()=>{
    if (!window.canvas) return;
    ['object:added','object:modified','object:removed'].forEach(evt=>{
      canvas.on(evt, saveAutosave);
    });
    window.addEventListener('beforeunload', saveAutosave);
    // Ask once per load if there is something to restore
    setTimeout(maybeRestoreAutosave, 800);
    clearInterval(timer);
  }, 250);
})();

// Insert a "Restore last session" button next to "Clear All" (no HTML edit needed)
(function insertRestoreButton(){
  function tryInsert() {
    // If it's already there, do nothing
    if (document.getElementById('restoreBtn')) return;

    // Find the existing "Clear All" button on the page
    const btns = Array.from(document.querySelectorAll('button'));
    const clearAllBtn = btns.find(b => b.textContent && b.textContent.trim().toLowerCase() === 'clear all');
    if (!clearAllBtn) return; // page not ready yet

    // Make our Restore button
    const rb = document.createElement('button');
    rb.id = 'restoreBtn';
    rb.className = 'btn small';
    rb.textContent = 'Restore last session';

    // Place it right after "Clear All"
    clearAllBtn.insertAdjacentElement('afterend', rb);

    // When clicked, ask to restore the saved canvas
    rb.addEventListener('click', () => {
      if (typeof maybeRestoreAutosave === 'function') maybeRestoreAutosave();
    });
  }

  // Try once the page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInsert);
  } else {
    tryInsert();
  }
})();

/* ========= AUTOSAVE + RESTORE BUTTON (self-contained) ========= */
(function autosaveBundle(){
  const AUTOSAVE_KEY = 'ra_autosave_v1';

  // Save the whole canvas (keeps our watermark flags)
  function saveNow() {
    try {
      if (!window.canvas) return;
      const json = canvas.toJSON(['_isWatermark','_isOverlayWM']);
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(json));
      showSavedBadge();
    } catch (e) { /* ignore */ }
  }

  // Restore from local storage (optionally ask first)
  function restoreNow(ask = false) {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) { alert('Nothing to restore yet. Make a change first.'); return; }
      if (ask && !confirm('Restore your last session?')) return;

      // Ensure images load with CORS
      if (window.fabric && fabric.Image && !fabric.Image._patchedForCORS) {
        const origFromObject = fabric.Image.fromObject;
        fabric.Image.fromObject = function(obj, cb){
          obj = obj || {}; obj.crossOrigin = obj.crossOrigin || 'anonymous';
          return origFromObject.call(this, obj, cb);
        };
        fabric.Image._patchedForCORS = true;
      }

      const json = JSON.parse(raw);
      canvas.loadFromJSON(json, () => {
        canvas.renderAll();
        if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
      });
    } catch (e) {
      alert('Could not restore this session.');
    }
  }

  // Little "Saved just now" indicator so you know it ran
  function showSavedBadge(){
    let el = document.getElementById('saveStatus');
    if (!el) {
      const exportHeader = Array.from(document.querySelectorAll('h3'))
        .find(h => h.textContent && h.textContent.trim().toLowerCase() === 'export');
      el = document.createElement('div');
      el.id = 'saveStatus';
      el.style.opacity = '0.7';
      el.style.fontSize = '12px';
      el.style.margin = '6px 0';
      if (exportHeader && exportHeader.parentNode) {
        exportHeader.parentNode.insertBefore(el, exportHeader.nextSibling);
      } else {
        document.body.appendChild(el);
      }
    }
    el.textContent = 'Saved just now';
    setTimeout(() => { if (el) el.textContent = ''; }, 1500);
  }

  // Add a "Restore last session" button right after "Clear All"
  function insertRestoreButton(){
    if (document.getElementById('restoreBtn')) return;
    const btns = Array.from(document.querySelectorAll('button'));
    const clearAllBtn = btns.find(b => (b.textContent||'').trim().toLowerCase() === 'clear all');
    if (!clearAllBtn) return; // panel not in the DOM yet

    const rb = document.createElement('button');
    rb.id = 'restoreBtn';
    rb.className = 'btn small';
    rb.textContent = 'Restore last session';
    rb.addEventListener('click', () => restoreNow(false));
    clearAllBtn.insertAdjacentElement('afterend', rb);
  }

  // Start once the canvas actually exists
  function startWhenReady(){
    if (!window.canvas) { setTimeout(startWhenReady, 250); return; }

    // Save on common actions
    ['object:added','object:modified','object:removed'].forEach(evt => {
      canvas.on(evt, saveNow);
    });
    window.addEventListener('beforeunload', saveNow);

    // Add the button and ask once to restore (if there is data)
    insertRestoreButton();
    setTimeout(() => {
      if (localStorage.getItem(AUTOSAVE_KEY)) restoreNow(true);
    }, 800);
  }

  // Try inserting the button as soon as the page is ready too
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertRestoreButton);
  } else {
    insertRestoreButton();
  }

  startWhenReady();
})();

/* ========= AUTOSAVE v2 (robust) ========= */
(function autosaveV2(){
  const KEY = 'ra_autosave_v1';
  let attached = false;
  let C = null; // canvas instance, once found

  // Find the Fabric canvas instance, even if it's not window.canvas
  function findCanvas(){
    if (C && C.getObjects) return C;
    if (window.canvas && typeof window.canvas.getObjects === 'function') { C = window.canvas; return C; }
    try {
      // scan window for an object that looks like a Fabric canvas
      for (const k in window){
        const v = window[k];
        if (v && typeof v === 'object'
            && typeof v.add === 'function'
            && typeof v.toJSON === 'function'
            && typeof v.loadFromJSON === 'function'
            && v.upperCanvasEl) {
          C = v; return C;
        }
      }
    } catch(e){}
    return null;
  }

  // Storage fallback: try localStorage, else use sessionStorage
  function getStore(){
    try { localStorage.setItem('__ra_test__','1'); localStorage.removeItem('__ra_test__'); return localStorage; }
    catch(e){ return sessionStorage; }
  }

  function showSavedBadge(){
    let el = document.getElementById('saveStatus');
    if (!el) {
      el = document.createElement('div');
      el.id = 'saveStatus';
      el.style.opacity = '0.7';
      el.style.fontSize = '12px';
      el.style.margin = '6px 0';
      // Try to put it in the Canvas card; otherwise add near the Export card; otherwise body
      const h3s = Array.from(document.querySelectorAll('h3'));
      const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
      const exportH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'export');
      if (canvasH3 && canvasH3.parentNode) canvasH3.parentNode.appendChild(el);
      else if (exportH3 && exportH3.parentNode) exportH3.parentNode.appendChild(el);
      else document.body.appendChild(el);
    }
    el.textContent = 'Saved just now';
    setTimeout(()=>{ if (el) el.textContent = ''; }, 1200);
  }

  function saveNow(){
    const c = findCanvas(); if (!c) return;
    try {
      const json = c.toJSON(['_isWatermark','_isOverlayWM']);
      getStore().setItem(KEY, JSON.stringify(json));
      showSavedBadge();
    } catch(e){}
  }

  function patchImageCORS(){
    if (window.fabric && fabric.Image && !fabric.Image._raPatched) {
      const orig = fabric.Image.fromObject;
      fabric.Image.fromObject = function(obj, cb){
        obj = obj || {}; obj.crossOrigin = obj.crossOrigin || 'anonymous';
        return orig.call(this, obj, cb);
      };
      fabric.Image._raPatched = true;
    }
  }

  function restoreNow(ask){
    const c = findCanvas();
    if (!c) { alert('Canvas not ready yet. Try again in a moment.'); return; }

    const raw = getStore().getItem(KEY);
    if (!raw) { alert('Nothing to restore yet. Make a change first.'); return; }
    if (ask && !confirm('Restore your last session?')) return;

    try {
      patchImageCORS();
      const json = JSON.parse(raw);
      c.loadFromJSON(json, ()=> {
        c.renderAll();
        if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
      });
    } catch(e) {
      alert('Could not restore this session.');
    }
  }

  function insertRestoreButton(){
    if (document.getElementById('restoreBtn')) return;
    // Prefer to put it in the Canvas card
    const h3s = Array.from(document.querySelectorAll('h3'));
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const container = (canvasH3 && canvasH3.parentNode) ? canvasH3.parentNode : document.body;

    // Also try to find the "Clear All" button to place ours right after it
    const btns = Array.from(document.querySelectorAll('button'));
    const clearAllBtn = btns.find(b => (b.textContent||'').replace(/\s+/g,' ').trim().toLowerCase() === 'clear all');

    const rb = document.createElement('button');
    rb.id = 'restoreBtn';
    rb.className = 'btn small';
    rb.textContent = 'Restore last session';
    rb.addEventListener('click', ()=> restoreNow(false));

    if (clearAllBtn) clearAllBtn.insertAdjacentElement('afterend', rb);
    else container.appendChild(rb);
  }

  function attachOnce(){
    if (attached) return;
    const c = findCanvas(); if (!c) return;

    attached = true;
    ['object:added','object:modified','object:removed','selection:updated','mouse:up'].forEach(evt=>{
      c.on(evt, saveNow);
    });
    window.addEventListener('beforeunload', saveNow);

    insertRestoreButton();

    // Ask once shortly after load
    setTimeout(()=>{ if (getStore().getItem(KEY)) restoreNow(true); }, 800);
  }

  // Keep trying until the canvas exists, then attach
  const poll = setInterval(()=>{
    insertRestoreButton();
    attachOnce();
    if (attached) clearInterval(poll);
  }, 250);
})();
/* ========= AUTOSAVE v3 (self-contained, with UI + status) ========= */
(function autosaveV3(){
  const KEY = 'ra_autosave_v1';
  let attached = false;
  let C = null; // canvas instance once found

  // Try several ways to find the Fabric canvas
  function getCanvas(){
    // 1) Same-file variable (many builds use this)
    try { if (typeof canvas !== 'undefined' && canvas && typeof canvas.getObjects === 'function') return canvas; } catch(e){}
    // 2) Global
    if (window.canvas && typeof window.canvas.getObjects === 'function') return window.canvas;
    // 3) Scan window for a Fabric canvas-like object
    try {
      for (const k in window) {
        const v = window[k];
        if (v && typeof v === 'object'
            && typeof v.add === 'function'
            && typeof v.toJSON === 'function'
            && typeof v.loadFromJSON === 'function'
            && v.upperCanvasEl) return v;
      }
    } catch(e){}
    // 4) Last resort: first <canvas> element’s Fabric instance (some builds attach a backref)
    const el = document.querySelector('canvas');
    if (el && el.fabric && typeof el.fabric.toJSON === 'function') return el.fabric;
    return null;
  }

  // Storage helper (falls back if localStorage is blocked)
  function store(){ try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return localStorage; }catch(e){ return sessionStorage; } }

  // Small status chip (bottom-right) so you know autosave fired
  function status(msg){
    let tag = document.getElementById('raDebug');
    if (!tag) {
      tag = document.createElement('div');
      tag.id = 'raDebug';
      tag.style.position='fixed'; tag.style.bottom='8px'; tag.style.right='8px';
      tag.style.background='rgba(0,0,0,.6)'; tag.style.color='#fff';
      tag.style.padding='6px 8px'; tag.style.borderRadius='6px';
      tag.style.fontSize='12px'; tag.style.zIndex='99999'; tag.style.pointerEvents='none';
      document.body.appendChild(tag);
    }
    tag.textContent = msg;
  }

  function saveNow(){
    C = C || getCanvas(); if (!C) { status('autosave: no canvas'); return; }
    try {
      const json = C.toJSON(['_isWatermark','_isOverlayWM']);
      store().setItem(KEY, JSON.stringify(json));
      status('Saved just now');
      setTimeout(()=>status('Ready'), 1200);
    } catch(e){ status('save error'); }
  }

  function restoreNow(){
    C = C || getCanvas(); if (!C) { alert('Canvas not ready yet'); return; }
    const raw = store().getItem(KEY);
    if (!raw) { alert('Nothing saved yet'); return; }
    try {
      // Make sure images load cross-origin when restoring
      if (window.fabric && fabric.Image && !fabric.Image._raPatched) {
        const orig = fabric.Image.fromObject;
        fabric.Image.fromObject = function(obj, cb){
          obj = obj || {}; obj.crossOrigin = obj.crossOrigin || 'anonymous';
          return orig.call(this, obj, cb);
        };
        fabric.Image._raPatched = true;
      }
      const json = JSON.parse(raw);
      C.loadFromJSON(json, ()=>{
        C.renderAll();
        if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
        status('Restored');
        setTimeout(()=>status('Ready'), 1200);
      });
    } catch(e){ alert('Could not restore this session.'); }
  }

  // Add **three** buttons into the Canvas card so you can drive it
  function insertButtons(){
    if (document.getElementById('restoreBtn')) return;
    const h3s = [...document.querySelectorAll('h3')];
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const holder = canvasH3 ? canvasH3.parentNode : document.body;

    const row = document.createElement('div'); row.style.marginTop='6px';
    const rb = document.createElement('button'); rb.id='restoreBtn'; rb.className='btn small'; rb.textContent='Restore last session';
    const sb = document.createElement('button'); sb.id='saveNowBtn'; sb.className='btn small'; sb.style.marginLeft='6px'; sb.textContent='Save now';
    const cb = document.createElement('button'); cb.id='clearSavedBtn'; cb.className='btn small danger'; cb.style.marginLeft='6px'; cb.textContent='Clear saved';

    row.appendChild(rb); row.appendChild(sb); row.appendChild(cb);
    holder.appendChild(row);

    rb.addEventListener('click', restoreNow);
    sb.addEventListener('click', saveNow);
    cb.addEventListener('click', ()=>{ store().removeItem(KEY); status('Saved session cleared'); });
  }

  function attach(){
    C = C || getCanvas(); if (!C) return;
    if (attached) return; attached = true;
    ['object:added','object:modified','object:removed','mouse:up'].forEach(evt=>{
      try { C.on(evt, saveNow); } catch(e){}
    });
    window.addEventListener('beforeunload', saveNow);
    status('Ready');
  }

  // Keep trying until everything is ready
  (function tick(){
    insertButtons();
    attach();
    setTimeout(tick, 400);
  })();
})();
/* ========= AUTOSAVE v4 — hooks Fabric when the canvas is created ========= */
(function autosaveV4(){
  const KEY = 'ra_autosave_v1';
  let wired = false;          // have we attached listeners yet?
  let C = null;               // canvas instance once found

  // Safe storage (falls back if localStorage is blocked)
  function store(){
    try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return localStorage; }
    catch(e){ return sessionStorage; }
  }

  // Tiny status chip (bottom-right) so you know it worked
  function show(msg){
    let chip = document.getElementById('raDebug');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'raDebug';
      Object.assign(chip.style, {
        position:'fixed', bottom:'8px', right:'8px', zIndex:'99999',
        background:'rgba(0,0,0,.6)', color:'#fff', padding:'6px 8px',
        borderRadius:'6px', fontSize:'12px', pointerEvents:'none'
      });
      document.body.appendChild(chip);
    }
    chip.textContent = msg;
    setTimeout(()=>{ if (chip.textContent === msg) chip.textContent = ''; }, 1200);
  }

  // Add 3 buttons in the Canvas card so you can drive it
  function addButtons(){
    if (document.getElementById('raAutoRow')) return;
    const h3s = Array.from(document.querySelectorAll('h3'));
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const holder = canvasH3 ? canvasH3.parentNode : document.body;

    const row = document.createElement('div');
    row.id = 'raAutoRow';
    row.style.marginTop = '6px';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn small'; saveBtn.textContent = 'Save now';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn small'; restoreBtn.style.marginLeft='6px';
    restoreBtn.textContent = 'Restore last session';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn small danger'; clearBtn.style.marginLeft='6px';
    clearBtn.textContent = 'Clear saved';

    row.append(saveBtn, restoreBtn, clearBtn);
    holder.appendChild(row);

    saveBtn.addEventListener('click', saveNow);
    restoreBtn.addEventListener('click', () => restoreNow(false));
    clearBtn.addEventListener('click', () => { store().removeItem(KEY); show('Saved session cleared'); });
  }

  // Ensure restored images load (CORS)
  function patchImageCORS(){
    if (window.fabric && fabric.Image && !fabric.Image._raPatched) {
      const orig = fabric.Image.fromObject;
      fabric.Image.fromObject = function(obj, cb){
        obj = obj || {}; obj.crossOrigin = obj.crossOrigin || 'anonymous';
        return orig.call(this, obj, cb);
      };
      fabric.Image._raPatched = true;
    }
  }

  function saveNow(){
    if (!C) return;
    try {
      const json = C.toJSON(['_isWatermark','_isOverlayWM']);
      store().setItem(KEY, JSON.stringify(json));
      show('Saved just now');
    } catch(e){ show('Save error'); }
  }

  function restoreNow(ask){
    const raw = store().getItem(KEY);
    if (!raw) { alert('Nothing saved yet'); return; }
    if (ask && !confirm('Restore your last session?')) return;
    try {
      patchImageCORS();
      const json = JSON.parse(raw);
      C.loadFromJSON(json, () => {
        C.renderAll();
        if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
        show('Restored');
      });
    } catch(e){ alert('Could not restore this session.'); }
  }

  // Attach listeners once we have the canvas
  function wireOnce(){
    if (wired || !C) return;
    wired = true;
    ['object:added','object:modified','object:removed','mouse:up'].forEach(evt=>{
      try { C.on(evt, saveNow); } catch(e){}
    });
    window.addEventListener('beforeunload', saveNow);
    addButtons();
    setTimeout(() => { if (store().getItem(KEY)) restoreNow(true); }, 600);
    show('Ready');
  }

  // MAIN HOOK: intercept Fabric canvas creation so we always catch it
  function hookFabric(){
    if (!window.fabric || !fabric.Canvas || !fabric.Canvas.prototype.initialize) {
      setTimeout(hookFabric, 200); return;
    }
    const origInit = fabric.Canvas.prototype.initialize;
    fabric.Canvas.prototype.initialize = function(...args){
      const result = origInit.apply(this, args);
      try {
        C = this;              // we now have the canvas instance
        window.canvas = this;  // also expose it (handy for other tools)
        wireOnce();            // turn on autosave/restore
      } catch(e){}
      return result;
    };

    // If the canvas already existed before our hook, try to find it
    setTimeout(() => {
      if (!C) {
        try {
          for (const k in window) {
            const v = window[k];
            if (v && typeof v.getObjects === 'function' && v.upperCanvasEl) { C = v; break; }
          }
        } catch(e){}
        if (C) { window.canvas = C; wireOnce(); }
      }
    }, 300);
  }

  // Keep nudging the UI (buttons) in case the Canvas card renders late
  (function ping(){
    addButtons();
    setTimeout(ping, 400);
  })();

  hookFabric();
})();
/* Cancel the "Restore your last session?" pop-up once per load */
(function cancelAutoRestorePromptOnce(){
  const originalConfirm = window.confirm;
  window.confirm = function (msg) {
    if (typeof msg === 'string' && msg.toLowerCase().includes('restore your last session')) {
      // Cancel this one prompt and immediately restore the normal confirm
      window.confirm = originalConfirm;
      return false;
    }
    return originalConfirm(msg);
  };
  // Safety: after 3s, always restore the original confirm anyway
  setTimeout(() => { window.confirm = originalConfirm; }, 3000);
})();
/* ===== Manual Checkpoints (independent of autosave) + relabel autosave button ===== */
(function raCheckpoints(){
  const CK = 'ra_checkpoint_v1';

  function getCanvas(){
    return (window.canvas && typeof window.canvas.loadFromJSON === 'function') ? window.canvas : null;
  }

  function toast(msg){
    let el = document.getElementById('raCkToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'raCkToast';
      Object.assign(el.style,{
        position:'fixed', left:'50%', bottom:'16px', transform:'translateX(-50%)',
        background:'rgba(0,0,0,.7)', color:'#fff', padding:'6px 10px',
        borderRadius:'6px', fontSize:'12px', zIndex:'99999', pointerEvents:'none'
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    setTimeout(()=>{ if(el.textContent===msg) el.textContent=''; }, 1200);
  }

  function saveCheckpoint(){
    const c = getCanvas(); if(!c){ alert('Canvas not ready yet'); return; }
    try{
      const json = c.toJSON(['_isWatermark','_isOverlayWM']);
      localStorage.setItem(CK, JSON.stringify(json));
      toast('Checkpoint saved');
    }catch(e){ alert('Could not save checkpoint'); }
  }

  function restoreCheckpoint(){
    const c = getCanvas(); if(!c){ alert('Canvas not ready yet'); return; }
    const raw = localStorage.getItem(CK);
    if(!raw){ alert('No checkpoint yet'); return; }
    try{
      const json = JSON.parse(raw);
      c.loadFromJSON(json, ()=>{
        c.renderAll();
        if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
        toast('Checkpoint restored');
      });
    }catch(e){ alert('Could not restore checkpoint'); }
  }

  // Put 2 new buttons next to the autosave row
  function insertCheckpointButtons(){
    const row = document.getElementById('raAutoRow');
    if(!row){ setTimeout(insertCheckpointButtons, 400); return; }
    if(document.getElementById('saveCkBtn')) return;

    const saveCk = document.createElement('button');
    saveCk.id = 'saveCkBtn';
    saveCk.className = 'btn small';
    saveCk.style.marginLeft = '6px';
    saveCk.textContent = 'Save checkpoint';

    const restoreCk = document.createElement('button');
    restoreCk.id = 'restoreCkBtn';
    restoreCk.className = 'btn small';
    restoreCk.style.marginLeft = '6px';
    restoreCk.textContent = 'Restore checkpoint';

    row.append(saveCk, restoreCk);
    saveCk.addEventListener('click', saveCheckpoint);
    restoreCk.addEventListener('click', restoreCheckpoint);
  }

  // Rename the old autosave restore button so it’s clear what it does
  function relabelAutosaveButton(){
    const rb = document.getElementById('restoreBtn'); // created by the autosave block
    if (rb && rb.textContent.trim().toLowerCase() === 'restore last session') {
      rb.textContent = 'Restore autosave';
    }
  }

  insertCheckpointButtons();
  relabelAutosaveButton();
  // Keep nudging in case the UI renders late
  (function nudge(){
    insertCheckpointButtons();
    relabelAutosaveButton();
    setTimeout(nudge, 600);
  })();
})();
/* ===== RA PATCH — Manual Save + Checkpoints + Optional Timed Autosave =====
   - Kills old autosave-on-every-move by removing Fabric event listeners.
   - Adds a clean control row in the Canvas card:
       [Save now] [Clear saved] [Save checkpoint] [Restore checkpoint] [Autosave: Off/On (5m)]
   - Hides any old "Restore last session / Restore autosave" button.
   - Autosave is OFF by default. Turn it ON with the toggle. Edit MINUTES below if you want 3m.
============================================================================ */

(function RA_PATCH_MANUAL_SAVE(){
  // --- Config ---
  const AUTOSAVE_MINUTES = 5;      // change to 3 if you prefer every 3 minutes
  const AUTOSAVE_KEY     = 'ra_autosave_v1';
  const CHECKPOINT_KEY   = 'ra_checkpoint_v1';
  const AUTOSAVE_FLAG    = 'ra_autosave_enabled_v1'; // remembers your toggle choice

  // --- Storage helper (falls back if localStorage is blocked) ---
  function store(){
    try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return localStorage; }
    catch(e){ return sessionStorage; }
  }

  // --- Find Fabric canvas robustly ---
  function findCanvas(){
    if (window.canvas && typeof window.canvas.loadFromJSON === 'function') return window.canvas;
    try {
      for (const k in window){
        const v = window[k];
        if (v && typeof v === 'object'
          && typeof v.add === 'function'
          && typeof v.loadFromJSON === 'function'
          && typeof v.toJSON === 'function'
          && v.upperCanvasEl) return v;
      }
    } catch(e){}
    const el = document.querySelector('canvas');
    if (el && el.fabric && typeof el.fabric.loadFromJSON === 'function') return el.fabric;
    return null;
  }

  // --- Small status chip so you know it worked ---
  function toast(msg){
    let chip = document.getElementById('raToast');
    if (!chip){
      chip = document.createElement('div');
      chip.id = 'raToast';
      Object.assign(chip.style, {
        position:'fixed', left:'50%', bottom:'16px', transform:'translateX(-50%)',
        background:'rgba(0,0,0,.72)', color:'#fff', padding:'6px 10px',
        borderRadius:'6px', fontSize:'12px', zIndex:'99999', pointerEvents:'none'
      });
      document.body.appendChild(chip);
    }
    chip.textContent = msg;
    setTimeout(()=>{ if (chip.textContent === msg) chip.textContent = ''; }, 1200);
  }

  // --- Hide old autosave UI (if it exists) ---
  function hideOldAutosaveUI(){
    const oldA = document.getElementById('restoreBtn');      // our earlier injected button
    if (oldA) oldA.style.display = 'none';
    const legacy = Array.from(document.querySelectorAll('button'))
      .find(b => (b.textContent||'').trim().toLowerCase() === 'restore last session'
              || (b.textContent||'').trim().toLowerCase() === 'restore autosave');
    if (legacy) legacy.style.display = 'none';
    const oldRow = document.getElementById('raAutoRow');      // earlier row container
    if (oldRow) oldRow.remove();
  }

  // --- Remove old autosave event hooks (stop "save on every move") ---
  function silenceOldAutosave(){
    const c = findCanvas(); if (!c) return;
    ['object:added','object:modified','object:removed','mouse:up','selection:updated']
      .forEach(evt => { try { c.off(evt); } catch(e){} });
    // keep any export/watermark listeners your app uses; we only remove common autosave events
  }

  // --- Manual save / clear (uses the same AUTOSAVE_KEY for compatibility) ---
  function manualSave(){
    const c = findCanvas(); if (!c){ toast('Canvas not ready'); return; }
    try{
      const json = c.toJSON(['_isWatermark','_isOverlayWM']);
      store().setItem(AUTOSAVE_KEY, JSON.stringify(json));
      toast('Saved just now');
    }catch(e){ toast('Save error'); }
  }
  function manualClear(){
    store().removeItem(AUTOSAVE_KEY);
    toast('Saved session cleared');
  }

  // --- Checkpoints (manual, independent of autosave) ---
  function saveCheckpoint(){
    const c = findCanvas(); if (!c){ setTimeout(saveCheckpoint, 300); return; }
    try{
      const json = c.toJSON(['_isWatermark','_isOverlayWM']);
      store().setItem(CHECKPOINT_KEY, JSON.stringify(json));
      toast('Checkpoint saved');
    }catch(e){ toast('Checkpoint save error'); }
  }
  function restoreCheckpoint(){
    const c = findCanvas(); if (!c){ setTimeout(restoreCheckpoint, 300); return; }
    const raw = store().getItem(CHECKPOINT_KEY);
    if (!raw){ toast('No checkpoint'); return; }
    try{
      const json = JSON.parse(raw);
      c.loadFromJSON(json, ()=>{
        c.renderAll();
        if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
        toast('Checkpoint restored');
      });
    }catch(e){ toast('Checkpoint restore error'); }
  }

  // --- Optional timed autosave (OFF by default; toggle to enable) ---
  let timer = null;
  function autosaveEnabled(){ return store().getItem(AUTOSAVE_FLAG) === '1'; }
  function setAutosaveEnabled(on){
    if (on){ store().setItem(AUTOSAVE_FLAG,'1'); startTimer(); }
    else   { store().removeItem(AUTOSAVE_FLAG); stopTimer(); }
    updateToggleLabel();
  }
  function startTimer(){
    stopTimer();
    if (!autosaveEnabled()) return;
    timer = setInterval(()=>{ manualSave(); }, AUTOSAVE_MINUTES*60*1000);
  }
  function stopTimer(){ if (timer){ clearInterval(timer); timer = null; } }
  function toggleAutosave(){ setAutosaveEnabled(!autosaveEnabled()); }

  // --- UI row in the Canvas card ---
  function insertControls(){
    const h3s = Array.from(document.querySelectorAll('h3'));
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const holder = canvasH3 ? canvasH3.parentNode : document.body;

    // ensure only one row
    let row = document.getElementById('raCtrlRow');
    if (row) return;

    row = document.createElement('div');
    row.id = 'raCtrlRow';
    row.style.marginTop = '6px';

    const bSave = document.createElement('button');
    bSave.id='raSaveNow'; bSave.className='btn small'; bSave.textContent='Save now';

    const bClear = document.createElement('button');
    bClear.id='raClearSaved'; bClear.className='btn small danger'; bClear.style.marginLeft='6px'; bClear.textContent='Clear saved';

    const bSCk = document.createElement('button');
    bSCk.id='raSaveCk'; bSCk.className='btn small'; bSCk.style.marginLeft='6px'; bSCk.textContent='Save checkpoint';

    const bRCk = document.createElement('button');
    bRCk.id='raRestoreCk'; bRCk.className='btn small'; bRCk.style.marginLeft='6px'; bRCk.textContent='Restore checkpoint';

    const bAuto = document.createElement('button');
    bAuto.id='raAutoToggle'; bAuto.className='btn small'; bAuto.style.marginLeft='6px'; bAuto.textContent='Autosave: Off';

    row.append(bSave, bClear, bSCk, bRCk, bAuto);
    holder.appendChild(row);

    bSave.addEventListener('click', manualSave);
    bClear.addEventListener('click', manualClear);
    bSCk.addEventListener('click', saveCheckpoint);
    bRCk.addEventListener('click', restoreCheckpoint);
    bAuto.addEventListener('click', toggleAutosave);

    updateToggleLabel();
  }

  function updateToggleLabel(){
    const btn = document.getElementById('raAutoToggle');
    if (!btn) return;
    btn.textContent = autosaveEnabled() ? `Autosave: On (${AUTOSAVE_MINUTES}m)` : 'Autosave: Off';
  }

  // --- Keep things tidy and working even if UI loads late ---
  function tick(){
    hideOldAutosaveUI();
    insertControls();
    // set window.canvas for other tools if we can
    const c = findCanvas(); if (c && !window.canvas) window.canvas = c;
    // disable old move-based autosave
    silenceOldAutosave();
    // manage the timer according to your toggle
    if (autosaveEnabled() && !timer) startTimer();
    setTimeout(tick, 500);
  }
  tick();
})();
/* ===== RA PATCH — De‑flicker: hide legacy autosave UI permanently ===== */
(function RA_PATCH_DEFLICKER(){
  // 1) Add CSS that hides the legacy autosave row & button if they exist
  try {
    const css = document.createElement('style');
    css.id = 'raDeflickerCSS';
    css.textContent = `
      #raAutoRow { display:none !important; visibility:hidden !important; height:0 !important; overflow:hidden !important; }
      #restoreBtn { display:none !important; }
    `;
    document.head && document.head.appendChild(css);
  } catch(e){}

  // 2) Function that hides any legacy controls the moment they appear
  function hideLegacy(){
    // Hide the old row (inserted by older autosave code)
    const row = document.getElementById('raAutoRow');
    if (row) { row.style.display='none'; row.style.visibility='hidden'; row.style.height='0'; row.style.overflow='hidden'; }

    // Hide any old restore button by id
    const rb = document.getElementById('restoreBtn');
    if (rb) rb.style.display='none';

    // Hide any restore button by label (covers "Restore last session" / "Restore autosave")
    const btns = Array.from(document.querySelectorAll('button'));
    btns.forEach(b=>{
      const t = (b.textContent||'').trim().toLowerCase();
      if (t === 'restore last session' || t === 'restore autosave') {
        b.style.display = 'none';
      }
    });
  }

  // 3) Run once now, then watch the page and re‑hide if the legacy row reappears
  hideLegacy();
  const obs = new MutationObserver(hideLegacy);
  obs.observe(document.body, { childList: true, subtree: true });

  // 4) Keep our manual controls stable:
  //    - ensure our own control row exists (created by the earlier manual-save patch)
  //    - never remove it; just keep legacy hidden
})();
