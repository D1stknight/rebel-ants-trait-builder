(function(){
  // ===============================
  //  CONFIG
  // ===============================
  const CONTRACT  = "0x96C1469c1C76E3Bb0e37c23a830d0Eea6BCf9221";
  const RESERVOIR = "https://api.reservoir.tools/tokens/v7?media=true&tokens=";

  // ---- Watermark (single source, easy to change) ----
  // Edit the string below to the EXACT watermark image you want.
  // You can also override at runtime with ?wm=https://.../your.png
  let WM_SRC = new URLSearchParams(location.search).get('wm')
            || "/assets/watermark.png?v=wm10"; // <--- CHANGE THIS PATH IF NEEDED

  (function checkWatermark(){
    const test = new Image();
    test.crossOrigin = "anonymous";
    test.onerror = () => { WM_SRC = "/watermark.png?v=wm10"; }; // fallback
    test.src = WM_SRC + (WM_SRC.includes("?") ? "&" : "?") + "t=" + Date.now();
  })();

  // ===============================
  //  FABRIC DEFAULTS
  // ===============================
  if (window.fabric) {
    fabric.Object.prototype.transparentCorners = false;
    fabric.Object.prototype.cornerStyle = "circle";
    fabric.Object.prototype.cornerColor = "#22d3ee";
    fabric.Object.prototype.cornerStrokeColor = "#0b0c10";
    fabric.Object.prototype.cornerSize = 9;
    fabric.Object.prototype.borderColor = "#22d3ee";
    fabric.Object.prototype.borderScaleFactor = 1.2;
    fabric.Object.prototype.rotatingPointOffset = 20;
  }

  // ===============================
  //  STATE
  // ===============================
  let canvas, backgroundRect=null, overlayList=[], idLabel=null, baseGroup=null;
  let zoom=1;

  // ===============================
  //  HELPERS
  // ===============================
  function $(id){ return document.getElementById(id); }
  function safeAddListener(id, ev, fn){ const el=$(id); if (el) el.addEventListener(ev, fn); }

  async function fileToDataURL(file){
    return await new Promise((res,rej)=>{
      const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file);
    });
  }
  async function fetchAsDataURL(url){
    const r=await fetch(url,{mode:"cors"});
    if(!r.ok) throw new Error("Fetch failed");
    const b=await r.blob();
    return await new Promise((res)=>{
      const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b);
    });
  }
  function normalize(u){
    if(!u) return null;
    if(u.startsWith("ipfs://")) return "https://cloudflare-ipfs.com/ipfs/"+u.replace("ipfs://","").replace(/^ipfs\//,"");
    if(u.startsWith("ar://"))   return "https://arweave.net/"+u.replace("ar://","");
    return u;
  }
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
  async function fabricFromURL(url){
    return await new Promise((res)=>{
      const opts = /^data:|^blob:/i.test(url) ? {} : { crossOrigin:"anonymous" };
      fabric.Image.fromURL(url, img=>res(img), opts);
    });
  }

  function bringInterfaceToFront(){
    if (idLabel) canvas.bringToFront(idLabel);
  }

  function initBackgroundRect(fill){
    backgroundRect = new fabric.Rect({
      left:0, top:0, width:canvas.getWidth(), height:canvas.getHeight(),
      fill:fill, selectable:false, evented:false, hasControls:false
    });
    backgroundRect._isBgRect = true;
    canvas.add(backgroundRect);
    canvas.sendToBack(backgroundRect);
  }

  function setCanvasSize(size){
    const prevW=canvas.getWidth()||size, prevH=canvas.getHeight()||size;
    const sx=size/prevW, sy=size/prevH;
    canvas.setWidth(size); canvas.setHeight(size);
    if(backgroundRect){ backgroundRect.set({ width:size, height:size }); canvas.sendToBack(backgroundRect); }
    canvas.getObjects().forEach(o=>{
      if (o===backgroundRect) return;
      o.scaleX *= sx; o.scaleY *= sy; o.left *= sx; o.top *= sy; o.setCoords();
    });
    canvas.setViewportTransform([1,0,0,1,0,0]);
    canvas.requestRenderAll();
  }

  function setZoom(v){
    zoom=Math.max(0.25,Math.min(6,v));
    canvas.setZoom(zoom);
    const zv=$("zoomVal"); if(zv) zv.textContent=Math.round(zoom*100)+"%";
    canvas.requestRenderAll();
  }

  function lockBaseObject(o){
    if (!o) return;
    o._isBase = true;
    o.selectable = false;
    o.evented = false;
    o.hasControls = false;
    o.lockMovementX = o.lockMovementY = true;
    try { canvas.sendToBack(o); } catch(_){}
  }

  function clearBaseOnly(){
    canvas.getObjects().slice().forEach(o=>{ if(o._isBase) canvas.remove(o); });
    baseGroup=null; canvas.requestRenderAll();
  }

  // Place two corner stamps into a center-origin group
  async function makeStampedGroup(img, bw, bh, wmWidthRatio){
    const wmTL = await fabricFromURL(WM_SRC);
    const wmBR = await fabricFromURL(WM_SRC);
    const wmTargetW = Math.max(16, bw * wmWidthRatio);
    const margin    = Math.max(6,  bw * 0.02);

    const scaleTL = wmTargetW / wmTL.width;
    const scaleBR = wmTargetW / wmBR.width;
    wmTL.scale(scaleTL); wmBR.scale(scaleBR);

    Object.assign(wmTL, { selectable:false, evented:false, _isWatermark:true, raWM:true, raPos:"TL" });
    Object.assign(wmBR, { selectable:false, evented:false, _isWatermark:true, raWM:true, raPos:"BR" });

    wmTL.set({
      originX:"center", originY:"center",
      left: -bw/2 + margin + wmTL.width*scaleTL/2,
      top:  -bh/2 + margin + wmTL.height*scaleTL/2
    });
    wmBR.set({
      originX:"center", originY:"center",
      left:  bw/2 - margin - wmBR.width*scaleBR/2,
      top:   bh/2 - margin - wmBR.height*scaleBR/2
    });

    const group = new fabric.Group([img, wmTL, wmBR], { originX:"center", originY:"center" });
    return group;
  }

  async function loadBaseImage(dataUrl, isToken){
    clearBaseOnly();
    const img = await fabricFromURL(dataUrl);
    img.set({ originX:"center", originY:"center" });

    // fit to canvas (no upscaling)
    const cw=canvas.getWidth(), ch=canvas.getHeight();
    const sc=Math.min(cw/img.width, ch/img.height, 1);
    img.scale(sc);

    const bw = img.width*sc, bh = img.height*sc;

    let obj;
    if (isToken) {
      // Token = RA (real asset) => NO watermarks
      img._isBase = true;
      lockBaseObject(img);
      img.set({ left:cw/2, top:ch/2 }); img.setCoords();
      obj = img;
    } else {
      // Non-token => add corner stamps
      const group = await makeStampedGroup(img, bw, bh, 0.15);
      group._isBase = true;
      lockBaseObject(group);
      group.set({ left:cw/2, top:ch/2 }); group.setCoords();
      obj = group;
    }

    canvas.add(obj);
    baseGroup = obj;
    bringInterfaceToFront();
    canvas.requestRenderAll();
  }

  // Add overlay (with small corner stamps unless permanent)
  async function addOverlayToCanvas(src, isPermanent){
    const img = await fabricFromURL(src);
    img.set({ originX:"center", originY:"center" });

    // initial scale ~ 60% of canvas' smaller side
    const cw=canvas.getWidth(), ch=canvas.getHeight();
    const maxDim = Math.min(cw, ch) * 0.60;
    const iw = img.width||maxDim, ih = img.height||maxDim;
    const sc = Math.min(1, maxDim / Math.max(iw, ih));
    if (isFinite(sc) && sc>0) img.scale(sc);

    let obj;
    if (isPermanent) {
      img._kind = "overlay";
      obj = img;
    } else {
      const group = await makeStampedGroup(img, (img.width||maxDim)*sc, (img.height||maxDim)*sc, 0.08);
      group._kind = "overlay";
      obj = group;
    }

    canvas.add(obj);
    obj.set({ left:canvas.getWidth()/2, top:canvas.getHeight()/2 }); obj.setCoords();
    canvas.setActiveObject(obj);
    bringInterfaceToFront();
    canvas.requestRenderAll();
    return obj;
  }

  function renderOverlayGrid(){
    const grid = $("overlayGrid"); if (!grid) return;
    grid.innerHTML="";
    overlayList.forEach((item, idx)=>{
      const tile=document.createElement("div");
      tile.className = "tile" + (item.perm ? " perm" : "");
      tile.style.cursor = "pointer";

      const img=document.createElement("img");
      img.src=item.src; img.alt=item.name||""; img.title=item.name||(item.perm?"":"");
      img.style.maxWidth="100%"; img.style.display="block";
      img.addEventListener("click", async ()=>{ await addOverlayToCanvas(item.src, item.perm); });

      tile.appendChild(img);

      const cap=document.createElement("div");
      cap.style.fontSize="11px"; cap.style.color="#9ca3af"; cap.style.marginTop="4px";
      cap.textContent=item.name||"overlay";
      tile.appendChild(cap);

      if (!item.perm){
        const x=document.createElement("div");
        x.textContent="×"; x.title="Remove";
        x.style.cssText="position:absolute;top:4px;right:6px;cursor:pointer;color:#bbb";
        x.addEventListener("click",(e)=>{ e.stopPropagation(); overlayList.splice(idx,1); renderOverlayGrid(); });
        tile.style.position="relative";
        tile.appendChild(x);
      }
      grid.appendChild(tile);
    });
  }

  function reorderOverlay(dir){
    const o=canvas.getActiveObject(); if(!o || o._kind!=="overlay") return;
    const objs=canvas.getObjects();
    const overlays = objs.filter(x=>x._kind==="overlay");
    if(overlays.length<=1) return;

    const overlayIndices = overlays.map(x=>objs.indexOf(x)).sort((a,b)=>a-b);
    const topIdx    = overlayIndices[overlayIndices.length-1];
    const bottomIdx = overlayIndices[0];

    if (dir==="front"){
      canvas.moveTo(o, topIdx+1);
    } else if (dir==="back"){
      canvas.moveTo(o, bottomIdx);
      const baseIdx = objs.findIndex(x=>x._isBase);
      const idx = objs.indexOf(o);
      if (baseIdx>=0 && idx<=baseIdx){ canvas.moveTo(o, baseIdx+1); }
    }
    bringInterfaceToFront();
    canvas.requestRenderAll();
  }

  function addOrUpdateTokenLabel(id){
    const display = $("tokenIdDisplay");
    if (display) display.value = "#"+id;

    const fmtSel = $("idFormat"); const fmt = fmtSel ? fmtSel.value : "plain";
    const text = formatTokenId("#"+id, fmt);

    const style = {
      fontFamily: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
      fontSize: parseInt(($("idSize")||{}).value||"52",10),
      fill: ($("idColor")||{}).value || "#ffffff",
      stroke: ($("idStrokeColor")||{}).value || "transparent",
      strokeWidth: parseInt(($("idStrokeWidth")||{}).value||"0",10),
    };

    if(!idLabel){
      idLabel = new fabric.Textbox(text, {
        left: canvas.getWidth()/2, top: 40, originX:"center", originY:"top",
        width: Math.floor(canvas.getWidth()*0.8), textAlign:"center",
        editable:false, ...style
      });
      idLabel._kind='tokenId';
      canvas.add(idLabel);
    }else{
      idLabel.text = text;
      idLabel.set(style);
    }
    bringInterfaceToFront();
    idLabel.setCoords();
    canvas.requestRenderAll();
  }

  function formatTokenId(displayVal, fmt){
    let num = parseInt(String(displayVal).replace(/[^0-9]/g,''),10);
    if(Number.isNaN(num)) return String(displayVal);
    switch(fmt){
      case "roman":  return toRoman(num);
      case "hex":    return "0x"+num.toString(16).toUpperCase();
      case "binary": return "0b"+num.toString(2);
      case "leading":return "#"+String(num).padStart(4,'0');
      default:       return "#"+num;
    }
  }
  function toRoman(num){
    if (num<=0) return String(num);
    const map=[['M',1000],['CM',900],['D',500],['CD',400],['C',100],['XC',90],['L',50],['XL',40],['X',10],['IX',9],['V',5],['IV',4],['I',1]];
    let out=''; for(const [sym,val] of map){ while(num>=val){ out+=sym; num-=val; } } return out;
  }

  // ===============================
  //  DOM READY
  // ===============================
  document.addEventListener("DOMContentLoaded", () => {
    if(!window.fabric){ alert("fabric.js failed to load. Open via a local server or check internet."); return; }

    // Create Fabric canvas
    canvas=new fabric.Canvas("c", {
      backgroundColor:"transparent",
      preserveObjectStacking:true,
      enableRetinaScaling:true,
      selectionBorderColor:'#22d3ee',
      selectionColor:'rgba(34,211,238,.08)'
    });
    window.canvas = canvas;

    // Background and initial size
    initBackgroundRect("#0d0e13");
    const sizeEl = $("canvasSize");
    if (sizeEl) sizeEl.value = "700";
    setCanvasSize(parseInt(sizeEl?sizeEl.value:"700",10));
    setZoom(1);

    // Permanents → embed to the grid
    overlayList = (window.__EMBED_OVERLAYS__ || []).map(m => ({ name:m.name, src:m.src, perm:true }));
    renderOverlayGrid();

    // -------- Base image: local upload
    safeAddListener("baseUpload","change", async (e)=>{
      const f=e.target.files && e.target.files[0];
      if (!f) return;
      const data = await fileToDataURL(f);
      await loadBaseImage(data, false); // non‑token => watermark
    });
    safeAddListener("clearUpload","click", ()=>{
      const inp=$("baseUpload"); if (inp) inp.value="";
      clearBaseOnly();
    });

    // -------- Base image: paste URL
    safeAddListener("loadUrl","click", async ()=>{
      const url = ($("baseUrl") && $("baseUrl").value || "").trim();
      if (!url) return;
      const data = await fetchAsDataURL(url);
      await loadBaseImage(data, false);
    });

    // -------- Base image: load by token ID (Reservoir)
    safeAddListener("loadToken","click", async ()=>{
      const id = ($("tokenIdInput") && $("tokenIdInput").value || "").trim();
      const status = $("tokenStatus");
      if (!id){ if(status) status.textContent="Enter a token ID."; return; }

      if(status) status.textContent="Fetching token…";
      try{
        const imgUrl = await fetchImageByTokenId(CONTRACT, id);
        if (!imgUrl){ if(status) status.textContent="No image URL found."; return; }
        if(status) status.textContent="Downloading image…";
        const data = await fetchAsDataURL(imgUrl);
        await loadBaseImage(data, true);   // token ⇒ NO watermark
        addOrUpdateTokenLabel(id);
        if(status) status.textContent="Loaded 👍";
      }catch(_){
        if(status) status.textContent="Failed to load token image.";
      }
    });

    // -------- Canvas controls
    safeAddListener("zoomIn","click",  ()=> setZoom(zoom*1.1));
    safeAddListener("zoomOut","click", ()=> setZoom(zoom/1.1));
    safeAddListener("zoomReset","click", ()=>{
      setZoom(1);
      canvas.setViewportTransform([1,0,0,1,0,0]);
    });
    safeAddListener("canvasSize","change", (e)=> setCanvasSize(parseInt(e.target.value,10)));
    safeAddListener("clearBase","click", clearBaseOnly);
    safeAddListener("clearCanvas","click", ()=>{
      const keep=[backgroundRect];
      canvas.getObjects().slice().forEach(o=>{ if(!keep.includes(o)) canvas.remove(o); });
      idLabel=null; baseGroup=null; canvas.requestRenderAll();
    });

    // -------- Token ID style live controls (if present)
    ["change","input"].forEach(ev=>{
      safeAddListener("idFormat", ev, ()=>{ if(idLabel){ idLabel.text = formatTokenId(($("tokenIdDisplay")||{}).value||"", $("idFormat").value); canvas.requestRenderAll(); }});
      safeAddListener("idSize", ev, ()=>{ if(idLabel){ idLabel.set('fontSize', parseInt(($("idSize")||{}).value||"52",10)); canvas.requestRenderAll(); }});
      safeAddListener("idColor", ev, ()=>{ if(idLabel){ idLabel.set('fill', ($("idColor")||{}).value||"#fff"); canvas.requestRenderAll(); }});
      safeAddListener("idStrokeColor", ev, ()=>{ if(idLabel){ idLabel.set('stroke', ($("idStrokeColor")||{}).value||"transparent"); canvas.requestRenderAll(); }});
      safeAddListener("idStrokeWidth", ev, ()=>{ if(idLabel){ idLabel.set('strokeWidth', parseInt(($("idStrokeWidth")||{}).value||"0",10)); canvas.requestRenderAll(); }});
    });
    safeAddListener("deleteTokenId","click", ()=>{ if(idLabel){ canvas.remove(idLabel); idLabel=null; canvas.requestRenderAll(); }});

    // -------- Custom text (optional UI)
    safeAddListener("addCustomText","click", ()=>{
      const val = (($("customText")||{}).value||"").trim(); if (!val) return;
      const txt = new fabric.Textbox(val,{
        left:canvas.getWidth()/2, top:canvas.getHeight()/2, originX:"center", originY:"center",
        width: Math.floor(canvas.getWidth()*0.8), textAlign:"left",
        fontFamily: ($("fontFamily")||{}).value || "Arial, sans-serif",
        fontSize: parseInt(($("fontSize")||{}).value||"48",10),
        fill: ($("fontColor")||{}).value || "#ffffff",
        stroke: ($("strokeColor")||{}).value || "transparent",
        strokeWidth: parseInt(($("strokeWidth")||{}).value||"0",10),
        editable:true
      });
      txt._kind='customText';
      canvas.add(txt).setActiveObject(txt);
      bringInterfaceToFront(); canvas.requestRenderAll();
    });
    ["change","input"].forEach(ev=>{
      safeAddListener("fontFamily", ev, ()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('fontFamily', $("fontFamily").value); canvas.requestRenderAll(); }});
      safeAddListener("fontSize", ev,   ()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('fontSize', parseInt($("fontSize").value||"48",10)); canvas.requestRenderAll(); }});
      safeAddListener("fontColor", ev,  ()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('fill', $("fontColor").value); canvas.requestRenderAll(); }});
      safeAddListener("strokeColor", ev,()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('stroke', $("strokeColor").value); canvas.requestRenderAll(); }});
      safeAddListener("strokeWidth", ev,()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ o.set('strokeWidth', parseInt($("strokeWidth").value||"0",10)); canvas.requestRenderAll(); }});
    });
    safeAddListener("delSelectedText","click", ()=>{ const o=canvas.getActiveObject(); if(o&&o._kind==='customText'){ canvas.remove(o); canvas.requestRenderAll(); }});
    safeAddListener("delAllText","click", ()=>{ canvas.getObjects().slice().forEach(o=>{ if(o._kind==='customText') canvas.remove(o); }); canvas.requestRenderAll(); });

    // -------- Selection tools
    safeAddListener("duplicate","click", ()=>{ const o=canvas.getActiveObject(); if(!o) return; o.clone(c=>{ c.set({ left:(o.left||0)+20, top:(o.top||0)+20 }); canvas.add(c).setActiveObject(c); canvas.requestRenderAll(); }); });
    safeAddListener("delete","click", ()=>{ const o=canvas.getActiveObject(); if(!o || o===backgroundRect || o._isBase) return; canvas.remove(o); canvas.requestRenderAll(); });
    safeAddListener("opacity","input", (e)=>{ const o=canvas.getActiveObject(); if(!o) return; o.set('opacity', parseFloat(e.target.value||"1")); canvas.requestRenderAll(); });
    safeAddListener("blendMode","change", (e)=>{ const o=canvas.getActiveObject(); if(!o) return; o.globalCompositeOperation = e.target.value==="normal" ? null : e.target.value; canvas.requestRenderAll(); });
    safeAddListener("bringFront","click", ()=> reorderOverlay('front'));
    safeAddListener("sendBack","click",  ()=> reorderOverlay('back'));
    safeAddListener("flipX","click",     ()=>{ const o=canvas.getActiveObject(); if(!o) return; o.toggle && o.toggle('flipX'); canvas.requestRenderAll(); });
    safeAddListener("flipY","click",     ()=>{ const o=canvas.getActiveObject(); if(!o) return; o.toggle && o.toggle('flipY'); canvas.requestRenderAll(); });
    safeAddListener("lock","click",      ()=>{ const o=canvas.getActiveObject(); if(!o) return; o.set({ selectable:false, evented:false, hasControls:false, lockMovementX:true, lockMovementY:true, lockScalingX:true, lockScalingY:true, lockRotation:true }); canvas.requestRenderAll(); });
    safeAddListener("unlockAll","click", ()=>{ canvas.getObjects().forEach(o=>{ if(!o._isBase){ o.set({ selectable:true, evented:true, hasControls:true, lockMovementX:false, lockMovementY:false, lockScalingX:false, lockScalingY:false, lockRotation:false }); }}); canvas.requestRenderAll(); });
    safeAddListener("clearAllOverlays","click", ()=>{ canvas.getObjects().slice().forEach(o=>{ if(o._kind==='overlay') canvas.remove(o); }); canvas.requestRenderAll(); });

    // -------- Overlays panel & uploads
    safeAddListener("overlayUpload","change", async (e)=>{
      const files=Array.from(e.target.files||[]);
      for(const f of files){
        const data=await fileToDataURL(f);
        overlayList.unshift({name:f.name, src:data, perm:false});
        await addOverlayToCanvas(data,false);
      }
      renderOverlayGrid(); e.target.value="";
    });
    safeAddListener("clearOverlayGrid","click", ()=>{
      overlayList = overlayList.filter(o=>o.perm); renderOverlayGrid();
    });

    // -------- Keyboard (Delete/Backspace, Arrows, Cmd/Ctrl+D)
    document.addEventListener("keydown", (e)=>{
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if (e.target && (e.target.isContentEditable || tag==="input" || tag==="textarea" || tag==="select")) return;

      const o = canvas.getActiveObject();

      // Delete selection
      if (o && (e.key==="Delete" || e.key==="Backspace")){
        if (!o._isBase && o!==backgroundRect){
          canvas.remove(o); canvas.requestRenderAll();
        }
        e.preventDefault(); return;
      }
      // Duplicate
      if (o && ( (e.metaKey && e.key.toLowerCase()==="d") || (e.ctrlKey && e.key.toLowerCase()==="d") )){
        try { o.clone(cl=>{ cl.set({ left:(o.left||0)+10, top:(o.top||0)+10 }); canvas.add(cl); canvas.setActiveObject(cl); canvas.requestRenderAll(); }); } catch(_){}
        e.preventDefault(); return;
      }
      // Nudge
      const arrows = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"];
      if (o && arrows.includes(e.key)){
        const step = e.shiftKey ? 10 : 1;
        if (e.key==="ArrowLeft")  o.left -= step;
        if (e.key==="ArrowRight") o.left += step;
        if (e.key==="ArrowUp")    o.top  -= step;
        if (e.key==="ArrowDown")  o.top  += step;
        o.setCoords(); canvas.requestRenderAll();
        e.preventDefault();
      }
    });

    // -------- SNAP + ALIGN UI
    (function snapAlign(){
      // UI row (Center buttons + Snap toggle)
      const header = Array.from(document.querySelectorAll("h3")).find(h => (h.textContent||"").trim().toLowerCase()==="selection");
      const holder = header ? header.parentNode : document.body;
      if (!$("raSnapRow")){
        const row = document.createElement("div");
        row.id="raSnapRow";
        row.style.cssText="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center";
        row.innerHTML = `
          <button class="btn small" id="raCenterH">Center H</button>
          <button class="btn small" id="raCenterV">Center V</button>
          <button class="btn small" id="raCenterHV">Center HV</button>
          <button class="btn small" id="raSnapToggle">Snap: On</button>
          <div style="opacity:.65;font-size:11px">Arrows=1px · Shift+Arrows=10px · Cmd/Ctrl+D duplicate</div>
        `;
        holder.appendChild(row);
        $("raSnapToggle").onclick = ()=>{
          window.__snapOn = !window.__snapOn;
          $("raSnapToggle").textContent = "Snap: " + (window.__snapOn ? "On" : "Off");
        };
        function center(which){
          const o=canvas.getActiveObject(); if(!o) return;
          if (which==="H" || which==="HV") o.left = canvas.getWidth()/2;
          if (which==="V" || which==="HV") o.top  = canvas.getHeight()/2;
          o.setCoords(); canvas.requestRenderAll();
        }
        $("raCenterH").onclick  = ()=>center("H");
        $("raCenterV").onclick  = ()=>center("V");
        $("raCenterHV").onclick = ()=>center("HV");
      }

      window.__snapOn = true;
      if (!canvas.__snapWired){
        function halfW(o){ return (o.getScaledWidth? o.getScaledWidth(): (o.width||0)*(o.scaleX||1)) / 2; }
        function halfH(o){ return (o.getScaledHeight?o.getScaledHeight(): (o.height||0)*(o.scaleY||1)) / 2; }
        function clampSnap(o){
          if (!window.__snapOn) return;
          const tol = 8, cw=canvas.getWidth(), ch=canvas.getHeight();
          const hw=halfW(o), hh=halfH(o);
          // centers
          if (Math.abs(o.left - cw/2) <= tol) o.left = cw/2;
          if (Math.abs(o.top  - ch/2) <= tol) o.top  = ch/2;
          // edges
          if (Math.abs((o.left - hw) - 0)  <= tol) o.left = hw;
          if (Math.abs((o.left + hw) - cw) <= tol) o.left = cw - hw;
          if (Math.abs((o.top  - hh) - 0)  <= tol) o.top  = hh;
          if (Math.abs((o.top  + hh) - ch) <= tol) o.top  = ch - hh;
        }
        canvas.on("object:moving", e=>{ const o=e.target; if (!o) return; clampSnap(o); o.setCoords(); });
        canvas.on("mouse:up", ()=> canvas.requestRenderAll());
        canvas.__snapWired = true;
      }
    })();

    // -------- ADMIN PORTAL (toggle with ?admin=1)
    (function adminDock(){
      const isAdmin = /\badmin=1\b/i.test(location.search);
      if (!isAdmin) { renderPublishedShelf(); return; }

      if ($("raAdminDock2")) { renderPublishedShelf(); return; }

      function fileToDataURL2(file){
        return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });
      }
      function getShelf(){ try{ return JSON.parse((localStorage||sessionStorage).getItem('ra2_published')||'[]'); }catch(_){ return []; } }
      function setShelf(arr){ try{ (localStorage||sessionStorage).setItem('ra2_published', JSON.stringify(arr||[])); }catch(_){} }
      function setMsg(t){ const el=$("ra2Msg"); if (el) el.textContent=t||''; }

      const dock = document.createElement('div');
      dock.id = 'raAdminDock2';
      dock.style.cssText = 'position:fixed;right:16px;bottom:16px;width:300px;background:#0e0f13;border:1px solid #2a2a2e;border-radius:12px;box-shadow:0 10px 24px rgba(0,0,0,.45);color:#e7e7ea;font:13px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif;z-index:999999';
      dock.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #222">
          <strong>Admin Overlays</strong>
          <div style="display:flex;gap:6px;align-items:center;">
            <button id="ra2Export"  style="background:#10b981;border:0;border-radius:8px;color:#08130e;padding:6px 10px;cursor:pointer">Export pack</button>
            <button id="ra2Hide"    style="background:#1b1c22;border:1px solid #2a2a2e;border-radius:6px;color:#e7e7ea;padding:4px 8px;cursor:pointer">Hide</button>
          </div>
        </div>
        <div id="ra2Body" style="padding:10px 12px;">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
            <button id="ra2Add"   style="background:#3b82f6;border:0;border-radius:8px;color:#fff;padding:6px 10px;cursor:pointer">Add PNGs</button>
            <button id="ra2Clear" style="background:#2a2a2e;border:0;border-radius:8px;color:#ccc;padding:6px 10px;cursor:pointer">Clear</button>
            <div id="ra2Msg" style="opacity:.75;min-height:18px"></div>
          </div>
          <div id="ra2Grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:260px;overflow:auto;"></div>
          <div style="opacity:.55;margin-top:8px">Use <em>Publish</em> to add items to the shelf below for everyone.</div>
        </div>
      `;
      document.body.appendChild(dock);

      $("ra2Hide").onclick = ()=>{
        const b=$("ra2Body"); const btn=$("ra2Hide");
        const h = b.style.display==='none'; b.style.display=h?'block':'none'; btn.textContent=h?'Hide':'Show';
      };
      $("ra2Export").onclick = ()=>{
        const blob = new Blob([JSON.stringify({version:1,items:getShelf()})], {type:'application/json'});
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='overlays.json'; document.body.appendChild(a); a.click();
        setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 200);
      };
      $("ra2Add").onclick = ()=>{
        const inp=document.createElement('input');
        inp.type='file'; inp.accept='image/png'; inp.multiple=true; inp.style.display='none';
        inp.onchange = async (e)=>{
          const files = Array.from(e.target.files||[]);
          files.forEach(async f=>{
            const dataURL = await fileToDataURL2(f);
            addTile({ name: f.name.replace(/\.png$/i,'').replace(/[_-]+/g,' '), dataURL });
          });
          inp.remove();
        };
        document.body.appendChild(inp); inp.click();
      };
      $("ra2Clear").onclick = ()=>{
        const g=$("ra2Grid"); if (g) g.innerHTML='';
        setMsg('Cleared');
        setTimeout(()=>setMsg(''), 800);
      };

      function addTile(item){
        const grid=$("ra2Grid"); if (!grid) return;
        const tile=document.createElement("div");
        tile.style.cssText='position:relative;border:1px solid #2a2a2e;border-radius:8px;background:#15161c;padding:6px;text-align:center;';
        tile.innerHTML = `
          <div style="height:80px;display:flex;align-items:center;justify-content:center;">
            <img src="${item.dataURL}" alt="${item.name||''}" style="max-width:100%;max-height:80px;"/>
          </div>
          <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name||''}</div>
          <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;">
            <button data-act="publish" class="raTinyBtn2">Publish</button>
            <button data-act="add"      class="raTinyBtn2">Add</button>
            <button data-act="del"      class="raTinyBtn2" title="Remove">×</button>
          </div>
        `;
        tile.querySelectorAll('.raTinyBtn2').forEach(b=>{
          b.style.cssText='background:#2a2a2e;border:0;border-radius:6px;color:#ddd;padding:3px 8px;cursor:pointer;font-size:12px;';
        });
        tile.addEventListener("click", (ev)=>{
          const btn=ev.target.closest("button"); if(!btn) return;
          const act=btn.getAttribute("data-act");
          if (act==="del"){ tile.remove(); return; }
          if (act==="publish"){
            const arr=getShelf(); arr.push({ name:item.name, dataURL:item.dataURL }); setShelf(arr);
            setMsg(`Published: ${item.name}`); setTimeout(()=>setMsg(''), 800);
          }
          if (act==="add"){ addOverlayToCanvas(item.dataURL,false); setMsg(`Added: ${item.name}`); setTimeout(()=>setMsg(''), 800); }
        });
        grid.appendChild(tile);
      }

      renderPublishedShelf();
    })();

    // Render Published shelf (visible for everyone)
    function renderPublishedShelf(){
      function getShelf(){ try{ return JSON.parse((localStorage||sessionStorage).getItem('ra2_published')||'[]'); }catch(_){ return []; } }
      function ensureShelf(){
        if ($("ra2Shelf")) return true;
        const h3 = Array.from(document.querySelectorAll('h3')).find(h => (h.textContent||'').trim().toLowerCase()==='overlays');
        const card = h3 ? h3.parentNode : null; if (!card) return false;
        const wrap = document.createElement('div'); wrap.id='ra2Shelf'; wrap.style.marginTop='8px';
        wrap.innerHTML = `
          <div style="font-weight:600;opacity:.85;margin-bottom:6px">Published Overlays</div>
          <div id="ra2ShelfGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:240px;overflow:auto;"></div>
        `;
        card.appendChild(wrap); return true;
      }
      function addToCanvas(src){ addOverlayToCanvas(src,false); }
      function draw(){
        if (!ensureShelf()) { setTimeout(draw,300); return; }
        const grid=$("ra2ShelfGrid"); if (!grid) return;
        grid.innerHTML='';
        getShelf().forEach(item=>{
          const tile=document.createElement('div');
          tile.style.cssText='position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;text-align:center;cursor:pointer;';
          tile.innerHTML = `
            <div style="height:80px;display:flex;align-items:center;justify-content:center;">
              <img src="${item.dataURL}" alt="${item.name||''}" style="max-width:100%;max-height:80px;"/>
            </div>
            <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name||''}</div>
          `;
          tile.addEventListener('click', ()=> addToCanvas(item.dataURL));
          grid.appendChild(tile);
        });
      }
      draw();
    }
  });

  // ===============================
  //  EXPORT (optional UI IDs: exportPng / openNewTab)
  // ===============================
  document.addEventListener("DOMContentLoaded", ()=>{
    safeAddListener("exportPng",   "click", ()=> doExport(false));
    safeAddListener("openNewTab",  "click", ()=> doExport(true));
  });
  function doExport(openTab){
    if (!window.canvas) return;
    const mult=parseInt(($("exportMultiplier")||{}).value||"2",10);
    let dataURL;
    try{
      dataURL=canvas.toDataURL({format:"png", enableRetinaScaling:true, multiplier:mult});
    }catch(_){ alert("Export blocked (CORS). Use images with CORS headers or same-origin."); return; }
    const prev = $("exportPreview"); if (prev) prev.src = dataURL;
    const a=document.createElement("a"); a.href=dataURL; a.download="rebel-ant-overlay.png";
    const manual=$("manualLink"); if (manual){ manual.href=dataURL; manual.textContent="Open last export (manual save)"; }

    if(openTab){
      fetch(dataURL).then(r=>r.blob()).then(blob=>{
        const url=URL.createObjectURL(blob);
        const w=window.open(url,"_blank","noopener");
        if(!w){ window.location.href=url; }
      });
    }else{
      document.body.appendChild(a); a.click(); a.remove();
    }
  }
})();

/* ===================== PATCH 1 — TRUE CANVAS SIZE (v4) ===================== *
 * - Resizes the canvas AND proportionally scales/positions ALL objects.
 * - Works for the Size input and the 700 / 900 / 1024 / 1200 preset buttons.
 * - Never zooms; resets viewport after size change.
 * ========================================================================== */
(function RA_TRUE_CANVAS_SIZE_V4(){
  if (window.__RA_TRUE_CANVAS_SIZE_V4__) return;
  window.__RA_TRUE_CANVAS_SIZE_V4__ = true;

  function findCanvas(){
    const c = window.canvas;
    if (c && typeof c.getObjects === 'function') return c;
    const els = document.querySelectorAll('canvas');
    for (const el of els){
      const cand = el.fabric || el.__canvas || el.__fabric;
      if (cand && typeof cand.getObjects === 'function') return cand;
    }
    return null;
  }

  // Try to find a background rect we might need to resize explicitly
  function findBackgroundRect(c){
    if (window.backgroundRect) return window.backgroundRect;
    const rects = (c.getObjects && c.getObjects('rect')) ? c.getObjects('rect') : [];
    // Prefer one previously marked
    const marked = rects.find(r => r._isBgRect || r._isBase || r._isBaseBG);
    if (marked) return marked;
    // Otherwise, pick the largest rect (common background)
    let best = null, bestArea = 0;
    rects.forEach(r=>{
      const w = r.getScaledWidth ? r.getScaledWidth() : (r.width||0)*(r.scaleX||1);
      const h = r.getScaledHeight? r.getScaledHeight(): (r.height||0)*(r.scaleY||1);
      const a = w*h; if (a>bestArea){ best=r; bestArea=a; }
    });
    return best;
  }

  function scaleAllToSize(size){
    const c = findCanvas(); if (!c) return;
    const prevW = c.getWidth()  || size;
    const prevH = c.getHeight() || size;
    const sx = size / prevW;
    const sy = size / prevH;

    // Set new canvas box first
    c.setWidth(size);
    c.setHeight(size);

    // Resize known background rect (if any)
    try {
      const bg = findBackgroundRect(c);
      if (bg) { bg.set({ width:size, height:size }); bg.setCoords && bg.setCoords(); }
    } catch(_) {}

    // Scale every other object proportionally (skip bg we already handled)
    (c.getObjects ? c.getObjects() : []).forEach(o=>{
      if (!o) return;
      // Skip the background rect if we just resized it directly
      const bg = window.backgroundRect || null;
      if (bg && o === bg) return;

      // Ensure numeric fields exist
      const sX = isFinite(o.scaleX) ? o.scaleX : 1;
      const sY = isFinite(o.scaleY) ? o.scaleY : 1;
      const L  = isFinite(o.left)   ? o.left   : 0;
      const T  = isFinite(o.top)    ? o.top    : 0;

      o.set({
        scaleX: sX * sx,
        scaleY: sY * sy,
        left:   L  * sx,
        top:    T  * sy
      });
      o.setCoords && o.setCoords();
    });

    // Reset any pan/zoom and re-render
    try { c.setViewportTransform([1,0,0,1,0,0]); } catch(_) {}
    c.requestRenderAll();
  }

  // Hook the Size input
  function wireInput(){
    const inp = document.getElementById('canvasSize');
    if (!inp || inp.__raSized) return;
    inp.__raSized = true;
    inp.addEventListener('change', e=>{
      const val = parseInt(e.target.value, 10);
      if (!val) return;
      scaleAllToSize(val);
    });
  }

  // Hook the preset buttons labelled exactly 700 / 900 / 1024 / 1200
  function wirePresetButtons(){
    const btns = Array.from(document.querySelectorAll('button'));
    btns.forEach(b=>{
      const label = (b.textContent || '').trim();
      if (!/^(700|900|1024|1200)$/i.test(label)) return;
      if (b.__raSizePreset) return;
      b.__raSizePreset = true;

      b.addEventListener('click', ev=>{
        ev.preventDefault(); ev.stopPropagation();
        const size = parseInt(label,10);
        const inp = document.getElementById('canvasSize');
        if (inp) inp.value = String(size);
        scaleAllToSize(size);
      }, true);
    });
  }

  function tick(){
    wireInput();
    wirePresetButtons();
    setTimeout(tick, 400);
  }
  tick();
})();

/* ================= PATCH 2 — ADMIN “PUBLISH” → PUBLISHED SHELF (v4) ================= *
 * - Clicking Publish in the Admin dock pushes that PNG into “Published Overlays”.
 * - Shows a removable × on tiles ONLY when you are in admin mode (?admin=1).
 * - Clicking a Published tile adds it to the canvas (scaled & centered).
 * ==================================================================================== */
(function RA_ADMIN_PUBLISH_TO_SHELF_V4(){
  if (window.__RA_ADMIN_PUBLISH_TO_SHELF_V4__) return;
  window.__RA_ADMIN_PUBLISH_TO_SHELF_V4__ = true;

  const isAdmin = /(\?|&)admin=1\b/.test(location.search);
  window.raPublishedOverlays = window.raPublishedOverlays || [];

  function findCanvas(){
    const c = window.canvas;
    if (c && typeof c.getObjects === 'function') return c;
    const els = document.querySelectorAll('canvas');
    for (const el of els){
      const cand = el.fabric || el.__canvas || el.__fabric;
      if (cand && typeof cand.getObjects === 'function') return cand;
    }
    return null;
  }

  // Ensure the shelf exists inside the Overlays card
  function ensureShelf(){
    let shelf = document.getElementById('raPublishedShelf');
    if (shelf) return shelf;
    const h3 = Array.from(document.querySelectorAll('h3'))
      .find(h => (h.textContent||'').trim().toLowerCase() === 'overlays');
    if (!h3 || !h3.parentNode) return null;

    shelf = document.createElement('div');
    shelf.id = 'raPublishedShelf';
    shelf.style.marginTop = '10px';
    shelf.innerHTML = `
      <div style="font-weight:600;opacity:.85;margin:4px 0">Published Overlays</div>
      <div id="raPublishedGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:240px;overflow:auto;"></div>
    `;
    h3.parentNode.appendChild(shelf);
    return shelf;
  }

  function renderShelf(){
    const shelf = ensureShelf(); if (!shelf) return;
    const grid = document.getElementById('raPublishedGrid'); if (!grid) return;
    grid.innerHTML = '';

    (window.raPublishedOverlays||[]).forEach((item, idx)=>{
      const tile = document.createElement('div');
      tile.style.cssText = 'position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;text-align:center;cursor:pointer;';
      tile.innerHTML = `
        <div style="height:80px;display:flex;align-items:center;justify-content:center;">
          <img src="${item.src}" alt="${item.name||''}" style="max-width:100%;max-height:80px"/>
        </div>
        <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${item.name||''}
        </div>
        ${isAdmin ? '<button class="ra-pub-del" title="Remove" style="position:absolute;top:4px;right:6px;background:#2a2a2e;border:0;border-radius:6px;color:#ddd;padding:2px 6px;cursor:pointer">×</button>' : ''}
      `;

      // Add to canvas on tile click
      tile.addEventListener('click', (ev)=>{
        if (isAdmin && ev.target && ev.target.classList.contains('ra-pub-del')) return; // handled below
        const src = item.src;
        const c = findCanvas(); if (!c || !window.fabric) return;
        const opts = /^data:|^blob:/i.test(src) ? {} : { crossOrigin:'anonymous' };
        fabric.Image.fromURL(src, img=>{
          if (!img) return;
          const cw = c.getWidth(), ch = c.getHeight();
          const max = Math.min(cw, ch) * 0.6;
          const iw = img.width  || max, ih = img.height || max;
          const sc = Math.min(1, max / Math.max(iw, ih));
          img.set({ originX:'center', originY:'center', left:cw/2, top:ch/2 });
          if (isFinite(sc) && sc>0) img.scale(sc);
          img._kind = 'overlay';
          c.add(img); c.bringToFront(img); c.setActiveObject(img); c.requestRenderAll();
        }, opts);
      });

      // Admin-only delete
      if (isAdmin){
        tile.querySelector('.ra-pub-del').addEventListener('click', (ev)=>{
          ev.stopPropagation();
          window.raPublishedOverlays.splice(idx, 1);
          renderShelf();
        });
      }

      grid.appendChild(tile);
    });
  }

  // Public helper: add item to published list, then render
  window.raAddToPublished = function(name, src){
    window.raPublishedOverlays.push({ name, src });
    renderShelf();
  };

  // Convert a URL (blob/http) to data: URL when possible (ok to fall back)
  async function toDataURL(url){
    if (!url || url.startsWith('data:')) return url;
    try {
      const r = await fetch(url, { cache:'no-store' });
      const b = await r.blob();
      return await new Promise(res=>{
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(b);
      });
    } catch(_){
      return url; // fallback (blob/http is fine for this session)
    }
  }

  // Capture clicks on the Admin dock "Publish" buttons
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('#raAdminDock button');
    if (!btn) return;
    const label = (btn.textContent||'').trim().toLowerCase();
    if (label !== 'publish') return;

    // Find the tile inside the admin grid
    const tile = btn.closest('#raDockGrid > div') || btn.closest('div');
    const img  = tile ? tile.querySelector('img') : null;
    const name = tile ? (tile.querySelector('div:nth-child(2)')?.textContent||'overlay').trim() : 'overlay';
    const src  = img ? img.getAttribute('src') : null;
    if (!src) return;

    const data = await toDataURL(src);
    window.raAddToPublished(name, data);

    // Stop any other handlers that might have been bound earlier
    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
  }, true);

  // Keep shelf alive even if the panel re-renders
  const obs = new MutationObserver(renderShelf);
  obs.observe(document.body, { childList:true, subtree:true });

  // First render
  renderShelf();
})();
