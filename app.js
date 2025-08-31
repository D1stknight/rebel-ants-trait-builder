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
/* ===== RA RESET — Manual Save + Checkpoints + Kill Legacy Autosave/Flicker =====
   - Removes old "save on every move" listeners and hides old UI (incl. Restore autosave).
   - Leaves a single stable row in Canvas: [Save now] [Clear saved] [Save checkpoint] [Restore checkpoint] [Autosave: Off]
   - Timed autosave is OFF by default; toggle to ON saves every 5 minutes (edit minutes below).
=============================================================================== */
(function RA_RESET_PATCH(){
  // --- Config ---
  const AUTOSAVE_MINUTES = 5;                    // change to 3 if you prefer
  const AUTOSAVE_KEY   = 'ra_autosave_v1';
  const CHECKPOINT_KEY = 'ra_checkpoint_v1';
  const AUTOSAVE_FLAG  = 'ra_autosave_enabled_v1'; // remembers toggle

  // --- Storage helper (fallback if localStorage blocked) ---
  function store(){
    try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return localStorage; }
    catch(e){ return sessionStorage; }
  }

  // --- Robust canvas finder ---
  function findCanvas(){
    if (window.canvas && typeof window.canvas.loadFromJSON === 'function') return window.canvas;
    try {
      for (const k in window){
        const v = window[k];
        if (v && typeof v === 'object'
          && typeof v.add === 'function'
          && typeof v.toJSON === 'function'
          && typeof v.loadFromJSON === 'function'
          && v.upperCanvasEl) return v;
      }
    } catch(e){}
    const el = document.querySelector('canvas');
    if (el && el.fabric && typeof el.fabric.loadFromJSON === 'function') return el.fabric;
    return null;
  }

  // --- Tiny status chip (center bottom) ---
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

  // --- Hide legacy autosave UI & debug chips (and stop flicker) ---
  (function injectHideCSS(){
    const css = document.createElement('style');
    css.textContent = `
      #raAutoRow, #restoreBtn, #raDebug, #saveStatus, #raCtrlRow { display:none !important; visibility:hidden !important; height:0 !important; overflow:hidden !important; }
      /* prevent layout jump while legacy rows are hidden */
      #raAutoRow * { display:none !important; }
    `;
    (document.head||document.documentElement).appendChild(css);
  })();

  function hideLegacy(){
    const ids = ['raAutoRow','restoreBtn','raDebug','saveStatus','raCtrlRow'];
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if (el){ el.style.display='none'; el.style.visibility='hidden'; el.style.height='0'; el.style.overflow='hidden'; }
    });
    // hide by label (covers "Restore last session" / "Restore autosave")
    Array.from(document.querySelectorAll('button')).forEach(b=>{
      const t = (b.textContent||'').trim().toLowerCase();
      if (t === 'restore last session' || t === 'restore autosave') b.style.display = 'none';
    });
  }

  // --- Remove old event listeners (stop "save on every move") ---
  function silenceOldAutosave(){
    const c = findCanvas(); if (!c) return;
    ['object:added','object:modified','object:removed','mouse:up','selection:updated']
      .forEach(evt => { try { c.off(evt); } catch(e){} });
  }

  // --- Manual save / clear (uses AUTOSAVE_KEY for manual snapshot) ---
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

  // --- Checkpoints (manual, independent of the manual snapshot above) ---
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
  function updateToggleLabel(){
    const b = document.getElementById('raAutoToggle');
    if (b) b.textContent = autosaveEnabled() ? `Autosave: On (${AUTOSAVE_MINUTES}m)` : 'Autosave: Off';
  }
  function startTimer(){ stopTimer(); if (!autosaveEnabled()) return; timer = setInterval(()=>manualSave(), AUTOSAVE_MINUTES*60*1000); }
  function stopTimer(){ if (timer){ clearInterval(timer); timer = null; } }
  function toggleAutosave(){ if (autosaveEnabled()) store().removeItem(AUTOSAVE_FLAG); else store().setItem(AUTOSAVE_FLAG,'1'); updateToggleLabel(); startTimer(); }

  // --- Single, stable control row in the Canvas card ---
  function insertControls(){
    const h3s = Array.from(document.querySelectorAll('h3'));
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const holder = canvasH3 ? canvasH3.parentNode : document.body;

    let row = document.getElementById('raCtrlRowUnified');
    if (!row){
      row = document.createElement('div');
      row.id = 'raCtrlRowUnified';
      row.style.marginTop = '6px';

      function btn(id, label, danger){
        const b = document.createElement('button');
        b.id = id; b.className = 'btn small' + (danger ? ' danger' : '');
        b.style.marginRight = '6px'; b.textContent = label; return b;
      }

      const bSave  = btn('raSaveNow','Save now');
      const bClear = btn('raClearSaved','Clear saved', true);
      const bSCk   = btn('raSaveCk','Save checkpoint');
      const bRCk   = btn('raRestoreCk','Restore checkpoint');
      const bAuto  = btn('raAutoToggle','Autosave: Off');

      bSave.addEventListener('click', manualSave);
      bClear.addEventListener('click', manualClear);
      bSCk.addEventListener('click', saveCheckpoint);
      bRCk.addEventListener('click', restoreCheckpoint);
      bAuto.addEventListener('click', toggleAutosave);

      row.append(bSave, bClear, bSCk, bRCk, bAuto);
      holder.appendChild(row);
      updateToggleLabel();
    }
  }

  // --- Cancel any old "Restore your last session?" confirm on load ---
  (function cancelRestorePromptOnce(){
    const orig = window.confirm;
    window.confirm = function(msg){
      if ((''+msg).toLowerCase().includes('restore your last session')) return false;
      return orig(msg);
    };
    setTimeout(()=>{ window.confirm = orig; }, 2000);
  })();

  // --- Keep things stable even if the page re-renders parts of the UI ---
  const obs = new MutationObserver(()=>{
    hideLegacy();
    insertControls();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // --- Main tick: make sure legacy is silenced and our row exists ---
  (function tick(){
    const c = findCanvas();
    if (c && !window.canvas) window.canvas = c; // expose for other tools
    silenceOldAutosave();
    hideLegacy();
    insertControls();
    if (autosaveEnabled()) startTimer();
    setTimeout(tick, 500);
  })();
})();
/* ========= RA FINAL PATCH — reliable canvas + clean controls (no move-autosave) ========= */
(function RA_FINAL_PATCH(){
  // ----- Config -----
  const AUTOSAVE_MINUTES = 5; // timed autosave interval if you toggle it on
  const SNAP_KEY   = 'ra_autosave_v1';      // manual snapshot ("Save now")
  const CKPT_KEY   = 'ra_checkpoint_v1';    // manual checkpoint
  const FLAG_KEY   = 'ra_autosave_enabled_v1'; // remembers toggle

  // ----- Small toast so you know actions worked -----
  function toast(msg){
    let el = document.getElementById('raToast');
    if(!el){
      el = document.createElement('div');
      Object.assign(el.style,{
        position:'fixed', left:'50%', bottom:'16px', transform:'translateX(-50%)',
        background:'rgba(0,0,0,.72)', color:'#fff', padding:'6px 10px',
        borderRadius:'6px', fontSize:'12px', zIndex:'99999', pointerEvents:'none'
      });
      el.id = 'raToast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    setTimeout(()=>{ if(el.textContent===msg) el.textContent=''; }, 1200);
  }

  // ----- Safe storage -----
  function store(){
    try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return localStorage; }
    catch(e){ return sessionStorage; }
  }

  // ----- Robust canvas finder -----
  function findCanvas(){
    if (window.canvas && typeof window.canvas.loadFromJSON === 'function') return window.canvas;
    try {
      for (const k in window){
        const v = window[k];
        if (v && typeof v === 'object'
            && typeof v.add === 'function'
            && typeof v.toJSON === 'function'
            && typeof v.loadFromJSON === 'function'
            && v.upperCanvasEl) return v;
      }
    } catch(e){}
    const el = document.querySelector('canvas');
    if (el && el.fabric && typeof el.fabric.loadFromJSON === 'function') return el.fabric;
    return null;
  }

  // ----- Hook Fabric once: as soon as a canvas is created, expose it -----
  (function hookFabric(){
    if (!window.fabric || !fabric.Canvas || !fabric.Canvas.prototype.initialize) {
      setTimeout(hookFabric, 200); return;
    }
    if (fabric.Canvas.prototype._raHooked) return;
    const orig = fabric.Canvas.prototype.initialize;
    fabric.Canvas.prototype.initialize = function(...args){
      const res = orig.apply(this, args);
      window.canvas = this; // expose for our tools
      document.dispatchEvent(new CustomEvent('ra:canvas-ready',{detail:this}));
      return res;
    };
    fabric.Canvas.prototype._raHooked = true;

    // If canvas already existed before hook, try to grab it
    setTimeout(()=>{ const c = findCanvas(); if (c) { window.canvas = c; document.dispatchEvent(new CustomEvent('ra:canvas-ready',{detail:c})); } }, 300);
  })();

  // ----- Kill legacy autosave + UI (stop flicker & duplicates) -----
  (function hideLegacy(){
    const css = document.createElement('style');
    css.textContent = `
      #raAutoRow, #restoreBtn, #raDebug, #saveStatus { display:none !important; visibility:hidden !important; height:0 !important; overflow:hidden !important; }
      #raAutoRow * { display:none !important; }
    `;
    (document.head||document.documentElement).appendChild(css);

    const kill = ()=> {
      const c = findCanvas();
      if (c) {
        ['object:added','object:modified','object:removed','mouse:up','selection:updated'].forEach(evt=>{
          try { c.off(evt); } catch(e){}
        });
      }
      // hide any stray legacy buttons by label
      Array.from(document.querySelectorAll('button')).forEach(b=>{
        const t = (b.textContent||'').trim().toLowerCase();
        if (t === 'restore last session' || t === 'restore autosave') b.style.display = 'none';
      });
    };
    kill();
    const obs = new MutationObserver(kill);
    obs.observe(document.body, { childList:true, subtree:true });
  })();

  // ----- Helper: run when canvas is really there (retry up to 10x) -----
  function withCanvas(fn, tries=0){
    const c = findCanvas();
    if (c) { if(!window.canvas) window.canvas = c; return fn(c); }
    if (tries >= 10) { toast('Canvas not ready'); return; }
    setTimeout(()=>withCanvas(fn, tries+1), 200);
  }

  // ----- Snapshot (manual "Save now") & Clear -----
  function saveSnapshot(){ withCanvas(c=>{
    try {
      const json = c.toJSON(['_isWatermark','_isOverlayWM']);
      store().setItem(SNAP_KEY, JSON.stringify(json));
      toast('Saved just now');
    } catch(e){ toast('Save error'); }
  });}
  function clearSnapshot(){ store().removeItem(SNAP_KEY); toast('Saved session cleared'); }

  // ----- Checkpoints (manual) -----
  function saveCheckpoint(){ withCanvas(c=>{
    try {
      const json = c.toJSON(['_isWatermark','_isOverlayWM']);
      store().setItem(CKPT_KEY, JSON.stringify(json));
      toast('Checkpoint saved');
    } catch(e){ toast('Checkpoint save error'); }
  });}
  function restoreCheckpoint(){
    const raw = store().getItem(CKPT_KEY);
    if (!raw) { toast('No checkpoint'); return; }
    withCanvas(c=>{
      try {
        // ensure images load okay when restoring
        if (window.fabric && fabric.Image && !fabric.Image._raPatched) {
          const orig = fabric.Image.fromObject;
          fabric.Image.fromObject = function(obj, cb){
            obj = obj || {}; obj.crossOrigin = obj.crossOrigin || 'anonymous';
            return orig.call(this, obj, cb);
          };
          fabric.Image._raPatched = true;
        }
        const json = JSON.parse(raw);
        c.loadFromJSON(json, ()=>{
          c.renderAll();
          if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
          toast('Checkpoint restored');
        });
      } catch(e){ toast('Checkpoint restore error'); }
    });
  }

  // ----- Optional timed autosave (OFF by default) -----
  let timer = null;
  function autosaveEnabled(){ return store().getItem(FLAG_KEY) === '1'; }
  function setAutosave(on){
    if (on) store().setItem(FLAG_KEY,'1'); else store().removeItem(FLAG_KEY);
    updateToggle(); restartTimer();
  }
  function restartTimer(){
    if (timer) { clearInterval(timer); timer = null; }
    if (!autosaveEnabled()) return;
    timer = setInterval(saveSnapshot, AUTOSAVE_MINUTES*60*1000);
  }

  // ----- Clean control row (one line, centered with your styles) -----
  function insertControls(){
    const h3s = Array.from(document.querySelectorAll('h3'));
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const holder = canvasH3 ? canvasH3.parentNode : document.body;

    let row = document.getElementById('raCtrlRowUnified');
    if (!row){
      row = document.createElement('div');
      row.id = 'raCtrlRowUnified';
      row.className = 'row tight';           // uses your layout class → one line
      row.style.marginTop = '6px';

      function Btn(id,label,cls){
        const b = document.createElement('button');
        b.id = id; b.className = 'btn small' + (cls?' '+cls:''); b.textContent = label;
        return b;
      }

      const bSave  = Btn('raSaveNow','Save now');
      const bClear = Btn('raClearSaved','Clear saved','danger');
      const bSCk   = Btn('raSaveCk','Save checkpoint');
      const bRCk   = Btn('raRestoreCk','Restore checkpoint');
      const bAuto  = Btn('raAutoToggle','Autosave: Off');

      bSave.addEventListener('click', saveSnapshot);
      bClear.addEventListener('click', clearSnapshot);
      bSCk.addEventListener('click', saveCheckpoint);
      bRCk.addEventListener('click', restoreCheckpoint);
      bAuto.addEventListener('click', ()=> setAutosave(!autosaveEnabled()));

      row.append(bSave, bClear, bSCk, bRCk, bAuto);
      holder.appendChild(row);
      updateToggle();
    }
  }

  function updateToggle(){
    const b = document.getElementById('raAutoToggle');
    if (!b) return;
    b.textContent = autosaveEnabled() ? `Autosave: On (${AUTOSAVE_MINUTES}m)` : 'Autosave: Off';
  }

  // ----- Keep things stable even if the UI re-renders -----
  const obs = new MutationObserver(()=> insertControls());
  obs.observe(document.body, { childList:true, subtree:true });

  // Insert controls ASAP; keep toggle label current; keep timer in sync
  function init(){
    insertControls();
    updateToggle();
    restartTimer();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('ra:canvas-ready', ()=> { updateToggle(); }); // when Fabric fires
})();
/* ===== RA SUPER-RESET — Checkpoints only (no autosave, no "Save now") =====
   - Hides/removes legacy autosave UI and per-move saves.
   - Hooks Fabric so we always get the real canvas.
   - Adds ONE clean row in the Canvas card: [Save checkpoint] [Restore checkpoint]
   - Saves as Fabric JSON, so layers remain editable after restore.
============================================================================ */
(function RA_SUPER_RESET(){
  const CKPT_KEY = 'ra_checkpoint_v1';

  // Toast (bottom center) so you know actions worked
  function toast(msg){
    let el = document.getElementById('raToast2');
    if(!el){
      el = document.createElement('div');
      el.id = 'raToast2';
      Object.assign(el.style,{
        position:'fixed', left:'50%', bottom:'16px', transform:'translateX(-50%)',
        background:'rgba(0,0,0,.72)', color:'#fff', padding:'6px 10px',
        borderRadius:'6px', fontSize:'12px', zIndex:'99999', pointerEvents:'none'
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    setTimeout(()=>{ if(el.textContent===msg) el.textContent=''; }, 1200);
  }

  // Safe storage (fallback if localStorage is blocked)
  function store(){
    try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return localStorage; }
    catch(e){ return sessionStorage; }
  }

  // Robust canvas finder (many fallbacks)
  function findCanvas(){
    if (window.canvas && typeof window.canvas.loadFromJSON === 'function') return window.canvas;

    // Try DOM → possible backrefs
    const tryDom = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      for (const key of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']) {
        const v = el[key];
        if (v && typeof v.loadFromJSON === 'function') return v;
      }
      if (el.parentElement){
        for (const key of ['fabric','__canvas','canvas','fabricCanvas']) {
          const v = el.parentElement[key];
          if (v && typeof v.loadFromJSON === 'function') return v;
        }
      }
      return null;
    };
    let c = tryDom('canvas.upper-canvas') || tryDom('canvas.lower-canvas') || tryDom('canvas');
    if (c) { window.canvas = c; return c; }

    // Scan globals for a Fabric canvas-like object
    try {
      for (const k in window){
        const v = window[k];
        if (v && typeof v === 'object'
            && typeof v.add === 'function'
            && typeof v.toJSON === 'function'
            && typeof v.loadFromJSON === 'function'
            && v.upperCanvasEl) { window.canvas = v; return v; }
      }
    } catch(e){}

    return null;
  }

  // Hook Fabric so we catch the canvas the moment it’s created
  (function hookFabric(){
    if (!window.fabric || !fabric.Canvas || !fabric.Canvas.prototype.initialize) {
      setTimeout(hookFabric, 200); return;
    }
    if (fabric.Canvas.prototype._raHookedSuper) return;
    const orig = fabric.Canvas.prototype.initialize;
    fabric.Canvas.prototype.initialize = function(...args){
      const res = orig.apply(this, args);
      window.canvas = this;                       // expose for tools
      document.dispatchEvent(new Event('ra:canvas-ready'));
      return res;
    };
    fabric.Canvas.prototype._raHookedSuper = true;

    // If the canvas already exists, try to grab it soon after
    setTimeout(()=>{ const c = findCanvas(); if (c) { window.canvas = c; document.dispatchEvent(new Event('ra:canvas-ready')); } }, 300);
  })();

  // Remove old per-move autosave listeners and hide legacy buttons (stop flicker/duplicates)
  function silenceLegacy(){
    // Hide legacy rows/buttons by id or label
    ['raAutoRow','restoreBtn','raDebug','saveStatus','raCtrlRowUnified','raCtrlRow','raCkRowOld'].forEach(id=>{
      const el = document.getElementById(id); if (el) el.style.display='none';
    });
    Array.from(document.querySelectorAll('button')).forEach(b=>{
      const t = (b.textContent||'').trim().toLowerCase();
      if (t==='restore last session' || t==='restore autosave' || t==='save now' || t==='clear saved' || t.startsWith('autosave')) {
        b.style.display='none';
      }
    });
    // Detach common autosave move listeners
    const c = findCanvas();
    if (c){
      ['object:added','object:modified','object:removed','mouse:up','selection:updated'].forEach(evt=>{ try{ c.off(evt); }catch(e){} });
    }
  }

  // Retry helper that waits for canvas without throwing "not ready"
  function withCanvas(fn, tries=0){
    const c = findCanvas();
    if (c) return fn(c);
    if (tries > 25) { toast('Canvas not ready'); return; }   // ~5s total wait
    setTimeout(()=>withCanvas(fn, tries+1), 200);
  }

  // --- Checkpoints only ---
  function saveCheckpoint(){ withCanvas(c=>{
    try{
      const json = c.toJSON(['_isWatermark','_isOverlayWM']);
      store().setItem(CKPT_KEY, JSON.stringify(json));
      toast('Checkpoint saved');
    }catch(e){ toast('Checkpoint save error'); }
  });}

  function restoreCheckpoint(){
    const raw = store().getItem(CKPT_KEY);
    if (!raw) { toast('No checkpoint'); return; }
    withCanvas(c=>{
      try{
        // Ensure images restore with CORS ok
        if (window.fabric && fabric.Image && !fabric.Image._raPatchedX){
          const orig = fabric.Image.fromObject;
          fabric.Image.fromObject = function(obj, cb){
            obj = obj || {}; obj.crossOrigin = obj.crossOrigin || 'anonymous';
            return orig.call(this, obj, cb);
          };
          fabric.Image._raPatchedX = true;
        }
        const json = JSON.parse(raw);
        c.loadFromJSON(json, ()=>{
          c.renderAll();
          if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
          toast('Checkpoint restored');
        });
      }catch(e){ toast('Checkpoint restore error'); }
    });
  }

  // Insert one clean row in the Canvas card (aligned, no stacking)
  function insertRow(){
    const h3s = Array.from(document.querySelectorAll('h3'));
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const holder = canvasH3 ? canvasH3.parentNode : document.body;

    let row = document.getElementById('raCkRow');
    if (row) return;

    row = document.createElement('div');
    row.id = 'raCkRow';
    row.className = 'row tight';
    // Ensure single row & proper spacing regardless of theme css
    Object.assign(row.style, { display:'flex', flexWrap:'wrap', gap:'8px', alignItems:'center', marginTop:'6px' });

    const mkBtn = (label) => { const b = document.createElement('button'); b.className='btn small'; b.textContent=label; return b; };

    const bSave = mkBtn('Save checkpoint');
    const bRestore = mkBtn('Restore checkpoint');

    bSave.addEventListener('click', saveCheckpoint);
    bRestore.addEventListener('click', restoreCheckpoint);

    row.append(bSave, bRestore);
    holder.appendChild(row);
  }

  // Keep things stable even if UI re-renders
  const obs = new MutationObserver(()=>{
    silenceLegacy();
    insertRow();
  });
  obs.observe(document.body, { childList:true, subtree:true });

  // Initial run
  (function boot(){
    silenceLegacy();
    insertRow();
  })();

  // Also react when Fabric signals it's ready
  document.addEventListener('ra:canvas-ready', ()=> {
    silenceLegacy();
    insertRow();
  });
})();
/* ===== RA MINIMAL CHECKPOINTS — reliable canvas + two buttons only ===== */
(function RA_MIN_CKPTS(){
  const CKPT_KEY = 'ra_checkpoint_v1';

  // Small toast so you know actions worked
  function toast(msg){
    let el = document.getElementById('raToast2');
    if (!el) {
      el = document.createElement('div');
      el.id = 'raToast2';
      Object.assign(el.style, {
        position:'fixed', left:'50%', bottom:'16px', transform:'translateX(-50%)',
        background:'rgba(0,0,0,.72)', color:'#fff', padding:'6px 10px',
        borderRadius:'6px', fontSize:'12px', zIndex:'99999', pointerEvents:'none'
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    setTimeout(()=>{ if (el.textContent === msg) el.textContent = ''; }, 1200);
  }

  // Safe storage (fallback if localStorage blocked)
  function store(){
    try { localStorage.setItem('__ra_t__','1'); localStorage.removeItem('__ra_t__'); return localStorage; }
    catch(e){ return sessionStorage; }
  }

  // Find Fabric canvas (robust)
  function findCanvas(){
    if (window.canvas && typeof window.canvas.loadFromJSON === 'function') return window.canvas;
    // Try DOM backrefs
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas.lower-canvas') || document.querySelector('canvas');
    if (el) {
      for (const key of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']) {
        const v = el[key]; if (v && typeof v.loadFromJSON === 'function') { window.canvas = v; return v; }
      }
    }
    // Scan window for a Fabric-like canvas
    try {
      for (const k in window) {
        const v = window[k];
        if (v && typeof v === 'object'
          && typeof v.add === 'function'
          && typeof v.toJSON === 'function'
          && typeof v.loadFromJSON === 'function'
          && v.upperCanvasEl) { window.canvas = v; return v; }
      }
    } catch(e){}
    return null;
  }

  // *** CRITICAL: capture the canvas even if created earlier ***
  (function hookFabricLate(){
    function hook() {
      if (!window.fabric || !fabric.Canvas) { setTimeout(hook, 200); return; }
      if (fabric.Canvas.prototype._raHookedMin) return;
      // When anything is added OR background is set, we grab the instance.
      const origAdd = fabric.Canvas.prototype.add;
      fabric.Canvas.prototype.add = function(...args){
        window.canvas = this;
        document.dispatchEvent(new Event('ra:canvas-ready'));
        return origAdd.apply(this, args);
      };
      const origBG = fabric.Canvas.prototype.setBackgroundImage;
      fabric.Canvas.prototype.setBackgroundImage = function(...args){
        window.canvas = this;
        document.dispatchEvent(new Event('ra:canvas-ready'));
        return origBG.apply(this, args);
      };
      fabric.Canvas.prototype._raHookedMin = true;

      // If a canvas already exists, try to find it shortly
      setTimeout(()=>{ const c = findCanvas(); if (c) { window.canvas = c; document.dispatchEvent(new Event('ra:canvas-ready')); } }, 300);
    }
    hook();
  })();

  // Retry helper so buttons don’t show "not ready" if you click fast
  function withCanvas(fn, tries=0){
    const c = findCanvas();
    if (c) return fn(c);
    if (tries > 25) { toast('Canvas not ready'); return; } // waits up to ~5s total
    setTimeout(()=>withCanvas(fn, tries+1), 200);
  }

  // Save / Restore checkpoint (Fabric JSON so layers remain editable)
  function saveCheckpoint(){ withCanvas(c=>{
    try {
      const json = c.toJSON(['_isWatermark','_isOverlayWM']);
      store().setItem(CKPT_KEY, JSON.stringify(json));
      toast('Checkpoint saved');
    } catch(e){ toast('Checkpoint save error'); }
  });}

  function restoreCheckpoint(){
    const raw = store().getItem(CKPT_KEY);
    if (!raw) { toast('No checkpoint'); return; }
    withCanvas(c=>{
      try {
        // Ensure restored images load cross‑origin
        if (window.fabric && fabric.Image && !fabric.Image._raPatched2) {
          const orig = fabric.Image.fromObject;
          fabric.Image.fromObject = function(obj, cb){
            obj = obj || {}; obj.crossOrigin = obj.crossOrigin || 'anonymous';
            return orig.call(this, obj, cb);
          };
          fabric.Image._raPatched2 = true;
        }
        const json = JSON.parse(raw);
        c.loadFromJSON(json, ()=>{
          c.renderAll();
          if (typeof refreshWatermarkGate === 'function') refreshWatermarkGate();
          toast('Checkpoint restored');
        });
      } catch(e){ toast('Checkpoint restore error'); }
    });
  }

  // Hide ALL legacy autosave / save-now UI to avoid duplicates/flicker
  function hideLegacyUI(){
    const byId = ['raAutoRow','restoreBtn','raDebug','saveStatus','raCtrlRowUnified','raCtrlRow','raCkRowOld'];
    byId.forEach(id => { const el = document.getElementById(id); if (el) el.style.display='none'; });
    Array.from(document.querySelectorAll('button')).forEach(b=>{
      const t = (b.textContent||'').trim().toLowerCase();
      if (t==='restore last session' || t==='restore autosave' || t==='save now' || t==='clear saved' || t.startsWith('autosave')) {
        b.style.display='none';
      }
    });
    // Detach move‑based autosave, if any
    const c = findCanvas();
    if (c){
      ['object:added','object:modified','object:removed','mouse:up','selection:updated'].forEach(evt=>{ try{ c.off(evt); }catch(e){} });
    }
  }

  // Insert ONE clean, aligned row: [Save checkpoint] [Restore checkpoint]
  function insertRow(){
    const h3s = Array.from(document.querySelectorAll('h3'));
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const holder = canvasH3 ? canvasH3.parentNode : document.body;

    let row = document.getElementById('raCkRow');
    if (row) return;

    row = document.createElement('div');
    row.id = 'raCkRow';
    row.className = 'row tight'; // uses your grid; ensures one line with your theme
    row.style.marginTop = '6px';

    const mk = (label)=>{ const b=document.createElement('button'); b.className='btn small'; b.textContent=label; return b; };
    const bSave = mk('Save checkpoint');
    const bRestore = mk('Restore checkpoint');

    bSave.addEventListener('click', saveCheckpoint);
    bRestore.addEventListener('click', restoreCheckpoint);

    row.append(bSave, bRestore);
    holder.appendChild(row);
  }

  // Keep things stable even if UI re-renders parts of the left panel
  const obs = new MutationObserver(()=>{ hideLegacyUI(); insertRow(); });
  obs.observe(document.body, { childList:true, subtree:true });

  // Initial pass + also when we know Fabric is ready
  (function boot(){ hideLegacyUI(); insertRow(); })();
  document.addEventListener('ra:canvas-ready', ()=>{ hideLegacyUI(); insertRow(); });
})();
/* === RA_BASE_LOCK — auto-lock the base NFT image so it can't move === */
(function RA_BASE_LOCK(){
  let baseLocked = false;

  function findCanvas(){
    if (window.canvas && typeof window.canvas.loadFromJSON === 'function') return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas.lower-canvas') || document.querySelector('canvas');
    if (el){
      for (const key of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[key]; if (v && typeof v.loadFromJSON === 'function') return v;
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && typeof v.add==='function' && typeof v.loadFromJSON==='function' && v.upperCanvasEl) return v;
      }
    }catch(e){}
    return null;
  }

  function lockAsBase(img, c){
    if (!img || img._isBase) return;
    img._isBase = true;
    img.selectable = false;
    img.evented = false;
    img.hasControls = false;
    img.lockMovementX = img.lockMovementY = true;
    img.hoverCursor = 'default';
    try { c.sendToBack(img); } catch(e){}
    c.discardActiveObject();
    c.requestRenderAll();
    baseLocked = true;
  }

  function isBaseCandidate(obj, c){
    if (!obj || obj.type !== 'image') return false;
    const imgs = c.getObjects('image');
    if (imgs.length === 1) return true; // first image on canvas
    const w = obj.width * obj.scaleX, h = obj.height * obj.scaleY;
    const cw = c.getWidth(), ch = c.getHeight();
    return (w >= cw * 0.9 && h >= ch * 0.9); // very large image ≈ base
  }

  function attach(){
    const c = findCanvas(); if (!c){ setTimeout(attach, 300); return; }
    // Lock the first suitable image that gets added
    c.on('object:added', e=>{
      const o = e.target || e; if (!o) return;
      if (!baseLocked && isBaseCandidate(o, c)) lockAsBase(o, c);
    });
  }

  function resetLockSoon(){
    baseLocked = false;
    setTimeout(()=>{
      const c = findCanvas(); if (!c) return;
      const imgs = c.getObjects('image');
      if (imgs.length){
        // choose the largest image as base if not already marked
        const base = imgs.reduce((a,b)=>{
          const sa=(a.width*a.scaleX)*(a.height*a.scaleY), sb=(b.width*b.scaleX)*(b.height*b.scaleY);
          return sb>sa ? b : a;
        });
        lockAsBase(base, c);
      }
    }, 800);
  }

  function wireLoadAndClearButtons(){
    const btns = Array.from(document.querySelectorAll('button'));
    const byText = t => btns.find(b => (b.textContent||'').trim().toLowerCase() === t);
    const clearBase   = byText('clear base');
    const load        = byText('load');            // paste URL → Load
    const loadByToken = byText('load by token');   // token loader
    [clearBase, load, loadByToken].forEach(btn=>{
      if (btn && !btn._raBL){
        btn._raBL = true;
        btn.addEventListener('click', ()=> resetLockSoon());
      }
    });
  }

  attach();
  wireLoadAndClearButtons();
  document.addEventListener('ra:canvas-ready', ()=>{ baseLocked=false; resetLockSoon(); });
  const obs = new MutationObserver(()=> wireLoadAndClearButtons());
  obs.observe(document.body, { childList:true, subtree:true });
})();

/* ===== RA_BASE_LOCK_V2 — unbreakable base lock (works on load, add, restore) ===== */
(function RA_BASE_LOCK_V2(){
  let baseObj = null;      // the object we consider "base"
  let lockedOnce = false;  // stops re-picking random large overlays later

  // Find Fabric canvas (robust)
  function findCanvas(){
    if (window.canvas && typeof window.canvas.loadFromJSON === 'function') return window.canvas;
    const el = document.querySelector('canvas.upper-canvas')
            || document.querySelector('canvas.lower-canvas')
            || document.querySelector('canvas');
    if (el){
      for (const key of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[key]; if (v && typeof v.loadFromJSON === 'function') return v;
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && typeof v === 'object'
            && typeof v.loadFromJSON === 'function'
            && typeof v.add === 'function'
            && v.upperCanvasEl) return v;
      }
    }catch(e){}
    return null;
  }

  function area(o){ return (o.width||0)*(o.height||0)*(o.scaleX||1)*(o.scaleY||1); }

  // Decide if an image is the "base" (very large compared to canvas, and it's early)
  function isBaseCandidate(o, c){
    if (!o || o.type !== 'image') return false;
    const cw = c.getWidth(), ch = c.getHeight();
    const a = area(o), ca = cw*ch;
    // Must cover at least ~70% of canvas area OR be within 90% of width/height
    const bigByArea = a >= ca*0.7;
    const bigBySide = (o.getScaledWidth ? o.getScaledWidth() : (o.width||0)*(o.scaleX||1)) >= cw*0.9
                   && (o.getScaledHeight? o.getScaledHeight(): (o.height||0)*(o.scaleY||1)) >= ch*0.9;
    return bigByArea || bigBySide;
  }

  function lock(o, c){
    if (!o || !c) return;
    baseObj = o;
    lockedOnce = true;
    o._isBase = true;
    o.selectable = false;
    o.evented = false;
    o.hasControls = false;
    o.lockMovementX = o.lockMovementY = true;
    o.perPixelTargetFind = false;
    o.hoverCursor = 'default';
    try { c.sendToBack(o); } catch(e){}
    // If base accidentally became active, deselect it
    try { if (c.getActiveObject() === o) { c.discardActiveObject(); } } catch(e){}
    c.requestRenderAll();
  }

  // Scan canvas for a base image and lock it
  function scanAndLock(c){
    if (!c) return;
    // Prefer an already-marked base (e.g., after restore)
    const marked = c.getObjects('image').find(img => img._isBase === true);
    if (marked) { lock(marked, c); return; }
    if (lockedOnce) return; // we already chose a base earlier

    const imgs = c.getObjects('image');
    if (!imgs.length) return;
    // Sort by area (largest first)
    imgs.sort((a,b)=> area(b)-area(a));
    const candidate = imgs[0];
    if (isBaseCandidate(candidate, c)) lock(candidate, c);
  }

  // Keep base unselectable even if something tries to select it
  function guardSelection(c){
    c.on('selection:created', e=>{
      const o = c.getActiveObject();
      if (o === baseObj) { c.discardActiveObject(); c.requestRenderAll(); }
    });
    c.on('selection:updated', e=>{
      const o = c.getActiveObject();
      if (o === baseObj) { c.discardActiveObject(); c.requestRenderAll(); }
    });
    c.on('mouse:down', e=>{
      const t = e && e.target;
      if (t === baseObj) {
        c.discardActiveObject();
        c.requestRenderAll();
      }
    });
  }

  // Wrap Fabric so we re-lock after JSON restores (checkpoints) too
  function hookFabric(){
    if (!window.fabric || !fabric.Canvas || !fabric.Canvas.prototype.initialize) {
      setTimeout(hookFabric, 200); return;
    }
    if (!fabric.Canvas.prototype._raBaseLocked){
      const origInit = fabric.Canvas.prototype.initialize;
      fabric.Canvas.prototype.initialize = function(...args){
        const res = origInit.apply(this, args);
        // expose canvas
        window.canvas = this;
        // lock on creation
        setTimeout(()=>{ scanAndLock(this); guardSelection(this); }, 0);
        return res;
      };
      // Re-lock after loadFromJSON (e.g., restoring checkpoints)
      const origLoad = fabric.Canvas.prototype.loadFromJSON;
      fabric.Canvas.prototype.loadFromJSON = function(json, cb, reviver){
        const self = this;
        return origLoad.call(this, json, function(){
          try { scanAndLock(self); guardSelection(self); } catch(e){}
          if (typeof cb === 'function') cb.apply(self, arguments);
        }, reviver);
      };
      // When a big image is added, consider it for base (only if we haven't locked yet)
      const origAdd = fabric.Canvas.prototype.add;
      fabric.Canvas.prototype.add = function(...args){
        const res = origAdd.apply(this, args);
        try {
          const last = args && args[0];
          if (!lockedOnce && last && last.type === 'image' && isBaseCandidate(last, this)) {
            lock(last, this);
          } else {
            // still scan, in case order is odd
            scanAndLock(this);
          }
        } catch(e){}
        return res;
      };
      fabric.Canvas.prototype._raBaseLocked = true;
    }

    // If canvas already exists, apply guards and scan now
    setTimeout(()=>{ const c = findCanvas(); if (c){ window.canvas = c; scanAndLock(c); guardSelection(c);} }, 300);
  }

  // Also try periodically in case UI loads late
  (function tick(){
    const c = findCanvas();
    if (c){ window.canvas = c; scanAndLock(c); guardSelection(c); }
    setTimeout(tick, 800);
  })();

  hookFabric();
})();

/* ===== RA_BLOCKER_CLEAN + HARD_BASE_LOCK =====
   - Removes any huge black rectangle that sits over the canvas.
   - Re-locks the true base NFT (largest near-full-canvas image).
   - Runs on load, on add, on restore; plus a "Fix canvas" button.
================================================ */
(function RA_BLOCKER_AND_BASE_LOCK(){
  let baseObj = null; // the locked base image

  // 1) Find Fabric canvas reliably
  function findCanvas(){
    if (window.canvas && typeof window.canvas.loadFromJSON === 'function') return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas.lower-canvas') || document.querySelector('canvas');
    if (el){
      for (const key of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[key]; if (v && typeof v.loadFromJSON === 'function') { window.canvas = v; return v; }
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && typeof v === 'object'
            && typeof v.add === 'function'
            && typeof v.loadFromJSON === 'function'
            && typeof v.toJSON === 'function'
            && v.upperCanvasEl) { window.canvas = v; return v; }
      }
    }catch(e){}
    return null;
  }

  // 2) Helpers
  function area(o){ return (o.width||0)*(o.height||0)*(o.scaleX||1)*(o.scaleY||1); }
  function scaledW(o){ return (o.getScaledWidth? o.getScaledWidth(): (o.width||0)*(o.scaleX||1)); }
  function scaledH(o){ return (o.getScaledHeight? o.getScaledHeight(): (o.height||0)*(o.scaleY||1)); }

  function isBlackish(fill){
    if (!fill) return false;
    const s = (''+fill).trim().toLowerCase();
    if (s === 'black' || s === '#000' || s === '#000000' || s === 'rgb(0,0,0)' || s === 'rgba(0,0,0,1)') return true;
    // rgba(...) parser
    const m = s.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/);
    if (m){
      const r=+m[1], g=+m[2], b=+m[3], a=(m[4]===undefined?1:+m[4]);
      return (r<12 && g<12 && b<12 && a>=0.95);
    }
    return false;
  }

  function isHuge(o, c){
    const cw = c.getWidth(), ch = c.getHeight();
    const a = area(o), ca = cw*ch;
    return a >= ca*0.6 || (scaledW(o) >= cw*0.9 && scaledH(o) >= ch*0.9);
  }

  function isBaseCandidate(o, c){
    return o && o.type === 'image' && isHuge(o,c);
  }

  // 3) Lock an object as the unmovable base
  function lockBase(o, c){
    if (!o || !c) return;
    baseObj = o;
    o._isBase = true;
    o.selectable = false;
    o.evented = false;
    o.hasControls = false;
    o.lockMovementX = o.lockMovementY = true;
    o.perPixelTargetFind = false;
    o.hoverCursor = 'default';
    try { c.sendToBack(o); } catch(e){}
    // Drop selection if base became active
    try { if (c.getActiveObject() === o) c.discardActiveObject(); } catch(e){}
  }

  // 4) Remove any huge black rect that blocks the view
  function scrubBlockers(c){
    let removed = false;
    const objs = c.getObjects();
    for (let i=objs.length-1;i>=0;i--){
      const o = objs[i];
      if (o && o.type === 'rect' && isHuge(o,c) && isBlackish(o.fill) && !o._isBase){
        try { c.remove(o); removed = true; } catch(e){ /* ignore */ }
      }
    }
    if (removed) c.requestRenderAll();
  }

  // 5) Pick/lock base if needed (largest image)
  function ensureBase(c){
    if (baseObj && c.getObjects().includes(baseObj)) return;
    const imgs = c.getObjects('image');
    if (!imgs.length) return;
    imgs.sort((a,b)=> area(b)-area(a));
    const cand = imgs[0];
    if (isBaseCandidate(cand, c)) lockBase(cand, c);
    try { c.requestRenderAll(); } catch(e){}
  }

  // 6) Keep base unselectable even if something tries to select it
  function guardSelection(c){
    ['selection:created','selection:updated'].forEach(evt=>{
      c.on(evt, ()=> {
        const a = c.getActiveObject();
        if (a === baseObj){ c.discardActiveObject(); c.requestRenderAll(); }
      });
    });
    c.on('mouse:down', e=>{
      if (e && e.target === baseObj){ c.discardActiveObject(); c.requestRenderAll(); }
    });
  }

  // 7) Run cleanup + base lock now
  function cleanAndLock(){
    const c = findCanvas(); if (!c) return;
    scrubBlockers(c);
    ensureBase(c);
    guardSelection(c);
  }

  // 8) Hook Fabric so we run after adds/restores
  (function hookFabric(){
    if (!window.fabric || !fabric.Canvas || !fabric.Canvas.prototype.initialize) {
      setTimeout(hookFabric, 200); return;
    }
    if (!fabric.Canvas.prototype._raCleanLock){
      const origInit = fabric.Canvas.prototype.initialize;
      fabric.Canvas.prototype.initialize = function(...args){
        const res = origInit.apply(this, args);
        window.canvas = this;
        setTimeout(cleanAndLock, 0);
        return res;
      };
      const origAdd = fabric.Canvas.prototype.add;
      fabric.Canvas.prototype.add = function(...args){
        const res = origAdd.apply(this, args);
        setTimeout(cleanAndLock, 0);
        return res;
      };
      const origLoad = fabric.Canvas.prototype.loadFromJSON;
      fabric.Canvas.prototype.loadFromJSON = function(json, cb, reviver){
        const self = this;
        return origLoad.call(this, json, function(){
          try { cleanAndLock(); } catch(e){}
          if (typeof cb === 'function') cb.apply(self, arguments);
        }, reviver);
      };
      fabric.Canvas.prototype._raCleanLock = true;
    }
    // If canvas already exists, run once shortly
    setTimeout(cleanAndLock, 300);
  })();

  // 9) Add a small "Fix canvas" button in Canvas card (manual safety)
  function insertFixButton(){
    const h3s = Array.from(document.querySelectorAll('h3'));
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const holder = canvasH3 ? canvasH3.parentNode : document.body;

    // Put it next to your checkpoint row if present; otherwise just add a tiny row
    const row = document.getElementById('raCkRow');
    const place = row || holder;

    if (!document.getElementById('raFixCanvas')){
      const btn = document.createElement('button');
      btn.id = 'raFixCanvas';
      btn.className = 'btn small';
      btn.style.marginLeft = '6px';
      btn.textContent = 'Fix canvas';
      btn.addEventListener('click', ()=> cleanAndLock());
      (row ? row.appendChild(btn) : holder.appendChild(btn));
    }
  }

  insertFixButton();
  const obs = new MutationObserver(()=> insertFixButton());
  obs.observe(document.body, { childList:true, subtree:true });

  // 10) Keep trying briefly in case UI loads slow
  (function tick(){ cleanAndLock(); setTimeout(tick, 800); })();
})();

/* ===== RA_KILL_BLACK_BOX_V3 — remove large dark blocker + keep base locked ===== */
(function RA_KILL_BLACK_BOX_V3(){
  let baseObj = null;

  // --- helpers ---
  function findCanvas(){
    if (window.canvas && typeof window.canvas.loadFromJSON === 'function') return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas.lower-canvas') || document.querySelector('canvas');
    if (el){
      for (const key of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[key]; if (v && typeof v.loadFromJSON === 'function') { window.canvas = v; return v; }
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && typeof v === 'object'
            && typeof v.add === 'function'
            && typeof v.loadFromJSON === 'function'
            && typeof v.toJSON === 'function'
            && v.upperCanvasEl) { window.canvas = v; return v; }
      }
    }catch(e){}
    return null;
  }
  const area    = o => (o.width||0)*(o.height||0)*(o.scaleX||1)*(o.scaleY||1);
  const sW      = o => (o.getScaledWidth ? o.getScaledWidth()  : (o.width||0)*(o.scaleX||1));
  const sH      = o => (o.getScaledHeight? o.getScaledHeight() : (o.height||0)*(o.scaleY||1));

  function parseRGBA(val){
    if (!val) return null;
    const s = (''+val).trim().toLowerCase();
    if (s === 'black') return [0,0,0,1];
    if (s.startsWith('#')){
      const hex = s.replace('#','');
      const h = hex.length===3 ? hex.split('').map(x=>x+x).join('') : hex;
      const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
      return [r,g,b,1];
    }
    const m = s.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([0-9.]+))?\)/);
    if (m) return [ +m[1], +m[2], +m[3], m[4]===undefined?1:+m[4] ];
    return null;
  }
  function isDarkish(fill){
    const c = parseRGBA(fill); if (!c) return false;
    const [r,g,b,a] = c; if (a < 0.4) return false;
    // perceived luminance
    const lum = (0.299*r + 0.587*g + 0.114*b)/255;
    return lum < 0.22; // allow very dark greys (not only pure black)
  }
  function isHuge(o,c){
    const cw=c.getWidth(), ch=c.getHeight();
    return (sW(o)>=cw*0.8 || sH(o)>=ch*0.8 || area(o) >= cw*ch*0.35);
  }
  function isBlocker(o,c){
    return o && o.type==='rect' && isHuge(o,c) && isDarkish(o.fill) && !o._isBase;
  }

  function lockBase(o,c){
    if (!o || !c) return;
    baseObj = o;
    o._isBase = true;
    o.selectable = false;
    o.evented = false;
    o.hasControls = false;
    o.lockMovementX = o.lockMovementY = true;
    o.perPixelTargetFind = false;
    o.hoverCursor = 'default';
    try { c.sendToBack(o); } catch(e){}
    try { if (c.getActiveObject() === o) c.discardActiveObject(); } catch(e){}
  }

  function ensureBase(c){
    if (baseObj && c.getObjects().includes(baseObj)) return;
    const imgs = c.getObjects('image');
    if (!imgs.length) return;
    imgs.sort((a,b)=> area(b)-area(a));
    lockBase(imgs[0], c);
  }

  function guardBaseSelection(c){
    ['selection:created','selection:updated'].forEach(evt=>{
      c.on(evt, ()=>{ if (c.getActiveObject()===baseObj){ c.discardActiveObject(); c.requestRenderAll(); }});
    });
    c.on('mouse:down', e=>{ if (e && e.target===baseObj){ c.discardActiveObject(); c.requestRenderAll(); }});
  }

  function nukeBlockers(c){
    let removed = 0;
    c.getObjects().forEach(o=>{
      try{ if (isBlocker(o,c)) { c.remove(o); removed++; } }catch(e){}
    });
    if (removed) c.requestRenderAll();
    return removed;
  }

  function fixCanvas(){
    const c = findCanvas(); if (!c) return;
    nukeBlockers(c);
    ensureBase(c);
    guardBaseSelection(c);
    c.requestRenderAll();
  }

  // Hook Fabric so fix runs on add/restore too
  (function hookFabric(){
    if (!window.fabric || !fabric.Canvas || !fabric.Canvas.prototype.initialize) { setTimeout(hookFabric, 200); return; }
    if (fabric.Canvas.prototype._raKillBox) return;
    const init = fabric.Canvas.prototype.initialize;
    fabric.Canvas.prototype.initialize = function(...args){ const r=init.apply(this,args); window.canvas=this; setTimeout(fixCanvas,0); return r; };
    const add  = fabric.Canvas.prototype.add;
    fabric.Canvas.prototype.add = function(...args){ const r=add.apply(this,args); setTimeout(fixCanvas,0); return r; };
    const load = fabric.Canvas.prototype.loadFromJSON;
    fabric.Canvas.prototype.loadFromJSON = function(json, cb, rev){
      const self=this;
      return load.call(this,json,function(){
        try{ fixCanvas(); }catch(e){}
        if (typeof cb==='function') cb.apply(self, arguments);
      }, rev);
    };
    fabric.Canvas.prototype._raKillBox = true;
    setTimeout(fixCanvas, 300);
  })();

  // Add a small "Fix canvas" button next to your checkpoint row
  function insertFixBtn(){
    const h3s = Array.from(document.querySelectorAll('h3'));
    const canvasH3 = h3s.find(h => (h.textContent||'').trim().toLowerCase() === 'canvas');
    const holder = canvasH3 ? canvasH3.parentNode : document.body;
    const row = document.getElementById('raCkRow') || holder;
    if (!document.getElementById('raFixCanvas')){
      const b = document.createElement('button');
      b.id = 'raFixCanvas';
      b.className = 'btn small';
      b.style.marginLeft = '6px';
      b.textContent = 'Fix canvas';
      b.addEventListener('click', fixCanvas);
      (row ? row.appendChild(b) : holder.appendChild(b));
    }
  }
  insertFixBtn();
  const obs = new MutationObserver(()=> insertFixBtn());
  obs.observe(document.body, { childList:true, subtree:true });

  // Run a few times early to catch async image loads
  let tries = 0; (function early(){ fixCanvas(); if (++tries<8) setTimeout(early, 600); })();
})();

/* === RA_OPEN_NEW_TAB_ONLY_V3 — single open via CLICK only; never hijack builder === */
(function RA_OPEN_NEW_TAB_ONLY_V3(){
  function findCanvas(){
    if (window.canvas && typeof window.canvas.toDataURL === 'function') return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas.lower-canvas') || document.querySelector('canvas');
    if (el){
      for (const key of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[key]; if (v && typeof v.toDataURL === 'function') return v;
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && typeof v.toDataURL==='function' && v.upperCanvasEl) return v;
      }
    }catch(e){}
    return null;
  }

  function getMultiplier(){
    const txt = (document.querySelector('.export-quality')?.textContent
                 || document.querySelector('#exportQuality')?.value
                 || '').toLowerCase();
    const m = (txt.match(/x\s*([1-8])/i)||[])[1];
    return Math.max(1, parseInt(m||'1',10));
  }

  function isOpenNewTabEl(node){
    const el = node && node.closest && node.closest('button,a');
    if (!el) return null;
    const t = (el.textContent||'').trim().toLowerCase();
    return /open\s*in\s*new\s*tab/.test(t) ? el : null;
  }

  // Ensure the anchor itself can't navigate even if something else fires
  function neutralizeLink(){
    const el = Array.from(document.querySelectorAll('a,button'))
      .find(n => /open\s*in\s*new\s*tab/i.test((n.textContent||'')));
    if (el && el.tagName === 'A'){
      if (!el.dataset.raSavedHref) el.dataset.raSavedHref = el.getAttribute('href') || '';
      el.setAttribute('href','javascript:void(0)');
      el.removeAttribute('target');
    }
  }

  function openOnlyNewTab(){
    const c = findCanvas();
    if (!c){ alert('Canvas not ready'); return; }
    const win = window.open('', '_blank');         // popup‑safe: open synchronously on click
    if (!win){ alert('Popup blocked. Allow popups for this site.'); return; }
    win.document.title = 'Exporting…';
    win.document.body.style.margin = '0';
    win.document.body.innerHTML = '<div style="padding:14px;font:14px/1.4 -apple-system,Segoe UI,Arial">Generating image…</div>';
    try{
      const mult = getMultiplier();
      const dataUrl = c.toDataURL({ format:'png', multiplier: mult });
      win.document.body.innerHTML = `<img src="${dataUrl}" style="display:block;max-width:100%;height:auto">`;
    }catch(e){
      win.close();
      alert('Export failed (security/CORS). Try a different image or your hosted domain with CORS headers.');
    }
  }

  // Handle ONLY the CLICK event (capture) and guard against accidental double‑fires
  let lastOpenAt = 0;
  function onClickCapture(e){
    const el = isOpenNewTabEl(e.target);
    if (!el) return;
    const now = Date.now();
    if (now - lastOpenAt < 400) {                 // guard: ignore rapid duplicates
      e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); return false;
    }
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    lastOpenAt = now;
    openOnlyNewTab();
    return false;
  }

  function wire(){
    neutralizeLink(); // keep doing this in case UI re-renders
  }
  wire();

  // IMPORTANT: Only listen to CLICK (not pointerdown/mousedown) to avoid duplicate opens
  document.addEventListener('click', onClickCapture, true);

  const obs = new MutationObserver(wire);
  obs.observe(document.body, { childList:true, subtree:true });
})();

/* === RA_HIDE_FIX_CANVAS_CSS — hide only the Fix canvas button; keep auto-clean === */
(function(){
  try{
    const st = document.createElement('style');
    st.id = 'raHideFixCanvasStyle';
    st.textContent = '#raFixCanvas{display:none !important; visibility:hidden !important;}';
    (document.head || document.documentElement).appendChild(st);
  }catch(e){}
})();

/* === RA_ZOOM_PAN_V1 — zoom to pointer, Space‑drag to pan, clamp zoom; keep base locked === */
(function RA_ZOOM_PAN_V1(){
  function findCanvas(){
    if (window.canvas && typeof window.canvas.toDataURL === 'function') return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas.lower-canvas') || document.querySelector('canvas');
    if (el){
      for (const key of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[key]; if (v && typeof v.toDataURL === 'function') return v;
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && typeof v.toDataURL==='function' && v.upperCanvasEl) return v;
      }
    }catch(e){}
    return null;
  }

  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function centerPoint(c){ return new fabric.Point(c.getWidth()/2, c.getHeight()/2); }
  function updateZoomUI(c){ const el = document.getElementById('zoomVal'); if (el) el.textContent = Math.round(c.getZoom()*100) + '%'; }

  function wire(){
    const c = findCanvas(); if (!c) { setTimeout(wire, 200); return; }

    // --- Mouse wheel: zoom to cursor ---
    if (!c._raWheelZoom){
      c.on('mouse:wheel', function(opt){
        const e = opt.e;
        let zoom = c.getZoom();
        zoom *= Math.pow(0.999, e.deltaY);           // smooth zoom
        zoom = clamp(zoom, 0.25, 6);
        const pt = new fabric.Point(e.offsetX, e.offsetY);
        c.zoomToPoint(pt, zoom);
        e.preventDefault(); e.stopPropagation();
        updateZoomUI(c);
      });
      c._raWheelZoom = true;
    }

    // --- Space‑drag: pan the viewport ---
    let isPanning = false, last = {x:0,y:0}, spaceDown = false;
    if (!c._raPanWired){
      document.addEventListener('keydown', (e)=>{ if (e.code==='Space'){ spaceDown = true; c.defaultCursor='grab'; }});
      document.addEventListener('keyup',   (e)=>{ if (e.code==='Space'){ spaceDown = false; c.defaultCursor='default'; }});

      c.on('mouse:down', (opt)=>{
        const e = opt.e;
        if (spaceDown || e.button===1){              // Space or middle‑mouse
          isPanning = true; last.x = e.clientX; last.y = e.clientY;
          c.setCursor('grabbing'); c.renderAll();
          e.preventDefault();
        }
      });
      c.on('mouse:move', (opt)=>{
        if (!isPanning) return;
        const e = opt.e, vt = c.viewportTransform;
        vt[4] += e.clientX - last.x;                 // translate X
        vt[5] += e.clientY - last.y;                 // translate Y
        last.x = e.clientX; last.y = e.clientY;
        c.requestRenderAll();
        e.preventDefault();
      });
      c.on('mouse:up', ()=>{
        isPanning = false;
        c.setCursor(spaceDown ? 'grab' : 'default');
      });
      c._raPanWired = true;
    }

    // --- Hook the + / – / Reset buttons to center‑zoom & recenter ---
    function id(x){ return document.getElementById(x); }
    const zOut = id('zoomOut'), zIn = id('zoomIn'), zReset = id('zoomReset');

    function setZoomAbs(newZoom, point){
      newZoom = clamp(newZoom, 0.25, 6);
      const p = point || centerPoint(c);
      c.zoomToPoint(p, newZoom);
      updateZoomUI(c);
    }

    if (zIn && !zIn._raZoom){   zIn.addEventListener('click', ()=> setZoomAbs(c.getZoom()*1.15)); zIn._raZoom = true; }
    if (zOut && !zOut._raZoom){ zOut.addEventListener('click', ()=> setZoomAbs(c.getZoom()/1.15)); zOut._raZoom = true; }
    if (zReset && !zReset._raZoom){
      zReset.addEventListener('click', ()=>{
        c.setViewportTransform([1,0,0,1,0,0]);       // recenter pan
        setZoomAbs(1);
      });
      zReset._raZoom = true;
    }
  }

  wire();
  document.addEventListener('ra:canvas-ready', wire);
  const obs = new MutationObserver(wire);
  obs.observe(document.body, { childList:true, subtree:true });
})();

/* === RA_ZOOM_PAN_V2 — pan with Space/right-drag; wheel=zoom, Shift/Alt/Space+wheel=pAN === */
(function RA_ZOOM_PAN_V2(){
  function findCanvas(){
    if (window.canvas && typeof window.canvas.toDataURL === 'function') return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas.lower-canvas') || document.querySelector('canvas');
    if (el){
      for (const key of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[key]; if (v && typeof v.toDataURL === 'function') return v;
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && typeof v.toDataURL==='function' && v.upperCanvasEl) return v;
      }
    }catch(e){}
    return null;
  }

  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function centerPoint(c){ return new fabric.Point(c.getWidth()/2, c.getHeight()/2); }
  function setZoomAbs(c, z, point){
    z = clamp(z, 0.25, 6);
    c.zoomToPoint(point || centerPoint(c), z);
    const zEl = document.getElementById('zoomVal'); if (zEl) zEl.textContent = Math.round(c.getZoom()*100)+'%';
  }

  function wire(){
    const c = findCanvas(); if (!c){ setTimeout(wire, 200); return; }
    if (c._raZoomPanV2) return;

    // Remove any previous wheel listeners to avoid double-handling
    try { if (c.__eventListeners && c.__eventListeners['mouse:wheel']) c.__eventListeners['mouse:wheel'] = []; } catch(e){}

    // --- Wheel: Zoom by default; hold Shift/Alt/Space to PAN with wheel ---
    let spaceDown = false;
    document.addEventListener('keydown', (e)=>{ if (e.code==='Space'){ spaceDown = true; c.defaultCursor='grab'; }}, false);
    document.addEventListener('keyup',   (e)=>{ if (e.code==='Space'){ spaceDown = false; c.defaultCursor='default'; }}, false);

    c.on('mouse:wheel', function(opt){
      const e = opt.e;
      const panMode = spaceDown || e.shiftKey || e.altKey;
      if (panMode){
        // Pan using wheel deltas (natural: content moves with your fingers)
        const vt = c.viewportTransform;
        vt[4] -= e.deltaX;
        vt[5] -= e.deltaY;
        c.requestRenderAll();
      }else{
        // Zoom to pointer
        let zoom = c.getZoom();
        zoom *= Math.pow(0.999, e.deltaY);
        zoom = clamp(zoom, 0.25, 6);
        const pt = new fabric.Point(e.offsetX, e.offsetY);
        c.zoomToPoint(pt, zoom);
      }
      e.preventDefault(); e.stopPropagation();
      const zEl = document.getElementById('zoomVal'); if (zEl) zEl.textContent = Math.round(c.getZoom()*100)+'%';
    });

    // --- Drag pan: Space + left drag OR right/middle drag pans the viewport ---
    let isPanning = false, last = {x:0,y:0};
    c.on('mouse:down', (opt)=>{
      const e = opt.e;
      const right = e.button === 2;
      const middle = e.button === 1 || e.buttons === 4;
      if (spaceDown || right || middle){
        isPanning = true;
        last.x = e.clientX; last.y = e.clientY;
        c.setCursor('grabbing');
        e.preventDefault();
      }
    });
    c.on('mouse:move', (opt)=>{
      if (!isPanning) return;
      const e = opt.e;
      const vt = c.viewportTransform;
      vt[4] += e.clientX - last.x;   // translate X
      vt[5] += e.clientY - last.y;   // translate Y
      last.x = e.clientX; last.y = e.clientY;
      c.requestRenderAll();
      e.preventDefault();
    });
    c.on('mouse:up', ()=>{
      isPanning = false;
      c.setCursor(spaceDown ? 'grab' : 'default');
    });

    // --- Hook + / – / Reset buttons to center-zoom and recentre pan ---
    const id = s => document.getElementById(s);
    const zIn = id('zoomIn'), zOut = id('zoomOut'), zReset = id('zoomReset');
    if (zIn && !zIn._raZ2){   zIn.addEventListener('click', ()=> setZoomAbs(c, c.getZoom()*1.15)); zIn._raZ2 = true; }
    if (zOut && !zOut._raZ2){ zOut.addEventListener('click', ()=> setZoomAbs(c, c.getZoom()/1.15)); zOut._raZ2 = true; }
    if (zReset && !zReset._raZ2){
      zReset.addEventListener('click', ()=>{
        c.setViewportTransform([1,0,0,1,0,0]);      // reset pan
        setZoomAbs(c, 1);                           // reset zoom
      });
      zReset._raZ2 = true;
    }

    c._raZoomPanV2 = true;
  }

  wire();
  document.addEventListener('ra:canvas-ready', wire);
  const obs = new MutationObserver(wire);
  obs.observe(document.body, { childList:true, subtree:true });
})();

/* === RA_ADMIN_PERM_V4 — inline permanent overlays (admin adds PNGs; users can't delete) ===
   - Shows a small "Permanent Overlays" row ABOVE the normal Overlays grid.
   - Admin (URL has ?admin=1): "Add Permanent PNGs" + small × on tiles to remove (session only).
   - Users: see the tiles but NO × (can't remove). Tiles are click-to-add to canvas.
   - Nothing auto-adds to canvas; click a tile to add (centered, top layer).
*/
(function RA_ADMIN_PERM_V4(){
  const isAdmin = /(\?|&)admin=1\b/.test(location.search);
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // Keep this session's permanent tiles (blob URLs + names)
  window.raPermOverlays = window.raPermOverlays || [];

  function findOverlaysCard(){
    const h3 = $$('h3').find(h => (h.textContent||'').trim().toLowerCase()==='overlays');
    return h3 ? h3.parentNode : null;
  }

  function ensureInlineRow(){
    const card = findOverlaysCard(); if (!card) return null;
    // Create the inline row once; always place it just above the main grid
    let row = $('#raPermInlineRow');
    if (!row){
      row = document.createElement('div');
      row.id = 'raPermInlineRow';
      row.style.margin = '8px 0';
      row.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="font-weight:600;opacity:.8">Permanent Overlays</div>
          ${isAdmin ? `
            <label class="btn small" style="margin-left:auto;">
              Add Permanent PNGs
              <input id="raPermInlineInput" type="file" accept="image/png" multiple style="display:none">
            </label>
          ` : ''}
        </div>
        <div id="raPermInlineGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px;max-height:220px;overflow:auto;"></div>
      `;
      // Insert above the first grid‑looking element in the card; fallback to append
      const firstGrid = Array.from(card.querySelectorAll('div')).find(d=>{
        const cs = getComputedStyle(d);
        return (cs.display.includes('grid') || cs.display.includes('flex')) &&
               d.querySelector('img');
      });
      if (firstGrid) card.insertBefore(row, firstGrid); else card.appendChild(row);

      if (isAdmin){
        $('#raPermInlineInput').addEventListener('change', onFilesChosen);
      }
    }
    return row;
  }

  function niceName(file){
    return file.name.replace(/\.png$/i,'').replace(/[_-]+/g,' ').trim();
  }

  function onFilesChosen(e){
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach(f=>{
      const url = URL.createObjectURL(f);
      window.raPermOverlays.push({ name: niceName(f), url, _blobURL:url });
    });
    e.target.value = ''; // allow picking same files again next time
    renderInlineGrid();
  }

  function addOverlayToCanvas(url, name){
    // Prefer your app hook if present
    if (typeof window.addOverlayToCanvas === 'function'){
      try { window.addOverlayToCanvas(url, name); return; } catch(e){}
    }
    // Fallback: Fabric
    const c = window.canvas;
    if (!c || !window.fabric || !fabric.Image) return;
    fabric.Image.fromURL(url, img=>{
      img.set({
        originX:'center', originY:'center',
        left: c.getWidth()/2, top: c.getHeight()/2,
        crossOrigin:'anonymous'
      });
      try { c.add(img); c.bringToFront(img); c.setActiveObject(img); } catch(e){}
      c.requestRenderAll();
      if (typeof window.refreshWatermarkGate === 'function') window.refreshWatermarkGate();
    }, { crossOrigin:'anonymous' });
  }

  function renderInlineGrid(){
    const row = ensureInlineRow(); if (!row) return;
    const grid = $('#raPermInlineGrid'); if (!grid) return;
    grid.innerHTML = '';
    window.raPermOverlays.forEach((it, idx)=>{
      const tile = document.createElement('div');
      tile.className = 'thumb ra-perm-thumb';
      tile.style.cssText = 'position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;cursor:pointer;text-align:center;';
      tile.innerHTML = `
        <div style="height:80px;display:flex;align-items:center;justify-content:center;">
          <img src="${it.url}" alt="${it.name||''}" style="max-width:100%;max-height:80px;"/>
        </div>
        <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name||''}</div>
        ${isAdmin ? '<button class="perm-del" title="Remove" style="position:absolute;top:3px;right:5px;background:transparent;border:none;color:#ddd;font-size:16px;line-height:1;cursor:pointer;">×</button>' : ''}
      `;
      tile.addEventListener('click', (ev)=>{
        if (ev.target && ev.target.classList && ev.target.classList.contains('perm-del')) return;
        addOverlayToCanvas(it.url, it.name);
      });
      if (isAdmin){
        const del = tile.querySelector('.perm-del');
        if (del) del.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          const item = window.raPermOverlays[idx];
          try { if (item && item._blobURL) URL.revokeObjectURL(item._blobURL); } catch(e){}
          window.raPermOverlays.splice(idx,1);
          renderInlineGrid();
        });
      }
      grid.appendChild(tile);
    });
  }

  function boot(){
    ensureInlineRow();
    renderInlineGrid();
  }
  boot();

  const obs = new MutationObserver(()=> boot());
  obs.observe(document.body, { childList:true, subtree:true });
})();

/* === RA_BG_SEND_BACK_V1 — send huge dark rectangles behind everything on size change === */
(function RA_BG_SEND_BACK_V1(){
  function findCanvas(){
    if (window.canvas && window.canvas.upperCanvasEl) return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas');
    if (el){
      const cand = [ 'fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas' ]
        .map(k=>el[k]).find(v => v && v.upperCanvasEl);
      if (cand) return cand;
    }
    return null;
  }
  function parseRGBA(v){
    if (!v) return null;
    const s=(''+v).trim().toLowerCase();
    if (s==='black') return [0,0,0,1];
    if (s.startsWith('#')){
      const h=s.slice(1); const x=(h.length===3)?h.split('').map(c=>c+c).join(''):h;
      const r=parseInt(x.slice(0,2),16), g=parseInt(x.slice(2,4),16), b=parseInt(x.slice(4,6),16);
      return [r,g,b,1];
    }
    const m=s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (m) return [ +m[1], +m[2], +m[3], m[4]==null?1:+m[4] ];
    return null;
  }
  function isDark(fill){
    const c=parseRGBA(fill); if (!c) return false;
    const [r,g,b,a]=c; if (a<0.6) return false;
    const lum=(0.299*r+0.587*g+0.114*b)/255;
    return lum<0.25; // dark greys included
  }
  function sendDarkRectsToBack(){
    const c=findCanvas(); if (!c) return;
    const cw=c.getWidth(), ch=c.getHeight();
    let changed=false;
    c.getObjects('rect').forEach(o=>{
      const w=(o.getScaledWidth?o.getScaledWidth():o.width*(o.scaleX||1));
      const h=(o.getScaledHeight?o.getScaledHeight():o.height*(o.scaleY||1));
      const huge = (w>=cw*0.8 || h>=ch*0.8);
      if (huge && isDark(o.fill) && !o._isBase){
        o._isBgRect = true;
        o.selectable=false; o.evented=false; o.hasControls=false;
        o.lockMovementX = o.lockMovementY = true;
        try { c.sendToBack(o); changed=true; } catch(e){}
      }
    });
    if (changed) c.requestRenderAll();
  }

  // Run on object add (some builders add a new rect on resize)
  (function hook(){
    const c=findCanvas();
    if (c && !c._raBgOrderHooked){
      c.on('object:added', ()=> setTimeout(sendDarkRectsToBack, 0));
      c._raBgOrderHooked = true;
    } else if (!c){
      setTimeout(hook, 300);
    }
  })();

  // Nudge after clicks on common size buttons (700/900/1024/1200)
  function wireSizeButtons(){
    const btns = Array.from(document.querySelectorAll('button'));
    btns.forEach(b=>{
      const t=(b.textContent||'').trim();
      if (/^(700|900|1024|1200)$/i.test(t) && !b._raSizeWired){
        b._raSizeWired=true;
        b.addEventListener('click', ()=> setTimeout(sendDarkRectsToBack, 120));
      }
    });
  }
  wireSizeButtons();
  const mo=new MutationObserver(()=> wireSizeButtons());
  mo.observe(document.body, { childList:true, subtree:true });

  // Also run periodically as a safety net
  setInterval(sendDarkRectsToBack, 800);
})();

/* === RA_BG_NORMALIZE_V2 — replace huge dark rects with backgroundColor (no more flicker) === */
(function RA_BG_NORMALIZE_V2(){
  function findCanvas(){
    if (window.canvas && window.canvas.upperCanvasEl) return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas');
    if (el){
      for (const k of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[k]; if (v && v.upperCanvasEl) return v;
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && v.upperCanvasEl && typeof v.add==='function' && typeof v.loadFromJSON==='function') return v;
      }
    }catch(e){}
    return null;
  }
  function parseRGBA(v){
    if (!v) return null;
    const s=(''+v).trim().toLowerCase();
    if (s==='black') return [0,0,0,1];
    if (s.startsWith('#')){
      const h=s.slice(1); const x=(h.length===3)?h.split('').map(c=>c+c).join(''):h;
      const r=parseInt(x.slice(0,2),16), g=parseInt(x.slice(2,4),16), b=parseInt(x.slice(4,6),16);
      return [r,g,b,1];
    }
    const m=s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (m) return [ +m[1], +m[2], +m[3], m[4]==null?1:+m[4] ];
    return null;
  }
  function isDarkFill(fill){
    const c=parseRGBA(fill); if (!c) return false;
    const [r,g,b,a]=c; if (a<0.55) return false;
    const lum=(0.299*r+0.587*g+0.114*b)/255;
    return lum<0.25; // allow very dark greys too
  }
  function isHugeRect(o,c){
    if (!o || o.type!=='rect') return false;
    const w=(o.getScaledWidth?o.getScaledWidth():o.width*(o.scaleX||1));
    const h=(o.getScaledHeight?o.getScaledHeight():o.height*(o.scaleY||1));
    return (w>=c.getWidth()*0.8 || h>=c.getHeight()*0.8);
  }
  function normalize(){
    const c=findCanvas(); if (!c) return;
    let bg=null, removed=false;
    const objs=c.getObjects('rect');
    for (let i=objs.length-1;i>=0;i--){
      const o=objs[i];
      if (isHugeRect(o,c) && isDarkFill(o.fill) && !o._isBase){
        bg = o.fill || bg;
        try{ c.remove(o); removed=true; }catch(e){}
      }
    }
    if (bg || removed){
      try{ c.setBackgroundColor(bg||c.backgroundColor||'#000', ()=>c.requestRenderAll()); }
      catch(e){ c.backgroundColor = bg||c.backgroundColor||'#000'; c.requestRenderAll(); }
    }
  }
  // Normalize whenever objects are added/modified or sizes change
  (function hook(){
    const c=findCanvas();
    if (c && !c._raBgNorm2){
      c.on('object:added', ()=> setTimeout(normalize,0));
      c.on('object:modified', ()=> setTimeout(normalize,0));
      c._raBgNorm2=true;
    } else if (!c){ setTimeout(hook,300); }
  })();
  // Nudge after clicking common size buttons
  function wireSizeButtons(){
    Array.from(document.querySelectorAll('button')).forEach(b=>{
      const t=(b.textContent||'').trim();
      if (/^(700|900|1024|1200)$/i.test(t) && !b._raBgBtn){
        b._raBgBtn=true; b.addEventListener('click', ()=> setTimeout(normalize,120));
      }
    });
  }
  wireSizeButtons();
  new MutationObserver(wireSizeButtons).observe(document.body,{childList:true,subtree:true});
  // Safety sweep
  setInterval(normalize, 1000);
})();

/* === RA_PERM_MIX_ADD_V5 — mix permanents into main grid; robust click-to-add; admin-only delete === */
(function RA_PERM_MIX_ADD_V5(){
  const isAdmin = /(\?|&)admin=1\b/.test(location.search);

  function findCanvas(){
    if (window.canvas && window.canvas.upperCanvasEl) return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas');
    if (el){
      for (const k of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[k]; if (v && v.upperCanvasEl) return v;
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && v.upperCanvasEl && typeof v.add==='function' && typeof v.loadFromJSON==='function') return v;
      }
    }catch(e){}
    return null;
  }
  function withCanvas(fn, tries=0){
    const c=findCanvas(); if (c) return fn(c);
    if (tries>25) return; setTimeout(()=>withCanvas(fn,tries+1),200);
  }
  function robustAdd(url, name){
    withCanvas(c=>{
      const before=c.getObjects().length;
      const isBlob = /^blob:/i.test(url);
      let usedHook=false;
      // Use your app hook for non-blob URLs; many hooks ignore blob: URLs
      if (!isBlob && typeof window.addOverlayToCanvas==='function'){
        try{ window.addOverlayToCanvas(url,name); usedHook=true; }catch(e){}
      }
      // If nothing appeared, fallback to Fabric
      setTimeout(()=>{
        const after=c.getObjects().length;
        if (after>before) { c.requestRenderAll(); return; }
        if (!window.fabric || !fabric.Image) return;
        const opts = isBlob ? {} : { crossOrigin:'anonymous' };
        fabric.Image.fromURL(url, img=>{
          img.set({
            originX:'center', originY:'center',
            left:c.getWidth()/2, top:c.getHeight()/2
          });
          try{ c.add(img); c.bringToFront(img); c.setActiveObject(img);}catch(e){}
          c.requestRenderAll();
          if (typeof window.refreshWatermarkGate==='function') window.refreshWatermarkGate();
        }, opts);
      }, usedHook?200:0);
    });
  }

  // Find the main overlays grid (heuristic)
  function findOverlaysCard(){
    return Array.from(document.querySelectorAll('h3'))
      .find(h => (h.textContent||'').trim().toLowerCase()==='overlays')?.parentNode || null;
  }
  function findMainOverlayGrid(){
    const card = findOverlaysCard(); if (!card) return null;
    const candidates = Array.from(card.querySelectorAll('div'));
    let best=null,bestScore=-1;
    candidates.forEach(div=>{
      const imgs=div.querySelectorAll('img').length;
      const tiles=[...div.children].filter(ch => ch.querySelector && ch.querySelector('img')).length;
      const score=imgs + tiles*2;
      if (score>bestScore && (imgs+tiles)>=3){ best=div; bestScore=score; }
    });
    return best;
  }

  // Render our permanents into the main grid (at the very top)
  function renderPermsIntoMain(){
    const grid=findMainOverlayGrid(); if (!grid) return;
    // Hide any inline shelf grid if present (from older patch), keep the "Add Permanent PNGs" button
    const inline = document.getElementById('raPermInlineGrid'); if (inline) inline.style.display='none';

    // Remove previous clones
    grid.querySelectorAll('.ra-perm-clone').forEach(n=>n.remove());

    const arr = window.raPermOverlays || [];
    arr.forEach((it, idx)=>{
      const tile=document.createElement('div');
      tile.className='ra-perm-clone';
      tile.style.cssText='position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;cursor:pointer;text-align:center;';
      tile.dataset.idx = String(idx);
      tile.innerHTML=`
        <div style="height:80px;display:flex;align-items:center;justify-content:center;">
          <img src="${it.url}" alt="${it.name||''}" style="max-width:100%;max-height:80px;"/>
        </div>
        <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name||''}</div>
        ${isAdmin ? '<button class="perm-del" title="Remove" style="position:absolute;top:3px;right:5px;background:transparent;border:none;color:#ddd;font-size:16px;line-height:1;cursor:pointer;">×</button>' : ''}
      `;
      // Insert at top
      grid.insertBefore(tile, grid.firstChild);
    });
    if (!isAdmin){
      grid.querySelectorAll('.ra-perm-clone .perm-del').forEach(b=> b.remove());
    }
  }

  // Capture clicks on our permanent tiles (one reliable handler)
  function onClickCapture(e){
    const del = e.target && e.target.closest && e.target.closest('.perm-del');
    const tile = e.target && e.target.closest && e.target.closest('.ra-perm-clone');
    if (!tile) return;
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    if (del && isAdmin){
      const idx = parseInt(tile.dataset.idx||'-1',10);
      const arr = window.raPermOverlays || [];
      if (idx>=0 && arr[idx]){
        try{ if (arr[idx]._blobURL) URL.revokeObjectURL(arr[idx]._blobURL); }catch(e){}
        arr.splice(idx,1);
      }
      tile.remove();
      return false;
    }
    const img = tile.querySelector('img');
    const url = img?.currentSrc || img?.src;
    const name = (img?.alt||'').trim();
    if (url) robustAdd(url,name);
    return false;
  }

  // Re-render when files are chosen via the admin input
  function wireAdminInput(){
    const inp = document.getElementById('raPermInlineInput');
    if (inp && !inp._raMixWired){
      inp._raMixWired=true;
      inp.addEventListener('change', ()=> setTimeout(renderPermsIntoMain, 0));
    }
  }

  function tick(){
    renderPermsIntoMain();
    wireAdminInput();
  }
  tick();
  document.addEventListener('click', onClickCapture, true);
  new MutationObserver(tick).observe(document.body,{childList:true,subtree:true});
  setInterval(renderPermsIntoMain, 1000); // keep fresh if UI re-renders
})();

/* === RA_BG_INTERCEPT_V3 — convert huge dark rects into canvas background (before render) === */
(function RA_BG_INTERCEPT_V3(){
  function parseRGBA(v){
    if (!v) return null;
    const s=(''+v).trim().toLowerCase();
    if (s==='black') return [0,0,0,1];
    if (s.startsWith('#')){
      const h=s.slice(1), x=(h.length===3)?h.split('').map(c=>c+c).join(''):h;
      const r=parseInt(x.slice(0,2),16), g=parseInt(x.slice(2,4),16), b=parseInt(x.slice(4,6),16);
      return [r,g,b,1];
    }
    const m=s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (m) return [ +m[1], +m[2], +m[3], m[4]==null?1:+m[4] ];
    return null;
  }
  function isDark(fill){
    const c=parseRGBA(fill); if (!c) return false;
    const [r,g,b,a]=c; if (a<0.55) return false;
    const lum=(0.299*r+0.587*g+0.114*b)/255;
    return lum<0.25; // include very dark greys
  }
  function hook(){
    if (!window.fabric || !fabric.Canvas || !fabric.Canvas.prototype.add){ setTimeout(hook,200); return; }
    if (fabric.Canvas.prototype._raBgInterceptV3) return;
    const origAdd = fabric.Canvas.prototype.add;
    fabric.Canvas.prototype.add = function(...args){
      const obj = args[0];
      try{
        if (obj && obj.type==='rect') {
          const c = this;
          const w = (obj.getScaledWidth? obj.getScaledWidth(): (obj.width||0)*(obj.scaleX||1));
          const h = (obj.getScaledHeight? obj.getScaledHeight(): (obj.height||0)*(obj.scaleY||1));
          const cw = c.getWidth(), ch = c.getHeight();
          const huge = (w>=cw*0.8 || h>=ch*0.8);
          if (huge && isDark(obj.fill)){
            const fill = obj.fill;
            try { c.setBackgroundColor(fill, ()=> c.requestRenderAll()); }
            catch(e){ c.backgroundColor = fill; c.requestRenderAll(); }
            return obj; // do NOT add the rect → no flicker
          }
        }
      }catch(e){}
      return origAdd.apply(this, args);
    };
    fabric.Canvas.prototype._raBgInterceptV3 = true;
  }
  hook();
})();

/* === RA_PERM_MIX_ADD_V6 — admin Add PNGs actually populates tiles; click reliably adds === */
(function RA_PERM_MIX_ADD_V6(){
  const isAdmin = /(\?|&)admin=1\b/.test(location.search);

  // Session list of permanent items
  window.raPermOverlays = window.raPermOverlays || [];

  function findOverlaysCard(){
    const h3 = Array.from(document.querySelectorAll('h3'))
      .find(h => (h.textContent||'').trim().toLowerCase()==='overlays');
    return h3 ? h3.parentNode : null;
  }
  function findMainOverlayGrid(){
    const card = findOverlaysCard(); if (!card) return null;
    const divs = Array.from(card.querySelectorAll('div'));
    let best=null, bestScore=-1;
    divs.forEach(d=>{
      const imgs=d.querySelectorAll('img').length;
      const tiles=[...d.children].filter(ch => ch.querySelector && ch.querySelector('img')).length;
      const score=imgs + tiles*2;
      if (score>bestScore && (imgs+tiles)>=3){ best=d; bestScore=score; }
    });
    return best;
  }

  // Ensure we have the small admin bar with the input
  function ensureAdminBar(){
    if (!isAdmin) return;
    if (document.getElementById('raPermInlineInput')) return;
    const card = findOverlaysCard(); const grid = findMainOverlayGrid();
    if (!card || !grid) return;
    const bar = document.createElement('div');
    bar.className = 'row tight';
    bar.style.margin = '6px 0';
    bar.innerHTML = `
      <label class="btn small">
        Add Permanent PNGs
        <input id="raPermInlineInput" type="file" accept="image/png" multiple style="display:none">
      </label>
    `;
    card.insertBefore(bar, grid);
    document.getElementById('raPermInlineInput').addEventListener('change', onFilesChosen);
  }

  // Convert file list into shelf items
  function niceName(file){ return file.name.replace(/\.png$/i,'').replace(/[_-]+/g,' ').trim(); }
  function onFilesChosen(e){
    const files = Array.from(e.target.files||[]);
    if (!files.length) return;
    files.forEach(f=>{
      const url = URL.createObjectURL(f);
      window.raPermOverlays.push({ name:niceName(f), url, _blobURL:url });
    });
    e.target.value = ''; // allow re-choosing same files later
    renderPermsIntoMain();
  }

  // Robust add: try app hook first (for remote URLs), Fabric fallback (for blob: too)
  function withCanvas(fn, tries=0){
    const c = window.canvas; if (c && c.upperCanvasEl) return fn(c);
    if (tries>25) return; setTimeout(()=>withCanvas(fn, tries+1), 200);
  }
  function robustAdd(url, name){
    withCanvas(c=>{
      const before=c.getObjects().length;
      const isBlob = /^blob:/i.test(url);
      let usedHook=false;
      if (!isBlob && typeof window.addOverlayToCanvas==='function'){
        try{ window.addOverlayToCanvas(url,name); usedHook=true; }catch(e){}
      }
      setTimeout(()=>{
        const after=c.getObjects().length;
        if (after>before){ c.requestRenderAll(); return; }
        if (!window.fabric || !fabric.Image) return;
        const opts = isBlob ? {} : { crossOrigin:'anonymous' };
        fabric.Image.fromURL(url, img=>{
          img.set({ originX:'center', originY:'center', left:c.getWidth()/2, top:c.getHeight()/2 });
          try{ c.add(img); c.bringToFront(img); c.setActiveObject(img);}catch(e){}
          c.requestRenderAll();
          if (typeof window.refreshWatermarkGate==='function') window.refreshWatermarkGate();
        }, opts);
      }, usedHook?200:0);
    });
  }

  // Render permanent tiles at the very top of the main overlays grid
  function renderPermsIntoMain(){
    const grid = findMainOverlayGrid(); if (!grid) return;
    // Remove previous clones
    grid.querySelectorAll('.ra-perm-clone').forEach(n=>n.remove());
    (window.raPermOverlays||[]).forEach((it, idx)=>{
      const tile = document.createElement('div');
      tile.className='ra-perm-clone';
      tile.style.cssText='position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;cursor:pointer;text-align:center;';
      tile.dataset.idx = String(idx);
      tile.innerHTML = `
        <div style="height:80px;display:flex;align-items:center;justify-content:center;">
          <img src="${it.url}" alt="${it.name||''}" style="max-width:100%;max-height:80px;"/>
        </div>
        <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name||''}</div>
        ${isAdmin ? '<button class="perm-del" title="Remove" style="position:absolute;top:3px;right:5px;background:transparent;border:none;color:#ddd;font-size:16px;line-height:1;cursor:pointer;">×</button>' : ''}
      `;
      grid.insertBefore(tile, grid.firstChild);
    });
    if (!isAdmin){
      grid.querySelectorAll('.ra-perm-clone .perm-del').forEach(b=> b.remove());
    }
  }

  // One capture handler to add or delete
  function onClickCapture(e){
    const tile = e.target && e.target.closest && e.target.closest('.ra-perm-clone');
    if (!tile) return;
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    const del = e.target && e.target.closest('.perm-del');
    const idx = parseInt(tile.dataset.idx||'-1',10);
    if (del && isAdmin){
      const arr = window.raPermOverlays||[];
      if (idx>=0 && arr[idx]){
        try{ if (arr[idx]._blobURL) URL.revokeObjectURL(arr[idx]._blobURL); }catch(e){}
        arr.splice(idx,1);
      }
      tile.remove();
      return false;
    }
    const img = tile.querySelector('img');
    const url = img?.currentSrc || img?.src;
    const name = (img?.alt||'').trim();
    if (url) robustAdd(url,name);
    return false;
  }

  function tick(){
    ensureAdminBar();
    renderPermsIntoMain();
  }
  tick();
  document.addEventListener('click', onClickCapture, true);
  new MutationObserver(tick).observe(document.body,{childList:true,subtree:true});
  // Safety: re-render if UI reflows
  setInterval(renderPermsIntoMain, 1000);
})();

/* === RA_BG_NOFLASH_V4 — stop dark background rects before they render (no flicker) === */
(function RA_BG_NOFLASH_V4(){
  function parseRGBA(v){
    if (!v) return null;
    const s=(''+v).trim().toLowerCase();
    if (s==='black') return [0,0,0,1];
    if (s.startsWith('#')){
      const h=s.slice(1), x=(h.length===3)?h.split('').map(c=>c+c).join(''):h;
      const r=parseInt(x.slice(0,2),16), g=parseInt(x.slice(2,4),16), b=parseInt(x.slice(4,6),16);
      return [r,g,b,1];
    }
    const m=s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (m) return [ +m[1], +m[2], +m[3], m[4]==null?1:+m[4] ];
    return null;
  }
  function isDark(fill){
    const c=parseRGBA(fill); if (!c) return false;
    const [r,g,b,a]=c; if (a<0.55) return false;
    const lum=(0.299*r+0.587*g+0.114*b)/255;
    return lum<0.25; // include very dark greys
  }
  function findCanvas(){
    if (window.canvas && window.canvas.upperCanvasEl) return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas');
    if (el){
      for (const k of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[k]; if (v && v.upperCanvasEl) return v;
      }
    }
    return null;
  }
  function install(c){
    if (c._raNoFlashV4) return;
    c._raNoFlashV4 = true;
    let toRemove = [];
    // Hide candidate rects BEFORE render so they never flash
    c.on('before:render', ()=>{
      toRemove.length = 0;
      const cw=c.getWidth(), ch=c.getHeight();
      (c.getObjects()||[]).forEach(o=>{
        if (!o || o.type!=='rect' || o._isBase) return;
        const w=(o.getScaledWidth?o.getScaledWidth():o.width*(o.scaleX||1));
        const h=(o.getScaledHeight?o.getScaledHeight():o.height*(o.scaleY||1));
        const huge = (w>=cw*0.8 || h>=ch*0.8);
        if (huge && isDark(o.fill)){
          try { c.backgroundColor = o.fill || c.backgroundColor || '#000'; } catch(e){}
          o.visible = false;
          toRemove.push(o);
        }
      });
    });
    // Remove them right after render, then re-render once (quickly)
    c.on('after:render', ()=>{
      if (!toRemove.length) return;
      toRemove.forEach(o=>{ try{ c.remove(o);}catch(e){} });
      toRemove.length = 0;
      c.requestRenderAll();
    });
    // If something adds after size change, force a pass
    c.on('object:added', ()=> setTimeout(()=>c.requestRenderAll(),0));
  }
  (function hook(){
    const c = findCanvas();
    if (c) install(c); else setTimeout(hook, 300);
  })();
})();

/* === RA_PERM_INLINE_V7 — admin Add PNGs shows tiles & reliably adds to canvas (fallback shelf) === */
(function RA_PERM_INLINE_V7(){
  const isAdmin = /(\?|&)admin=1\b/.test(location.search);
  window.raPermOverlays = window.raPermOverlays || []; // session list

  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function findOverlaysCard(){
    const h3 = $$('h3').find(h => (h.textContent||'').trim().toLowerCase()==='overlays');
    return h3 ? h3.parentNode : null;
  }
  function findMainGrid(){
    const card = findOverlaysCard(); if (!card) return null;
    const divs = Array.from(card.querySelectorAll('div'));
    let best=null, score=-1;
    divs.forEach(d=>{
      const imgs = d.querySelectorAll('img').length;
      const tiles = [...d.children].filter(ch => ch.querySelector && ch.querySelector('img')).length;
      const s = imgs + tiles*2;
      if (s>score && (imgs+tiles)>=3){ best=d; score=s; }
    });
    return best;
  }

  // Admin input row (always try to place above the main grid)
  function ensureAdminRow(){
    if (!isAdmin) return;
    if ($('#raPermV7Bar')) return;
    const card = findOverlaysCard(); const grid = findMainGrid();
    if (!card) return;
    const bar = document.createElement('div');
    bar.id = 'raPermV7Bar';
    bar.className = 'row tight';
    bar.style.margin = '6px 0';
    bar.innerHTML = `
      <label class="btn small">
        Add Permanent PNGs
        <input id="raPermV7Input" type="file" accept="image/png" multiple style="display:none">
      </label>
    `;
    if (grid) card.insertBefore(bar, grid); else card.appendChild(bar);
    $('#raPermV7Input').addEventListener('change', onFilesChosen);
  }

  // Fallback shelf (if we can't detect the main grid)
  function ensureShelf(){
    if ($('#raPermV7Shelf')) return;
    const card = findOverlaysCard(); if (!card) return;
    const shelf = document.createElement('div');
    shelf.id = 'raPermV7Shelf';
    shelf.style.cssText = 'margin:6px 0;';
    shelf.innerHTML = `
      <div style="font-weight:600;opacity:.8">Permanent Overlays</div>
      <div id="raPermV7ShelfGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px;max-height:220px;overflow:auto;"></div>
    `;
    card.appendChild(shelf);
  }

  function niceName(f){ return f.name.replace(/\.png$/i,'').replace(/[_-]+/g,' ').trim(); }

  function onFilesChosen(e){
    const files = Array.from(e.target.files||[]);
    if (!files.length) return;
    files.forEach(f=>{
      const url = URL.createObjectURL(f);
      window.raPermOverlays.push({ name:niceName(f), url, _blobURL:url });
    });
    e.target.value = ''; // allow same files next time
    renderTiles();
  }

  // Robust add to canvas (app hook first for remote, Fabric fallback incl. blob:)
  function withCanvas(fn, tries=0){
    const c = window.canvas; if (c && c.upperCanvasEl) return fn(c);
    if (tries>25) return; setTimeout(()=>withCanvas(fn, tries+1), 200);
  }
  function robustAdd(url, name){
    withCanvas(c=>{
      const before = c.getObjects().length;
      const isBlob = /^blob:/i.test(url);
      let usedHook = false;

      if (!isBlob && typeof window.addOverlayToCanvas==='function'){
        try { window.addOverlayToCanvas(url, name); usedHook = true; } catch(e){}
      }
      setTimeout(()=>{
        const after = c.getObjects().length;
        if (after > before){ c.requestRenderAll(); return; }
        if (!window.fabric || !fabric.Image) return;
        const opts = isBlob ? {} : { crossOrigin:'anonymous' };
        fabric.Image.fromURL(url, img=>{
          img.set({ originX:'center', originY:'center', left:c.getWidth()/2, top:c.getHeight()/2 });
          try { c.add(img); c.bringToFront(img); c.setActiveObject(img); } catch(e){}
          c.requestRenderAll();
          if (typeof window.refreshWatermarkGate==='function') window.refreshWatermarkGate();
        }, opts);
      }, usedHook ? 200 : 0);
    });
  }

  // Render: prefer main grid; otherwise fallback shelf
  function renderTiles(){
    const grid = findMainGrid();
    const arr = window.raPermOverlays || [];

    if (grid){
      // Clear previous clones in main grid
      grid.querySelectorAll('.ra-perm-v7').forEach(n=>n.remove());
      arr.forEach((it, idx)=>{
        const tile = document.createElement('div');
        tile.className = 'ra-perm-v7';
        tile.style.cssText = 'position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;cursor:pointer;text-align:center;';
        tile.dataset.idx = String(idx);
        tile.innerHTML = `
          <div style="height:80px;display:flex;align-items:center;justify-content:center;">
            <img src="${it.url}" alt="${it.name||''}" style="max-width:100%;max-height:80px;"/>
          </div>
          <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name||''}</div>
          ${isAdmin ? '<button class="perm-del" title="Remove" style="position:absolute;top:3px;right:5px;background:transparent;border:none;color:#ddd;font-size:16px;line-height:1;cursor:pointer;">×</button>' : ''}
        `;
        grid.insertBefore(tile, grid.firstChild);
      });
      if (!isAdmin){ grid.querySelectorAll('.ra-perm-v7 .perm-del').forEach(b=> b.remove()); }
      // Hide shelf if we rendered in the main grid
      const shelf = $('#raPermV7Shelf'); if (shelf) shelf.style.display='none';
    } else {
      // Render in fallback shelf
      ensureShelf();
      const sgrid = $('#raPermV7ShelfGrid'); if (!sgrid) return;
      sgrid.innerHTML = '';
      arr.forEach((it, idx)=>{
        const tile = document.createElement('div');
        tile.className = 'ra-perm-v7';
        tile.style.cssText = 'position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;cursor:pointer;text-align:center;';
        tile.dataset.idx = String(idx);
        tile.innerHTML = `
          <div style="height:80px;display:flex;align-items:center;justify-content:center;">
            <img src="${it.url}" alt="${it.name||''}" style="max-width:100%;max-height:80px;"/>
          </div>
          <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name||''}</div>
          ${isAdmin ? '<button class="perm-del" title="Remove" style="position:absolute;top:3px;right:5px;background:transparent;border:none;color:#ddd;font-size:16px;line-height:1;cursor:pointer;">×</button>' : ''}
        `;
        sgrid.appendChild(tile);
      });
    }
  }

  // One capture handler for add/remove on our tiles
  function onClickCapture(e){
    const tile = e.target && e.target.closest && e.target.closest('.ra-perm-v7');
    if (!tile) return;
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    const del = e.target && e.target.closest('.perm-del');
    const idx = parseInt(tile.dataset.idx||'-1',10);
    if (del && isAdmin){
      const arr = window.raPermOverlays||[];
      if (idx>=0 && arr[idx]){
        try{ if (arr[idx]._blobURL) URL.revokeObjectURL(arr[idx]._blobURL); }catch(e){}
        arr.splice(idx,1);
      }
      tile.remove();
      return false;
    }
    const img = tile.querySelector('img');
    const url = img?.currentSrc || img?.src;
    const name = (img?.alt||'').trim();
    if (url) robustAdd(url, name);
    return false;
  }

  function boot(){
    ensureAdminRow();
    renderTiles();
  }
  boot();
  document.addEventListener('click', onClickCapture, true);
  const mo = new MutationObserver(boot);
  mo.observe(document.body, { childList:true, subtree:true });
})();

/* === RA_ADMIN_PERM_SAFE_V1 — admin-only permanent PNG shelf (no global handlers) ===
   - Visible only with ?admin=1
   - Adds one "Add Permanent PNGs" button above a small shelf inside the Overlays card
   - Each click creates a fresh <input type=file> so the picker always opens
   - Picked PNGs appear as tiles; click tile => add to canvas (centered, top)
   - Admin sees × to remove tiles (session-only); users don't see the shelf
*/
(function RA_ADMIN_PERM_SAFE_V1(){
  const isAdmin = /(\?|&)admin=1\b/.test(location.search);

  // Session list (local to this browser session)
  window.raPermOverlays = window.raPermOverlays || [];

  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function findOverlaysCard(){
    const h3 = $$('h3').find(h => (h.textContent||'').trim().toLowerCase()==='overlays');
    return h3 ? h3.parentNode : null;
  }

  function ensureAdminBarAndShelf(){
    if (!isAdmin) return;
    const card = findOverlaysCard(); if (!card) return;

    // Bar (one time)
    if (!$('#raPermSafeBar')){
      const bar = document.createElement('div');
      bar.id = 'raPermSafeBar';
      bar.className = 'row tight';
      bar.style.margin = '8px 0 6px 0';
      bar.innerHTML = `<button id="raPermSafeBtn" class="btn small">Add Permanent PNGs</button>`;
      // Put bar at top of Overlays card
      card.insertBefore(bar, card.firstChild);

      // Fresh file input on every click so picker always opens
      $('#raPermSafeBtn').addEventListener('click', ()=>{
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/png';
        inp.multiple = true;
        inp.style.display = 'none';
        inp.addEventListener('change', (e)=>{
          const files = Array.from(e.target.files||[]);
          if (files.length){
            files.forEach(f=>{
              const url  = URL.createObjectURL(f);
              const name = f.name.replace(/\.png$/i,'').replace(/[_-]+/g,' ').trim();
              window.raPermOverlays.push({ name, url, _blobURL:url });
            });
            renderShelf();        // show tiles
          }
          inp.remove();           // dispose so next click creates a new one
        }, { once:true });
        document.body.appendChild(inp);
        inp.click();
      });
    }

    // Shelf (one time)
    if (!$('#raPermSafeShelf')){
      const shelf = document.createElement('div');
      shelf.id = 'raPermSafeShelf';
      shelf.style.cssText = 'margin:6px 0;';
      shelf.innerHTML = `
        <div style="font-weight:600;opacity:.8">Permanent Overlays</div>
        <div id="raPermSafeGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px;max-height:220px;overflow:auto;"></div>
      `;
      // Place shelf just after the bar
      const bar = $('#raPermSafeBar');
      if (bar && bar.nextSibling) card.insertBefore(shelf, bar.nextSibling);
      else card.appendChild(shelf);
    }
  }

  function renderShelf(){
    const grid = $('#raPermSafeGrid'); if (!grid) return;
    grid.innerHTML = '';
    (window.raPermOverlays||[]).forEach((it, idx)=>{
      const tile = document.createElement('div');
      tile.className = 'ra-perm-safe-tile';
      tile.style.cssText = 'position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;cursor:pointer;text-align:center;';
      tile.innerHTML = `
        <div style="height:80px;display:flex;align-items:center;justify-content:center;">
          <img src="${it.url}" alt="${it.name||''}" style="max-width:100%;max-height:80px;"/>
        </div>
        <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name||''}</div>
        <button class="perm-del" title="Remove" style="position:absolute;top:3px;right:5px;background:transparent;border:none;color:#ddd;font-size:16px;line-height:1;cursor:pointer;${isAdmin?'':'display:none;'}">×</button>
      `;

      // Click = add to canvas
      tile.addEventListener('click', (ev)=>{
        if (ev.target && ev.target.classList && ev.target.classList.contains('perm-del')) return;
        robustAddToCanvas(it.url, it.name);
      });

      // Admin-only delete
      const del = tile.querySelector('.perm-del');
      if (isAdmin && del){
        del.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          const arr = window.raPermOverlays||[];
          const i = arr.findIndex(x => x === it);
          if (i>=0){
            try{ if (arr[i]._blobURL) URL.revokeObjectURL(arr[i]._blobURL); }catch(e){}
            arr.splice(i,1);
          }
          renderShelf();
        });
      }

      grid.appendChild(tile);
    });
  }

  // Add to canvas: use app hook if available; else Fabric
  function robustAddToCanvas(url, name){
    const tryLater = (fn, tries=0) => {
      const c = window.canvas;
      if (c && c.upperCanvasEl) return fn(c);
      if (tries>25) return; setTimeout(()=>tryLater(fn, tries+1), 200);
    };
    tryLater(c=>{
      const before = c.getObjects().length;
      const isBlob = /^blob:/i.test(url);
      let usedHook = false;

      if (!isBlob && typeof window.addOverlayToCanvas === 'function'){
        try { window.addOverlayToCanvas(url, name); usedHook = true; } catch(e){}
      }

      setTimeout(()=>{
        const after = c.getObjects().length;
        if (after > before){ c.requestRenderAll(); return; }
        if (!window.fabric || !fabric.Image) return;
        const opts = isBlob ? {} : { crossOrigin:'anonymous' };
        fabric.Image.fromURL(url, img=>{
          img.set({ originX:'center', originY:'center', left:c.getWidth()/2, top:c.getHeight()/2 });
          try{ c.add(img); c.bringToFront(img); c.setActiveObject(img); }catch(e){}
          c.requestRenderAll();
          if (typeof window.refreshWatermarkGate === 'function') window.refreshWatermarkGate();
        }, opts);
      }, usedHook ? 200 : 0);
    });
  }

  function boot(){
    if (!isAdmin) return;           // Only you see/administer this
    ensureAdminBarAndShelf();
    renderShelf();
  }
  boot();
  // Keep trying as the panel renders/changes
  new MutationObserver(boot).observe(document.body, { childList:true, subtree:true });
})();
