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
