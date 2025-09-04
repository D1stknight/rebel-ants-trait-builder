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

/* =========================
   RA_CANVAS_RESIZE_SYNC_ONLY_V8
   - Scales ALL content when canvas size changes (700/900/1024/1200 or size input)
   - Re-centers everything and resets pan/zoom
   - Does not touch Admin/Published overlays at all
   ========================= */
(function RA_CANVAS_RESIZE_SYNC_ONLY_V8(){
  // Safe handle to the Fabric canvas
  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  // Main resizer: scale+recenter all objects to a new (square) size
  function resizeCanvasAndScale(newSize){
    const c = C(); if (!c) return;
    newSize = parseInt(newSize, 10);
    if (!newSize || !isFinite(newSize)) return;

    const oldW = c.getWidth(), oldH = c.getHeight();
    if (!oldW || !oldH) return;

    // No change? just normalize zoom/pan
    if (oldW === newSize && oldH === newSize){
      try { c.setViewportTransform([1,0,0,1,0,0]); } catch(_) {}
      try { c.requestRenderAll(); } catch(_) {}
      return;
    }

    const s = newSize / oldW;                 // uniform scale (square canvas)
    const oldCenter = new fabric.Point(oldW/2, oldH/2);
    const newCenter = new fabric.Point(newSize/2, newSize/2);

    // Snapshot objects (exclude nothing here — base, overlays, text all follow)
    const objs = (c.getObjects() || []).slice();
    const info = objs.map(o => ({
      o,
      ctr: (typeof o.getCenterPoint === 'function') ? o.getCenterPoint() : new fabric.Point(o.left||0, o.top||0),
      sx: o.scaleX || 1,
      sy: o.scaleY || 1
    }));

    // Resize canvas
    c.setWidth(newSize);
    c.setHeight(newSize);

    // If your code exposes a backgroundRect globally, update it too (safe no-op otherwise)
    const bgRect = (window.backgroundRect && typeof window.backgroundRect.set === 'function') ? window.backgroundRect : null;
    if (bgRect) {
      try {
        bgRect.set({ width: newSize, height: newSize, left: 0, top: 0 });
        c.sendToBack(bgRect);
      } catch(_) {}
    }

    // Scale & reposition everything relative to the canvas center
    info.forEach(({o, ctr, sx, sy}) => {
      // keep backgroundRect updated above; here we still scale if someone wants it scaled too
      try {
        const vx = ctr.x - oldCenter.x;
        const vy = ctr.y - oldCenter.y;
        const nx = newCenter.x + vx * s;
        const ny = newCenter.y + vy * s;

        o.set({ scaleX: sx * s, scaleY: sy * s });
        if (typeof o.setPositionByOrigin === 'function') {
          o.setPositionByOrigin(new fabric.Point(nx, ny), 'center', 'center');
        } else {
          o.left = nx; o.top = ny;
        }
        o.setCoords();
      } catch(_) {}
    });

    // Reset viewport pan/zoom so it never looks like “zoom only”
    try { c.setViewportTransform([1,0,0,1,0,0]); } catch(_) {}
    const zEl = document.getElementById('zoomVal'); if (zEl) zEl.textContent = '100%';

    try { c.requestRenderAll(); } catch(_) {}
  }

  // Expose/override for any existing callers
  window.raResizeCanvasAndScale = resizeCanvasAndScale;
  window.setCanvasSize = resizeCanvasAndScale;

  // Wire the size input (left panel)
  function wireSizeInput(){
    const el = document.getElementById('canvasSize');
    if (el && !el.__raBound) {
      el.__raBound = true;
      el.addEventListener('change', (e)=> resizeCanvasAndScale(parseInt(e.target.value, 10)));
    }
  }

  // Intercept the quick size buttons (700 / 900 / 1024 / 1200)
  function wireQuickButtons(){
    if (document.__raSizeCaptureOnly) return;
    document.__raSizeCaptureOnly = true;
    document.addEventListener('click', function(ev){
      const btn = ev.target && ev.target.closest && ev.target.closest('button');
      if (!btn) return;
      const t = (btn.textContent||'').trim();
      if (/^(700|900|1024|1200)$/i.test(t)) {
        ev.preventDefault(); ev.stopImmediatePropagation(); ev.stopPropagation();
        resizeCanvasAndScale(parseInt(t, 10));
      }
    }, true);
  }

  // Boot
  function boot(){ wireSizeInput(); wireQuickButtons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* ==========================================================
   RA_FIXED_CENTER_CANVAS_V1
   Keeps the canvas card centered in the viewport on scroll.
   - No layout jump (uses a ghost placeholder).
   - Stays horizontally aligned with its column.
   - Recomputes on resize and when canvas size changes.
   Paste at the very bottom of app.js.
   ========================================================== */
(function RA_FIXED_CENTER_CANVAS_V1(){
  function byId(id){ return document.getElementById(id); }
  function getCanvasCard(){
    const c = byId('c');                           // <canvas id="c">
    if (!c) return null;
    // Find the visual card that holds the canvas
    return c.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper') || c.parentElement;
  }

  function install(){
    const card = getCanvasCard();
    if (!card) { setTimeout(install, 200); return; }
    if (card.__raFixedCenter) return;              // don’t double‑install
    card.__raFixedCenter = true;

    // 1) Make a ghost to hold space so the layout doesn’t collapse
    const ghost = document.createElement('div');
    ghost.id = 'raCanvasGhost';
    ghost.style.width = card.offsetWidth + 'px';
    ghost.style.height = card.offsetHeight + 'px';
    ghost.style.visibility = 'hidden';
    ghost.style.pointerEvents = 'none';
    card.parentNode.insertBefore(ghost, card);

    // 2) Fix the real card to the viewport (we’ll align it to the ghost)
    Object.assign(card.style, {
      position: 'fixed',
      zIndex: 4,
      margin: 0,
      left: '0px',
      top:  '0px',
      right:'auto',
      transform: 'none'
    });

    // 3) Function to position the fixed card so it:
    //    - shares the ghost’s left/width (stays in its column)
    //    - is vertically centered in the viewport
    function place(){
      const rect = ghost.getBoundingClientRect();
      // keep horizontal alignment with the column
      card.style.width = rect.width + 'px';
      card.style.left  = rect.left + 'px';

      // vertical center; clamp if card is taller than viewport
      const h   = card.offsetHeight || rect.height;
      const top = Math.max(12, Math.round((window.innerHeight - h) / 2));
      card.style.top = top + 'px';
    }

    // 4) Recalculate whenever things change
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    try { new ResizeObserver(place).observe(card); } catch(_) {}
    try { new ResizeObserver(place).observe(ghost); } catch(_) {}
    document.addEventListener('ra:canvas-ready', place);

    // First placement
    place();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})();

/* ==========================================================
   RA_OPEN_NEW_TAB_VIEWER_V1
   - Opens export in a NEW TAB
   - Fits image to the browser window (no more giant render)
   - Click image to toggle: Fit ↔ Actual size (100%)
   Paste at the very bottom of app.js (replace any prior open-new-tab patch).
   ========================================================== */
(function RA_OPEN_NEW_TAB_VIEWER_V1(){
  // Find Fabric canvas safely
  function findCanvas(){
    if (window.canvas && typeof window.canvas.toDataURL === 'function') return window.canvas;
    const el = document.querySelector('canvas.upper-canvas') || document.querySelector('canvas.lower-canvas') || document.querySelector('canvas');
    if (el){
      for (const k of ['fabric','__fabric','__canvas','fabricCanvas','_fabricCanvas']){
        const v = el[k]; if (v && typeof v.toDataURL === 'function') { window.canvas = v; return v; }
      }
    }
    try{
      for (const k in window){
        const v = window[k];
        if (v && typeof v.toDataURL === 'function' && v.upperCanvasEl) { window.canvas = v; return v; }
      }
    }catch(_){}
    return null;
  }

  // Read export multiplier (HQ ×2 etc.)
  function getMultiplier(){
    const el = document.getElementById('exportMultiplier') || document.getElementById('exportQuality');
    if (el){
      const v = parseInt((el.value||el.textContent||'').replace(/\D+/g,''),10);
      if (v && v >= 1 && v <= 8) return v;
    }
    // fallback default
    return 2;
  }

  // Pick the "Open in New Tab" control by label
  function isOpenNewTabEl(node){
    const el = node && node.closest && node.closest('button,a');
    if (!el) return null;
    const t = (el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
    return (/^open in new tab$/.test(t) || /open.*new.*tab/.test(t)) ? el : null;
  }

  // Prevent native link from navigating current tab
  function neutralizeLinkHref(){
    const el = Array.from(document.querySelectorAll('a,button'))
      .find(n => /open\s*in\s*new\s*tab/i.test((n.textContent||'')));
    if (el && el.tagName === 'A'){
      if (!el.dataset.raSavedHref) el.dataset.raSavedHref = el.getAttribute('href') || '';
      el.setAttribute('href','javascript:void(0)');
      el.removeAttribute('target');
      el.setAttribute('rel','noopener');
    }
  }

  // New‑tab viewer that fits the image to the viewport
  function openNewTabViewer(){
    const c = findCanvas();
    if (!c){ alert('Canvas not ready'); return; }

    // Open the tab synchronously (popup‑safe)
    const win = window.open('', '_blank');
    if (!win){ alert('Popup blocked. Allow popups for this site.'); return; }
    win.document.title = 'Export';
    win.document.head.innerHTML = `
      <meta charset="utf-8">
      <title>Export</title>
      <style>
        html,body{height:100%;margin:0;background:#0b0c10;overflow:auto;}
        .viewer{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#0b0c10;}
        img#raImg{
          display:block;
          max-width:calc(100vw - 32px);
          max-height:calc(100vh - 32px);
          width:auto;height:auto;
          box-shadow:0 8px 24px rgba(0,0,0,.5);
          border-radius:8px;
          image-rendering:auto;
        }
        .hud{
          position:fixed;left:50%;bottom:10px;transform:translateX(-50%);
          color:#e5e7eb;opacity:.75;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
          background:rgba(0,0,0,.35);padding:6px 8px;border-radius:6px;user-select:none
        }
      </style>
    `;
    win.document.body.innerHTML = `
      <div class="viewer"><img id="raImg" alt="export"/></div>
      <div class="hud">Click image to toggle: Fit ↔ Actual size</div>
    `;

    try{
      const mult = getMultiplier();
      const dataUrl = c.toDataURL({ format:'png', multiplier: mult, enableRetinaScaling:true });
      const img = win.document.getElementById('raImg');
      img.src = dataUrl;

      // Fit ↔ Actual size toggle
      let fit = true;
      function applyFit(){
        if (fit){
          img.style.maxWidth  = 'calc(100vw - 32px)';
          img.style.maxHeight = 'calc(100vh - 32px)';
          img.style.width = 'auto';
          img.style.height = 'auto';
        } else {
          img.style.maxWidth  = 'none';
          img.style.maxHeight = 'none';
          img.style.width = 'auto';  // natural size
          img.style.height = 'auto';
        }
      }
      img.addEventListener('click', ()=>{ fit = !fit; applyFit(); });
      applyFit();
    }catch(e){
      win.document.body.innerHTML = '<div style="padding:14px;font:14px/1.4 -apple-system,Segoe UI,Arial;color:#e5e7eb">Export failed (CORS/security). Try a different image or use a CORS‑enabled host.</div>';
    }
  }

  // Capture click → always open in new tab viewer
  let lastAt = 0;
  function onClickCapture(e){
    const el = isOpenNewTabEl(e.target);
    if (!el) return;
    const now = Date.now();
    if (now - lastAt < 400){ e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); return false; }
    lastAt = now;

    e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation();
    openNewTabViewer();
    return false;
  }

  function wire(){ neutralizeLinkHref(); }

  wire();
  document.addEventListener('click', onClickCapture, true);
  new MutationObserver(wire).observe(document.body, { childList:true, subtree:true });
  document.addEventListener('ra:canvas-ready', () => { findCanvas(); });
})();

/* =========================================
   RA_MOBILE_FLOW_v28  — MOBILE ONLY (≤900px)
   - Canvas sits IN THE PAGE FLOW as the first box above “Rebel Ant”
   - Hides the old stage container (kills rogue checkerboard)
   - Proper Konva scaling (stage.scale + content size) so overlays drag correctly
   - Desktop untouched (code is gated by max-width:900px)
   ========================================= */
(() => {
  const CSS = `
    @media (max-width: 900px){
      #ra-mobile-stage-host{
        order:-1; width:100%;
        display:flex; justify-content:center;
        margin:12px 0 8px;
      }
      #ra-mobile-stage-frame{
        width: min(92vw, 620px);
        aspect-ratio: 1 / 1;
        position: relative;
        border-radius: 12px;
        overflow: hidden;
      }
      #ra-mobile-checker{
        position:absolute; inset:0; border-radius:inherit; pointer-events:none;
        background-image:
          linear-gradient(45deg, rgba(0,0,0,.35) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(0,0,0,.35) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(0,0,0,.35) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(0,0,0,.35) 75%);
        background-size: 24px 24px;
        background-position: 0 0, 0 12px, 12px -12px, -12px 0px;
      }
      /* Don’t CSS-scale the Konva wrapper; we size it numerically from JS */
      #ra-mobile-stage-frame > .konvajs-content,
      #ra-mobile-stage-frame > canvas{
        position:absolute; top:0; left:0; border-radius:inherit;
      }
      /* Kill any old floaters on mobile */
      .ra-canvas-floater,[data-ra-role="stage-floater"]{ display:none !important; }
    }`;
  const mq = window.matchMedia('(max-width: 900px)');

  let applied = false;
  let styleEl, host, frame, checker, live, origRoot, origRootDisplay;

  function $(q){ return document.querySelector(q); }
  function $$(q){ return Array.from(document.querySelectorAll(q)); }

  function findLive(){
    // Konva wrapper or plain canvas (whichever is used)
    return $('.konvajs-content') || $('#app canvas, .app canvas, main canvas');
  }
  function findUploadCard(){
    const h = $$('h1,h2,h3').find(n => /rebel\s*ant/i.test(n.textContent||''));
    return h ? (h.closest('.card, .panel, section, form, div') || h.parentElement) : null;
  }

  function fitStageIntoFrame(){
    if (!mq.matches || !window.stage || !frame) return;
    try{
      const baseW = window.stage.width();
      const baseH = window.stage.height();
      const side  = Math.max(baseW, baseH) || 1024;
      const target = frame.clientWidth;           // square frame

      // Scale the stage (Konva math, not CSS)
      const scale = target / side;
      window.stage.scale({ x: scale, y: scale });
      window.stage.position({ x: 0, y: 0 });

      // Make the DOM wrapper’s box match the visible size (keeps hit-testing correct)
      const content = window.stage.getContent();  // .konvajs-content
      content.style.width  = `${target}px`;
      content.style.height = `${target}px`;

      window.stage.batchDraw();
    }catch(e){}
  }

  function apply(){
    if (!mq.matches || applied) return;

    live = findLive();
    if (!live) return; // wait until canvas exists

    origRoot = live.parentElement;     // this is the old checkerboard container
    if (!origRoot) return;

    // build our in-flow host
    host = document.createElement('div');
    host.id = 'ra-mobile-stage-host';
    frame = document.createElement('div');
    frame.id = 'ra-mobile-stage-frame';
    checker = document.createElement('div');
    checker.id = 'ra-mobile-checker';
    frame.appendChild(checker);
    host.appendChild(frame);

    // insert BEFORE "Rebel Ant" card so it’s the first box
    const card = findUploadCard();
    const container = card?.parentElement || document.body;
    if (card) container.insertBefore(host, card); else container.prepend(host);

    // move live canvas into our frame
    frame.appendChild(live);

    // hide the old checkerboard container (this is the rogue strip you saw)
    origRootDisplay = origRoot.style.display;
    origRoot.style.display = 'none';

    // stop stage panning (base image stays put); overlays remain draggable
    try { window.stage?.draggable(false); } catch(e){}

    // size correctly now and on rotate/resize
    fitStageIntoFrame();

    applied = true;
  }

  function cleanup(){
    if (!applied) return;
    try{
      if (live && origRoot) origRoot.appendChild(live);
      if (origRoot) origRoot.style.display = origRootDisplay || '';
      host?.remove();
    }catch(e){}
    applied = false;
  }

  // — wiring —
  function kick(){
    if (mq.matches){ apply(); fitStageIntoFrame(); }
    else { cleanup(); }
  }

  // inject CSS once
  styleEl = document.getElementById('ra-mobile-flow-css-v28');
  if (!styleEl){
    styleEl = document.createElement('style');
    styleEl.id = 'ra-mobile-flow-css-v28';
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  // react to DOM changes (token loads later)
  const mo = new MutationObserver(() => { if (mq.matches && !applied) apply(); });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('resize', fitStageIntoFrame, {passive:true});
  window.addEventListener('orientationchange', () => setTimeout(fitStageIntoFrame, 200), {passive:true});
  mq.addEventListener?.('change', () => kick());

  // first run
  kick();
})();

/* ====================== RA_mobile_css_fit_inflow_v3 (MOBILE ONLY) ======================
   Fixes mobile crash + keeps the drawing in normal page flow.
   - Removes the bad "$$('.', wrap)" line that crashed Safari.
   - Fits the stage to the phone width via CSS only (exports stay crisp).
   - Hides any stray checkerboard strips and the fixed-layout ghost if present.
   - Never touches desktop.
   ====================================================================== */
(() => {
  const MQ = '(max-width: 920px)';
  if (!window.matchMedia(MQ).matches || window.__RA_MOBILE_CSS_FIT_V3__) return;
  window.__RA_MOBILE_CSS_FIT_V3__ = true;

  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const  $ = (s, r=document)=>r.querySelector(s);

  function findStageCanvas(){
    const all = $$('canvas');
    if (!all.length) return null;
    // pick the intrinsically largest canvas — that's the drawing stage
    return all.reduce((a,b)=> (b.width > (a?.width||0) ? b : a), null);
  }

  function hideGhostsAndStrips(wrap){
    // Kill the fixed-center “ghost” if it exists (causes the huge blank gap)
    const ghost = document.getElementById('raCanvasGhost');
    if (ghost){
      ghost.style.display = 'none';
      ghost.style.height  = '0px';
      ghost.style.margin  = '0';
      ghost.style.padding = '0';
      ghost.setAttribute('data-ra-hidden-gap', '1');
    }

    // Collapse any checkerboard/empty siblings right around the stage block
    [wrap?.previousElementSibling, wrap?.nextElementSibling].forEach(el => {
      if (!el) return;
      const cs = getComputedStyle(el);
      const looksChecker = (cs.backgroundImage||'').includes('linear-gradient')
                        || (cs.backgroundImage||'').includes('repeating');
      const looksEmpty = el.getBoundingClientRect().height < 12 || !(el.textContent||'').trim();
      if (looksChecker || looksEmpty){
        el.style.display = 'none';
        el.style.height  = '0';
        el.style.margin  = '0';
        el.style.padding = '0';
        el.setAttribute('data-ra-hidden-gap', '1');
      }
    });
  }

  function cssFit(){
    const stage = findStageCanvas();
    if (!stage) return;

    // Usually the stage’s parent div; fall back to the canvas itself
    const wrap = stage.parentElement || stage;

    // Intrinsic render size (used by export)
    const W = Math.max(1, stage.width);
    const H = Math.max(1, stage.height);

    // Available width inside page
    const host  = wrap.parentElement || document.body;
    const hostW = Math.max(320, host.clientWidth || window.innerWidth);
    const sidePad = 28; // layout breathing room
    const targetW = Math.min(W, hostW - sidePad);
    const scale   = Math.min(1, targetW / W);
    const dW      = Math.round(W * scale);
    const dH      = Math.round(H * scale);

    // View‑only sizing (do NOT change canvas.width/height)
    Object.assign(wrap.style, {
      width: dW + 'px',
      height: dH + 'px',
      maxWidth: '100%',
      margin: '0 auto 16px auto',
      position: 'relative'
    });

    // If the container holds multiple canvases (scene/hit), size them all
    $$('canvas', wrap).forEach(c => {
      c.style.width    = dW + 'px';
      c.style.height   = dH + 'px';
      c.style.maxWidth = '100%';
      c.style.display  = 'block';
    });

    hideGhostsAndStrips(wrap);
  }

  function bindLoadTriggers(){
    // Re-fit after real load actions
    const cards = $$('section,div').filter(n => (n.innerText||'').toLowerCase().includes('rebel ant'));
    cards.forEach(card => {
      $$('button', card).forEach(btn => {
        const t = (btn.textContent||'').toLowerCase().trim();
        if (t === 'load' || t === 'load by token' || t === 'clear upload'){
          if (!btn.__raFitBound){
            btn.__raFitBound = true;
            btn.addEventListener('click', () => setTimeout(cssFit, 60), {passive:true});
          }
        }
      });
      const file = $('input[type="file"]', card);
      if (file && !file.__raFitBound){
        file.__raFitBound = true;
        file.addEventListener('change', () => setTimeout(cssFit, 60), {passive:true});
      }
    });
  }

  // Observe DOM churns so the fit reapplies if the app re-renders
  new MutationObserver(() => { bindLoadTriggers(); cssFit(); })
    .observe(document.documentElement, { childList:true, subtree:true });

  window.addEventListener('resize',           () => { if (window.matchMedia(MQ).matches) cssFit(); }, {passive:true});
  window.addEventListener('orientationchange',() => setTimeout(cssFit, 150), {passive:true});

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { bindLoadTriggers(); cssFit(); }, {once:true});
  } else {
    bindLoadTriggers(); cssFit();
  }

  // Minimal CSS (mobile only) to make sure hidden gaps stay hidden
  const s = document.createElement('style');
  s.textContent = `
    @media ${MQ} {
      [data-ra-hidden-gap="1"] { display:none !important; height:0 !important; margin:0 !important; padding:0 !important; }
    }
  `;
  document.head.appendChild(s);
})();

/* ==================== RA_AI_QUOTE_v1 — “✨ Inspire me” (motivational quotes) ====================
   What this adds:
   • A button “✨ Inspire me” near your Custom Text controls
   • Each click adds (or replaces) a motivational quote on the canvas
   • Quotes are varied and avoid recent repeats (remembers 40 recent in localStorage)
   • Text is centered, wrapped to 80% of canvas width, with a readable outline
   • Uses your existing text controls (font, size, color, stroke) after insertion
   ============================================================================================== */
(() => {
  const RECENT_KEY = 'ra_ai_quotes_recent_v1';

  // ——— Small helpers ———
  const $  = (sel, r=document) => r.querySelector(sel);
  const $$ = (sel, r=document) => Array.from(r.querySelectorAll(sel));

  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
  }
  function pushRecent(q) {
    const arr = getRecent();
    arr.unshift(String(q).trim());
    // keep only the latest 40 unique
    const seen = new Set();
    const dedup = [];
    for (const s of arr) { if (!seen.has(s)) { seen.add(s); dedup.push(s); } }
    dedup.length = Math.min(dedup.length, 40);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(dedup)); } catch (_) {}
  }

  // ——— Quote generator (lightweight, but varied) ———
  const COMMANDS = [
    "Keep going", "Stay hungry", "Trust the process", "Outwork yesterday",
    "Start before you're ready", "Consistency compounds", "Progress over perfection",
    "Ship it", "Make it simple", "Play the long game", "No zero days",
    "Bet on yourself", "Stay curious", "Do the hard things", "Win the morning",
    "Keep showing up", "Build in public", "One brick at a time", "Move with purpose",
    "Be relentlessly resourceful", "Protect your momentum", "Take the stairs",
    "Create then iterate", "Make it a habit", "Focus beats talent",
    "Earn it daily", "Start now", "Prove it", "Own your time", "Small steps, big moves"
  ];
  const TAILS = [
    "small steps add up", "momentum beats perfect", "discipline is freedom",
    "tiny wins compound", "results love consistency", "courage over comfort",
    "1% better every day", "clarity comes from action", "done beats perfect",
    "practice makes progress", "keep the promise to yourself", "get uncomfortable",
    "dreams need deadlines", "start messy", "execute loudly",
    "be patient and persistent", "aim for better, not easy", "work the plan",
    "prove it with work", "show up for yourself", "stack your wins",
    "build the streak", "trust your future self", "act like it matters",
    "make room for greatness", "keep it moving", "focus and finish",
    "make today count", "finish strong", "do one more rep"
  ];
  const SEPS = [" — ", " · ", " — ", ": "]; // weighted toward em‑dash

  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  function makeQuote(attempt=0){
    const q = `${pick(COMMANDS)}${pick(SEPS)}${pick(TAILS)}.`;
    const recent = getRecent();
    if (!recent.includes(q)) return q;
    // Try a few times to avoid an immediate repeat
    return attempt < 60 ? makeQuote(attempt+1) : q;
  }

  // ——— Drop (or replace) quote on Fabric canvas ———
  function addOrReplaceQuote(){
    const c = window.canvas;
    if (!c || !window.fabric) { alert('Canvas not ready'); return; }

    const quote = makeQuote();
    const cw = c.getWidth(), ch = c.getHeight();
    const width = Math.round(cw * 0.84);

    // Size scales with canvas (feels right across 700/900/1024/1200)
    const defaultSize = Math.round(Math.max(28, Math.min(64, cw * 0.055)));

    // Prefer the current UI controls if present (so user style is respected)
    const family = ($('#fontFamily')||{}).value || "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif";
    const size   = parseInt(($('#fontSize')||{}).value||defaultSize, 10);
    const fill   = ($('#fontColor')||{}).value || "#ffffff";
    const stroke = ($('#strokeColor')||{}).value || "#000000";
    const swidth = parseInt(($('#strokeWidth')||{}).value||"2", 10);

    // If a custom text is selected, replace its contents; otherwise add a new one
    const active = c.getActiveObject();
    if (active && active._kind === 'customText') {
      active.text = quote;
      active.setCoords();
      c.requestRenderAll();
      pushRecent(quote);
      return;
    }

    const tb = new fabric.Textbox(quote, {
      left: cw/2, top: ch/2,
      originX: "center", originY: "center",
      width, textAlign: "center",
      fontFamily: family,
      fontSize: size,
      fill, stroke, strokeWidth: swidth,
      editable: true
    });
    tb._kind = 'customText';
    tb._raAiQuote = true;

    c.add(tb).setActiveObject(tb);
    // Keep token ID label on top if you use it
    try { if (typeof window.bringInterfaceToFront === 'function') window.bringInterfaceToFront(); } catch(_){}
    c.requestRenderAll();
    pushRecent(quote);
  }

  // ——— Inject the “✨ Inspire me” button into your existing UI ———
  function injectButton(){
    if (document.getElementById('raAiQuoteBtn')) return;

    // Try to place it next to your existing "Add" custom text button if present
    let anchor = document.getElementById('addCustomText');
    if (!anchor) {
      // Fall back to placing after the custom text input/textarea or in the same panel
      anchor = document.getElementById('customText') ||
               $$('input,textarea,button').find(b => /custom\s*text/i.test((b.id||b.textContent||'')));
    }
    if (!anchor) { setTimeout(injectButton, 300); return; }

    const btn = document.createElement('button');
    btn.id = 'raAiQuoteBtn';
    btn.textContent = '✨ Inspire me';
    btn.className = 'btn';
    btn.style.marginLeft = '8px';
    btn.style.cursor = 'pointer';

    // If your buttons use a "small" variant, mirror it
    if (anchor.classList.contains('small')) btn.classList.add('small');

    btn.addEventListener('click', addOrReplaceQuote);
    // Insert right after the anchor button/input
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }

  // Boot once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton, { once:true });
  } else {
    injectButton();
  }
})();

/* ================= RA_FONT_PICKER_CLEAN_V1 =================
   Shows friendly names in the font dropdown while keeping
   correct CSS font stacks as the actual values.
   Works for #fontFamily (Custom Text). If you also have an
   #idFontFamily picker for the token ID, it will apply there too.
   ========================================================== */
(function RA_FONT_PICKER_CLEAN_V1(){
  const FONTS = [
    { name: 'Impact',            stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
    { name: 'Arial Black',       stack: "'Arial Black', Gadget, sans-serif" },
    { name: 'Arial',             stack: "Arial, Helvetica, sans-serif" },
    { name: 'Helvetica Neue',    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
    { name: 'Verdana',           stack: "Verdana, Geneva, sans-serif" },
    { name: 'Tahoma',            stack: "Tahoma, Geneva, sans-serif" },
    { name: 'Trebuchet MS',      stack: "'Trebuchet MS', Helvetica, sans-serif" },
    { name: 'Georgia',           stack: "Georgia, 'Times New Roman', serif" },
    { name: 'Times New Roman',   stack: "'Times New Roman', Times, serif" },
    { name: 'Palatino',          stack: "Palatino, 'Palatino Linotype', serif" },
    { name: 'Garamond',          stack: "Garamond, Baskerville, 'Baskerville Old Face', 'Times New Roman', serif" },
    { name: 'Optima',            stack: "Optima, Segoe, 'Segoe UI', Candara, Calibri, Arial, sans-serif" },
    { name: 'Century Gothic',    stack: "'Century Gothic', AppleGothic, sans-serif" },
    { name: 'Gill Sans',         stack: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
    { name: 'Avenir',            stack: "Avenir, 'Avenir Next', 'Segoe UI', sans-serif" },
    { name: 'Copperplate',       stack: "Copperplate, 'Copperplate Gothic Light', fantasy" },
    { name: 'Papyrus',           stack: "Papyrus, fantasy" },
    { name: 'Brush Script MT',   stack: "'Brush Script MT', cursive" },
    { name: 'Lucida Sans',       stack: "'Lucida Sans Unicode','Lucida Grande', sans-serif" },
    { name: 'Lucida Console',    stack: "'Lucida Console', Monaco, monospace" },
    { name: 'Consolas',          stack: "Consolas, 'Lucida Console', Monaco, monospace" },
    { name: 'Courier',           stack: "Courier, 'Courier New', monospace" },
    { name: 'Menlo',             stack: "Menlo, Monaco, Consolas, 'Courier New', monospace" },
    { name: 'System UI',         stack: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial" }
  ];

  function applyToPicker(el){
    if (!el) return;

    // keep current value if it matches one of our stacks
    const current = (el.value || '').trim();
    const keep = FONTS.some(f => f.stack === current) ? current : null;

    // only repopulate if it's a <select> (so we keep existing listeners)
    if (el.tagName.toLowerCase() === 'select'){
      el.innerHTML = '';
      FONTS.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.stack;          // what fabric uses
        opt.textContent = f.name;     // what user sees
        el.appendChild(opt);
      });
      el.value = keep || FONTS[0].stack;

      // fire a change so the canvas updates if needed
      try { el.dispatchEvent(new Event('change', { bubbles:true })); } catch(_) {}
    } else {
      // if it’s an <input>, just ensure it has a sane default stack
      if (!keep) el.value = FONTS[0].stack;
    }
  }

  function run(){
    applyToPicker(document.getElementById('fontFamily'));   // Custom Text font
    applyToPicker(document.getElementById('idFontFamily')); // (optional) Token ID font, if present
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once:true });
  } else {
    run();
  }
})();

/* ================= RA_FONT_PICKER_PREVIEW_V2 =================
   - Clean labels in the font dropdown (no long stacks shown).
   - Each option is styled with its font (works in most desktop browsers).
   - Live preview box below the picker updates instantly.
   - Applies to #fontFamily (Custom Text) and, if present, #idFontFamily.
   ============================================================ */
(function RA_FONT_PICKER_PREVIEW_V2(){
  // Curated, cross‑platform stacks (Mac + Windows + Linux fallbacks).
  // Add/remove families freely; the dropdown will rebuild automatically.
  const FONTS = [
    { name:'Impact',              stack:"Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
    { name:'Arial Black',         stack:"'Arial Black', Gadget, sans-serif" },
    { name:'Arial',               stack:"Arial, Helvetica, sans-serif" },
    { name:'Helvetica Neue',      stack:"'Helvetica Neue', Helvetica, Arial, sans-serif" },
    { name:'Verdana',             stack:"Verdana, Geneva, sans-serif" },
    { name:'Tahoma',              stack:"Tahoma, Geneva, sans-serif" },
    { name:'Trebuchet MS',        stack:"'Trebuchet MS', Helvetica, sans-serif" },
    { name:'Segoe UI',            stack:"'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
    { name:'Calibri',             stack:"Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif" },
    { name:'Optima',              stack:"Optima, Segoe, 'Segoe UI', Candara, Calibri, Arial, sans-serif" },
    { name:'Avenir',              stack:"Avenir, 'Avenir Next', 'Segoe UI', sans-serif" },
    { name:'Futura',              stack:"Futura, 'Century Gothic', 'Gill Sans', Arial, sans-serif" },
    { name:'Gill Sans',           stack:"'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
    { name:'Century Gothic',      stack:"'Century Gothic', AppleGothic, sans-serif" },

    { name:'Georgia',             stack:"Georgia, 'Times New Roman', serif" },
    { name:'Times New Roman',     stack:"'Times New Roman', Times, serif" },
    { name:'Baskerville',         stack:"Baskerville, 'Baskerville Old Face', Garamond, 'Times New Roman', serif" },
    { name:'Garamond',            stack:"Garamond, Baskerville, 'Baskerville Old Face', 'Times New Roman', serif" },
    { name:'Palatino',            stack:"Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
    { name:'Didot',               stack:"Didot, 'Bodoni 72', 'Bodoni MT', 'Times New Roman', serif" },
    { name:'Rockwell',            stack:"Rockwell, 'Courier New', Georgia, serif" },

    { name:'Courier New',         stack:"'Courier New', Courier, monospace" },
    { name:'Menlo',               stack:"Menlo, Monaco, Consolas, 'Courier New', monospace" },
    { name:'Consolas',            stack:"Consolas, 'Lucida Console', Monaco, monospace" },
    { name:'Lucida Console',      stack:"'Lucida Console', Monaco, monospace" },

    { name:'Copperplate',         stack:"Copperplate, 'Copperplate Gothic Light', fantasy" },
    { name:'Papyrus',             stack:"Papyrus, fantasy" },
    { name:'Brush Script MT',     stack:"'Brush Script MT', cursive" },
    { name:'Comic Sans MS',       stack:"'Comic Sans MS', 'Comic Sans', Chalkboard, cursive" },

    // System UI stack for a clean, modern default on any platform:
    { name:'System UI',           stack:"system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }
  ];

  const PICKER_IDS = ['fontFamily', 'idFontFamily']; // second one is optional in your UI

  function ensurePreviewBelow(picker, id){
    const prevId = 'raPreview_' + id;
    let box = document.getElementById(prevId);
    if (!box) {
      box = document.createElement('div');
      box.id = prevId;
      box.style.cssText = [
        'margin-top:6px',
        'padding:8px 10px',
        'border:1px solid #2a2a2e',
        'border-radius:8px',
        'background:#111319',
        'color:#e7e7ea',
        'font-size:15px',
        'line-height:1.35',
        'letter-spacing:.1px'
      ].join(';');
      const label = document.createElement('div');
      label.textContent = 'Preview';
      label.style.cssText = 'font-size:11px;opacity:.65;margin-bottom:4px';
      const text = document.createElement('div');
      text.className = 'raPreviewText';
      text.textContent = 'AaBbCc 1234  #RebelAnts';
      box.appendChild(label);
      box.appendChild(text);
      // insert right after the picker
      picker.parentNode.insertBefore(box, picker.nextSibling);
    }
    return box.querySelector('.raPreviewText');
  }

  function repopulateSelect(selectEl, id){
    // Preserve previously selected stack if it exists
    const current = (selectEl.value || '').trim();

    // Clear & rebuild options
    selectEl.innerHTML = '';
    FONTS.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.stack;         // what Fabric/text actually uses
      opt.textContent = f.name;    // what the user sees
      // Live preview in dropdown (supported in most desktop browsers)
      opt.style.fontFamily = f.stack;
      opt.style.fontSize   = '14px';
      selectEl.appendChild(opt);
    });

    // Keep selection if still available, otherwise default to first
    const found = FONTS.find(f => f.stack === current);
    selectEl.value = found ? found.stack : FONTS[0].stack;

    // Preview box under the picker
    const previewText = ensurePreviewBelow(selectEl, id);
    const updatePreview = () => {
      previewText.style.fontFamily = selectEl.value || FONTS[0].stack;
      // text already set; we just switch the font
    };

    // Wire once
    if (!selectEl.__raFontPreviewBound){
      selectEl.addEventListener('change', updatePreview);
      selectEl.addEventListener('input',  updatePreview);
      selectEl.__raFontPreviewBound = true;
    }
    updatePreview();
  }

  function apply(){
    PICKER_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el || el.__raFontPreviewV2) return;
      el.__raFontPreviewV2 = true;

      if (el.tagName.toLowerCase() === 'select'){
        repopulateSelect(el, id);
      } else {
        // If your UI uses an <input> for fonts, just attach a preview box
        const previewText = ensurePreviewBelow(el, id);
        const update = () => { previewText.style.fontFamily = el.value || FONTS[0].stack; };
        el.addEventListener('input', update);
        el.addEventListener('change', update);
        update();
      }
    });
  }

  // Run now and watch for UI re-renders (defensive)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once:true });
  } else {
    apply();
  }
  new MutationObserver(apply).observe(document.documentElement, { childList:true, subtree:true });
})();

/* ============================ RA_WEBFONTS_LAZY_V1 ============================
   Adds Google web fonts to the existing font picker (and keeps live preview).
   - Injects a single Google Fonts CSS with many families (weights included).
   - Appends a <optgroup label="Web fonts"> to #fontFamily / #idFontFamily.
   - When you select a web font, waits for it to load, then re-renders Fabric.
   ========================================================================= */
(function RA_WEBFONTS_LAZY_V1(){
  // Configure your web fonts here (Google "family=" spec on the right)
  const WEB_FONTS = [
    { name:'Inter',             google:'Inter:wght@400;600;700' },
    { name:'Roboto',            google:'Roboto:wght@400;500;700' },
    { name:'Poppins',           google:'Poppins:wght@400;600;700' },
    { name:'Montserrat',        google:'Montserrat:wght@400;600;700' },
    { name:'Lato',              google:'Lato:wght@400;700' },
    { name:'Raleway',           google:'Raleway:wght@400;600;700' },
    { name:'Oswald',            google:'Oswald:wght@400;600;700' },
    { name:'Nunito',            google:'Nunito:wght@400;600;800' },
    { name:'Source Sans 3',     google:'Source+Sans+3:wght@400;600;700' },
    { name:'Merriweather',      google:'Merriweather:wght@400;700' },
    { name:'Playfair Display',  google:'Playfair+Display:wght@400;700' },
    { name:'Abril Fatface',     google:'Abril+Fatface' },
    { name:'Bebas Neue',        google:'Bebas+Neue' },
    { name:'Dancing Script',    google:'Dancing+Script:wght@400;600' },
    { name:'Pacifico',          google:'Pacifico' },
    { name:'Inconsolata',       google:'Inconsolata:wght@400;700' },
    { name:'Fira Code',         google:'Fira+Code:wght@400;600' },
    { name:'JetBrains Mono',    google:'JetBrains+Mono:wght@400;700' }
  ];

  const PICKERS = ['fontFamily','idFontFamily'];  // #idFontFamily is optional in your UI

  // -------- load Google Fonts CSS once
  function injectCssOnce(){
    if (document.getElementById('raWebFontsCSS')) return;
    const fam = WEB_FONTS.map(f => 'family=' + f.google).join('&');
    const href = 'https://fonts.googleapis.com/css2?' + fam + '&display=swap';

    // Preconnect (nice to have)
    if (!document.querySelector('link[rel="preconnect"][href*="fonts.gstatic"]')){
      const pre1 = document.createElement('link');
      pre1.rel = 'preconnect'; pre1.href = 'https://fonts.gstatic.com'; pre1.crossOrigin = 'anonymous';
      document.head.appendChild(pre1);
    }
    if (!document.querySelector('link[rel="preconnect"][href*="fonts.googleapis"]')){
      const pre2 = document.createElement('link');
      pre2.rel = 'preconnect'; pre2.href = 'https://fonts.googleapis.com';
      document.head.appendChild(pre2);
    }

    const link = document.createElement('link');
    link.id = 'raWebFontsCSS';
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);

    // After CSS parses & fonts load, nudge Fabric so metrics refresh
    const nudge = () => { try { window.canvas && window.canvas.requestRenderAll(); } catch(_){} };
    (document.fonts && document.fonts.ready ? document.fonts.ready.then(nudge) : Promise.resolve().then(nudge));
  }

  // Get a readable CSS stack for a given family (with sensible fallbacks)
  function stackFor(family){
    return `"${family}", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  }

  // Extract first family name from a stack (handles quotes)
  function firstFamily(stack){
    if (!stack) return '';
    const m = stack.match(/^["']?([^"',]+(?:\s[^"',]+)?)["']?/);
    return (m && m[1]) ? m[1].trim() : stack.split(',')[0].trim().replace(/^["']|["']$/g,'');
  }

  // Append an <optgroup> with all web fonts to a <select>
  function extendPicker(select){
    if (!select || select.tagName.toLowerCase() !== 'select') return;
    if (select.querySelector('optgroup[label="Web fonts"]')) return; // already extended

    const og = document.createElement('optgroup');
    og.label = 'Web fonts';
    WEB_FONTS.forEach(f => {
      const opt = document.createElement('option');
      opt.textContent = f.name;
      opt.value = stackFor(f.name);
      // style option with its own font (desktop browsers)
      opt.style.fontFamily = opt.value;
      opt.style.fontSize = '14px';
      og.appendChild(opt);
    });
    select.appendChild(og);

    // When a web font is chosen, wait for it to load then redraw Fabric
    if (!select.__raWebFontsBound){
      const onChange = async () => {
        const fam = firstFamily(select.value);
        try {
          if (document.fonts && fam) { await document.fonts.load(`48px "${fam}"`); }
        } catch(_){}
        try { window.canvas && window.canvas.requestRenderAll(); } catch(_){}
      };
      select.addEventListener('change', onChange);
      select.addEventListener('input', onChange);
      select.__raWebFontsBound = true;
    }
  }

  function apply(){
    injectCssOnce();
    PICKERS.forEach(id => {
      const el = document.getElementById(id);
      if (el) extendPicker(el);
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  } else {
    apply();
  }
  new MutationObserver(apply).observe(document.documentElement, { childList:true, subtree:true });
})();

/* ==========================================================
   RA_MAKE_VIDEO_TOKEN_ONLY_V1
   - Adds a bottom "Video (token-only)" panel.
   - Records a short WebM using an offscreen canvas (no layout changes).
   - Works only when the base image is a token (no watermark group).
   - Desktop & mobile safe. No changes to your Fabric canvas state.
   ========================================================== */
(() => {
  // ---------- Small helpers ----------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInOut = t => t<.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;

  function getFabricCanvas() {
    if (window.canvas && typeof window.canvas.toDataURL === 'function') return window.canvas;
    const el = $('canvas.lower-canvas') || $('canvas.upper-canvas') || $('canvas');
    if (!el) return null;
    // Try to find its Fabric instance
    for (const k in window) {
      try {
        const v = window[k];
        if (v && v.upperCanvasEl && typeof v.toDataURL === 'function') return v;
      } catch(_) {}
    }
    return null;
  }

  // Find the current base object and decide if it’s a token image (no corner stamps).
  function baseIsToken() {
    const c = getFabricCanvas();
    if (!c) return false;
    const base = (c.getObjects() || []).find(o => o && o._isBase === true);
    if (!base) return false;
    // Non-token path in your code builds a Group with two watermark children (raWM:true).
    // Token path uses a plain Image (no watermark group).
    if (base.type === 'image') return true;         // token (no watermarks)
    if (base.type === 'group') {
      const kids = (base._objects || []);
      const hasStamp = kids.some(k => k && (k.raWM || k._isWatermark || k.raPos));
      return !hasStamp; // if somehow no stamps, treat as token; but normally stamps exist
    }
    return false;
  }

  // Try to read a token id for naming (optional)
  function currentTokenId() {
    const box = $('#tokenIdDisplay') || $('#tokenIdInput');
    const raw = (box && (box.value || box.textContent) || '').trim();
    if (!raw) return '';
    const n = parseInt(raw.replace(/[^0-9]/g,''), 10);
    return Number.isFinite(n) ? String(n) : '';
  }

  // Snapshot the Fabric canvas as a high-quality PNG DataURL.
  // We upscale if needed to meet target size (multiplier capped to 3× for safety).
  function snapshotCanvasPNG(targetSide=720) {
    const c = getFabricCanvas();
    if (!c) throw new Error('Canvas not ready');
    const cw = c.getWidth(), ch = c.getHeight();
    const side = Math.max(cw, ch) || 1024;
    const mul = clamp(targetSide / side, 0.25, 3);
    // toDataURL ignores selection handles; exports clean artwork
    return c.toDataURL({ format:'png', enableRetinaScaling:true, multiplier: mul });
  }

  function chooseMimeType() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (const m of candidates) {
      if (MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
    }
    return ''; // no support
  }

  // Draw a Ken Burns style frame
  function drawKenBurns(ctx, img, tNorm, res, mode) {
    const W = img.naturalWidth  || img.width;
    const H = img.naturalHeight || img.height;
    // Base "cover" scale so the square video is fully covered
    const cover = Math.max(res / W, res / H);

    // Style profiles
    const zoomIn  = { z0: 1.05, z1: 1.20, pan: 'none' };
    const zoomOut = { z0: 1.20, z1: 1.05, pan: 'none' };
    const panLR   = { z0: 1.12, z1: 1.12, pan: 'lr' };
    const panTB   = { z0: 1.12, z1: 1.12, pan: 'tb' };
    const drift   = { z0: 1.10, z1: 1.18, pan: 'diag' };

    const prof = ({in:zoomIn,out:zoomOut,lr:panLR,tb:panTB,drift:drift})[mode] || zoomIn;

    const e = easeInOut(tNorm);
    const zoom = prof.z0 + (prof.z1 - prof.z0) * e; // smooth zoom

    // Allowed pan range to keep image covering the square after scaling
    const scaledW = W * cover * zoom;
    const scaledH = H * cover * zoom;
    const maxX = Math.max(0, (scaledW - res) / 2);
    const maxY = Math.max(0, (scaledH - res) / 2);

    let shiftX = 0, shiftY = 0;
    if (prof.pan === 'lr')   shiftX = -maxX + 2*maxX*e;
    if (prof.pan === 'tb')   shiftY = -maxY + 2*maxY*e;
    if (prof.pan === 'diag') { shiftX = -maxX + 2*maxX*e; shiftY =  maxY - 2*maxY*e; }

    ctx.save();
    ctx.clearRect(0,0,res,res);
    ctx.translate(res/2 + shiftX, res/2 + shiftY);
    ctx.scale(cover*zoom, cover*zoom);
    ctx.drawImage(img, -W/2, -H/2);
    ctx.restore();
  }

  async function makeVideo({style='in', seconds=5, size=720, statusEl, linkEl, buttonEl}) {
    // Gate: token only
    if (!baseIsToken()) {
      if (statusEl) statusEl.textContent = 'Token-only: load a token image first.';
      return;
    }

    // Snapshot once (clean export of canvas content)
    let dataURL;
    try {
      if (statusEl) statusEl.textContent = 'Preparing snapshot…';
      dataURL = snapshotCanvasPNG(size);
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Snapshot blocked (CORS). Use images with CORS headers/same-origin.';
      return;
    }

    // Build offscreen canvas for animation + recording
    const res = parseInt(size, 10) || 720;
    const fps = 30;
    const totalFrames = Math.max(10, Math.round(seconds * fps));

    const off = document.createElement('canvas');
    off.width = res; off.height = res;
    const ctx = off.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const img = new Image();
    img.src = dataURL;
    await new Promise((r, j) => { img.onload = r; img.onerror = j; });

    // Setup MediaRecorder
    const mime = chooseMimeType();
    if (!mime) {
      if (statusEl) statusEl.textContent = 'This browser cannot record WebM (try Chrome/Edge).';
      return;
    }
    const stream = off.captureStream(fps);
    const chunks = [];
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: res >= 1024 ? 7_000_000 : (res >= 720 ? 5_000_000 : 3_500_000)
    });
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const doneP = new Promise(resolve => { rec.onstop = resolve; });

    // Animate & record
    if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = 'Rendering…'; }
    if (statusEl) statusEl.textContent = 'Rendering video…';

    rec.start();
    const t0 = performance.now();
    let f = 0;

    const modes = { 'Zoom In':'in', 'Zoom Out':'out', 'Pan L→R':'lr', 'Pan T→B':'tb', 'Drift':'drift' };
    const modeKey = modes[style] || style;

    // Frame loop
    function frameLoop(now) {
      const t = Math.min(1, (now - t0) / (seconds * 1000));
      drawKenBurns(ctx, img, t, res, modeKey);
      f++;
      if (t < 1) {
        requestAnimationFrame(frameLoop);
      } else {
        // Pad a couple of frames at the end for encoders that like a tail
        setTimeout(() => rec.stop(), 60);
      }
    }
    requestAnimationFrame(frameLoop);

    await doneP;

    // Build blob + link
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);

    const tid = currentTokenId();
    const niceName = `rebel-ant${tid?`-token-${tid}`:''}-${modeKey}-${res}.webm`;

    if (linkEl) {
      linkEl.href = url;
      linkEl.download = niceName;
      linkEl.style.display = 'inline-block';
      linkEl.textContent = `Download ${niceName}`;
    }
    if (statusEl) statusEl.textContent = `Done (${Math.round(blob.size/1024)} KB).`;

    if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = 'Make Video (Token Only)'; }
  }

  // ---------- UI Panel ----------
  function ensurePanel() {
    if ($('#raVideoPanel')) return $('#raVideoPanel');

    // Try to place under an "Animate" or "Animation" section if it exists; else append to the main content.
    const anchorCard =
      $$('h3,h2').find(h => /animate|animation/i.test((h.textContent||'').toLowerCase()))?.parentElement
      || $('main') || $('.content') || document.body;

    const pane = document.createElement('section');
    pane.id = 'raVideoPanel';
    pane.style.cssText = 'margin:16px 0 28px 0;border:1px solid #222;border-radius:12px;background:#0d0e13;color:#e7e7ea;padding:12px';
    pane.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;font:600 14px/1.2 -apple-system,Segoe UI,Roboto,Arial">Video (token‑only)</h3>
        <span id="raVMsg" style="font:12px/1.2 -apple-system,Segoe UI,Roboto,Arial;opacity:.75"></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <label style="font-size:12px;opacity:.9">Style
          <select id="raVStyle" class="input" style="margin-left:6px">
            <option>Zoom In</option>
            <option>Zoom Out</option>
            <option>Pan L→R</option>
            <option>Pan T→B</option>
            <option selected>Drift</option>
          </select>
        </label>
        <label style="font-size:12px;opacity:.9">Duration
          <select id="raVDur" class="input" style="margin-left:6px">
            <option>3</option>
            <option selected>5</option>
            <option>8</option>
          </select> s
        </label>
        <label style="font-size:12px;opacity:.9">Size
          <select id="raVRes" class="input" style="margin-left:6px">
            <option>512</option>
            <option selected>720</option>
            <option>1024</option>
          </select> px
        </label>
        <button id="raVMake" class="btn" style="margin-left:auto;background:#3b82f6;border:0;border-radius:8px;color:#fff;padding:8px 12px;cursor:pointer">Make Video (Token Only)</button>
        <a id="raVDown" href="#" download style="display:none;margin-left:8px;font-size:12px;text-decoration:underline">Download</a>
      </div>
      <div style="margin-top:8px;font-size:11px;opacity:.65">Tip: Works when your base image was loaded by <em>Token</em>. PNG/URL uploads are blocked from video on purpose.</div>
    `;
    anchorCard.appendChild(pane);

    // Wire button
    const makeBtn = $('#raVMake', pane);
    const msg     = $('#raVMsg', pane);
    const downLn  = $('#raVDown', pane);
    makeBtn.addEventListener('click', async () => {
      downLn.style.display = 'none';
      if (!baseIsToken()) {
        msg.textContent = 'Token-only: load a token image first.';
        return;
      }
      const style = ($('#raVStyle', pane)?.value || 'Drift');
      const secs  = parseInt(($('#raVDur', pane)?.value || '5'), 10);
      const size  = parseInt(($('#raVRes', pane)?.value || '720'), 10);
      await makeVideo({ style, seconds: secs, size, statusEl: msg, linkEl: downLn, buttonEl: makeBtn });
    });

    // Live gate hint: update the message whenever canvas mutates (cheap observer)
    const c = getFabricCanvas();
    if (c && !c.__raVideoGateWired) {
      c.__raVideoGateWired = true;
      c.on('object:added',   () => { if ($('#raVideoPanel')) $('#raVMsg').textContent = ''; });
      c.on('object:removed', () => { if ($('#raVideoPanel')) $('#raVMsg').textContent = ''; });
    }

    return pane;
  }

  // Boot after DOM is ready
  function boot() {
    try { ensurePanel(); } catch(_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();

/* ==========================================================
   RA_WATERMARK_SWITCH_FOUNDATION_V1  — add-only, safe no-op
   What this gives you:
   • One switch to turn ON watermarking for the "Make Video" flow (later).
   • Safe preloading of the watermark as a dataURL (avoids CORS issues).
   • Works with your existing token‑gated video flow.
   • Does nothing until you flip enableVideoWM to true.

   How to enable later (ONE change):
   1) In CONFIG below, change enableVideoWM: false  →  true
   2) Done. No other code edits needed.

   Optional: override watermark via ?wm=https://…/your.png (same as images)
   ========================================================== */
(() => {
  if (window.__RA_WM_BOOTED__) return;
  window.__RA_WM_BOOTED__ = true;

  // ---------- CONFIG (flip these later if you want the watermark) ----------
  const CONFIG = {
    enableVideoWM: false,       // ← flip to true when you want watermark in videos
    wmWidthRatio: 0.12,         // each corner stamp is 12% of the canvas width
    marginRatio:  0.02          // ~2% margin from edges
  };

  // ---------- Watermark loader (robust + CORS-safe) ----------
  const queryWM = new URLSearchParams(location.search).get('wm');
  const candidates = [
    queryWM,                             // highest priority if provided
    '/assets/watermark.png?v=wm10',      // your current primary
    '/watermark.png?v=wm10'              // fallback
  ].filter(Boolean);

  const STATE = {
    url: null,
    img: null,        // HTMLImageElement (decoded from dataURL)
    dataURL: null     // dataURL of the watermark (same-origin safe)
  };

  async function fetchAsDataURL(url){
    const r = await fetch(url, { cache:'no-store', mode:'cors' });
    if (!r.ok) throw new Error('fetch failed');
    const b = await r.blob();
    return await new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.readAsDataURL(b);
    });
  }

  async function loadWatermark(){
    for (const u of candidates){
      try{
        const data = await fetchAsDataURL(u);
        const img  = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.crossOrigin = 'anonymous';
          im.src = data;
        });
        STATE.url = u; STATE.img = img; STATE.dataURL = data;
        return true;
      }catch(_){/* try next */}
    }
    return false;
  }

  function wmBox(w, h){
    const wmW = Math.max(16, Math.round(w * CONFIG.wmWidthRatio));
    const wmH = Math.round(STATE.img.height * (wmW / STATE.img.width));
    const m   = Math.max(6,  Math.round(w * CONFIG.marginRatio));
    return { wmW, wmH, m };
  }

  // Expose a tiny helper if we ever need to paint on a 2D canvas directly (not used today)
  function paintWMOnCtx(ctx, w, h){
    if (!STATE.img) return;
    const { wmW, wmH, m } = wmBox(w, h);
    try {
      // TL
      ctx.drawImage(STATE.img, m, m, wmW, wmH);
      // BR
      ctx.drawImage(STATE.img, w - m - wmW, h - m - wmH, wmW, wmH);
    } catch(_){}
  }

  // ---------- Fabric helpers: add/remove TEMP watermark objects on the live canvas ----------
  function baseIsToken(){
    const c = window.canvas; if (!c) return false;
    const base = (c.getObjects()||[]).find(o => o._isBase);
    if (!base) return false;
    // In your app: token base = plain Image; upload base = Group (image + 2 small stamps)
    return (base.type === 'image');
  }

  function addTempFabricWM(){
    const c = window.canvas;
    if (!c || !window.fabric || !STATE.img) return null;

    const cw = c.getWidth(), ch = c.getHeight();
    const { wmW, wmH, m } = wmBox(cw, ch);

    // Create two watermark images
    const tl = new fabric.Image(STATE.img, {
      left: m, top: m, selectable: false, evented: false
    });
    const br = new fabric.Image(STATE.img, {
      left: cw - m - wmW, top: ch - m - wmH, selectable: false, evented: false
    });
    const sX = wmW / STATE.img.width, sY = wmH / STATE.img.height;
    tl.scaleX = sX; tl.scaleY = sY;
    br.scaleX = sX; br.scaleY = sY;

    // Tag them so we can cleanly remove later
    tl._raTmpWM = br._raTmpWM = true;

    c.add(tl); c.add(br); c.requestRenderAll();
    return [tl, br];
  }

  function removeTempFabricWM(){
    const c = window.canvas; if (!c) return;
    (c.getObjects()||[]).filter(o => o._raTmpWM).forEach(o => c.remove(o));
    c.requestRenderAll();
  }

  // ---------- Gentle hook for "Make Video" button (no-op until you flip the switch) ----------
  async function ensureWMReady(){ if (!STATE.img) await loadWatermark(); }

  function waitForVideoDone(timeoutMs=60000){
    return new Promise(resolve => {
      const obs = new MutationObserver(() => {
        // heuristic: look for a .webm download link or a status that says done
        const link = document.querySelector('a[download$=".webm"], a[href$=".webm"]');
        const stat = document.getElementById('raAnimStatus');
        if (link || /done|saved|complete/i.test((stat?.textContent||'').toLowerCase())){
          try{ obs.disconnect(); }catch(_){}
          resolve();
        }
      });
      obs.observe(document.body, { childList:true, subtree:true, characterData:true });
      setTimeout(() => { try{ obs.disconnect(); }catch(_){}
        resolve();
      }, timeoutMs);
    });
  }

  function hookMakeVideoButton(){
    if (!CONFIG.enableVideoWM) return; // ← stays dormant until you flip the switch

    // Intercept clicks on any button/link that looks like "Make Video"
    const labels = ['make video','render video','animate','make preview','create video'];
    document.addEventListener('click', async (e) => {
      const el = e.target && e.target.closest && e.target.closest('button, a');
      if (!el) return;

      const t = (el.textContent || el.value || '').toLowerCase().trim();
      if (!labels.some(k => t.includes(k))) return;   // not our button
      if (!window.canvas) return;
      if (!baseIsToken()) return;                      // keep token‑gated semantics

      // Prepare watermark image
      await ensureWMReady();
      if (!STATE.img) return; // nothing to add

      // Add temp WM objects, let the app's own handler run, then remove when done
      addTempFabricWM();          // we do NOT preventDefault; original click proceeds
      waitForVideoDone(60000).then(removeTempFabricWM);
    }, true); // capture=true so we add WM before the app starts recording frames
  }

  // Boot
  hookMakeVideoButton();

  // Expose tiny API for future use (optional)
  window.raWatermark = Object.freeze({
    options: CONFIG,
    url: () => STATE.url,
    dataURL: () => STATE.dataURL,
    img: () => STATE.img,
    ready: ensureWMReady,
    paintOnCtx: paintWMOnCtx,
    addTempFabricWM,
    removeTempFabricWM
  });
})();

/* ==========================================================
   RA_UNDO_REDO_SAFE_MINI_V1
   • Super‑safe: never restores anything unless you click Undo/Redo.
   • Records snapshots after edits only (add/move/scale/rotate/remove).
   • Coalesces bursts (clear / multi‑adds) into one step.
   • Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Ctrl+Y) wired.
   • If your old Undo/Redo buttons exist, it uses them.
     If not, it adds a small row under “Selection”.
   • Does NOT touch desktop/mobile layout or exports.
   ========================================================== */
(() => {
  if (window.__RA_UNDO_SAFE_V1__) return;
  window.__RA_UNDO_SAFE_V1__ = true;

  const MAX = 60;
  const DRAFT_KEY = 'ra_draft_v1';

  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const defer = (fn, ms=0)=>setTimeout(fn, ms);

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }
  let c;
  let history = [];
  let idx = -1;

  // mute while restoring so we don't create snapshots during loadFromJSON
  let MUTE = 0;
  const isMuted = () => MUTE > 0;

  const EXTRA = [
    '_kind','_isBase','_isBgRect','raWM','raPos',
    'selectable','evented','hasControls',
    'lockMovementX','lockMovementY','lockScalingX','lockScalingY','lockRotation',
    'globalCompositeOperation','opacity','flipX','flipY'
  ];

  function serialize(){
    if (!c || isMuted()) return null;
    const j = c.toJSON(EXTRA);
    j.__w  = c.getWidth();
    j.__h  = c.getHeight();
    j.__vt = c.viewportTransform || [1,0,0,1,0,0];
    return JSON.stringify(j);
  }

  function restore(jsonStr, label=''){
    if (!c || !jsonStr) return;
    MUTE++;
    try{
      const data = JSON.parse(jsonStr);
      c.loadFromJSON(data, () => {
        try{
          if (data.__w && data.__h){ c.setWidth(data.__w); c.setHeight(data.__h); }
          if (Array.isArray(data.__vt)) c.setViewportTransform(data.__vt);

          // keep base/bg not selectable
          c.getObjects().forEach(o=>{
            if (o._isBase){
              o.selectable=false; o.evented=false; o.hasControls=false;
              o.lockMovementX=o.lockMovementY=o.lockScalingX=o.lockScalingY=o.lockRotation=true;
            }
          });

          c.requestRenderAll();
        } finally {
          MUTE--;
          refresh(label);
        }
      });
    } catch(_){
      MUTE--; refresh(label);
    }
  }

  function push(label=''){
    const s = serialize(); if (!s) return;
    // if we undid into the middle, drop the tail
    if (idx < history.length - 1) history = history.slice(0, idx + 1);
    if (history[idx] === s) { refresh(label); return; }
    history.push(s);
    if (history.length > MAX) history.shift();
    idx = history.length - 1;
    refresh(label);
  }

  function undo(){ if (idx <= 0) return; idx -= 1; restore(history[idx], 'Undo'); }
  function redo(){ if (idx >= history.length - 1) return; idx += 1; restore(history[idx], 'Redo'); }

  // ---------- UI ----------
  let ui = {};
  function ensureUI(){
    // If your previous buttons exist, wire them
    const existing = {
      undo: $('#raUndoBtn'),
      redo: $('#raRedoBtn'),
      save: $('#raSaveDraftBtn'),
      load: $('#raLoadDraftBtn'),
      clr : $('#raClearDraftBtn'),
      info: $('#raHistInfo')
    };
    if (existing.undo || existing.redo) {
      ui = existing;
      if (ui.undo) ui.undo.onclick = undo;
      if (ui.redo) ui.redo.onclick = redo;
      if (ui.save) ui.save.onclick = saveDraft;
      if (ui.load) ui.load.onclick = restoreDraft;
      if (ui.clr)  ui.clr.onclick  = ()=>{ localStorage.removeItem(DRAFT_KEY); refresh('Draft cleared'); };
      return;
    }

    // Else add a tiny row under “Selection”
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
    undoB.onclick = undo; redoB.onclick = redo;
    saveB.onclick = saveDraft; loadB.onclick = restoreDraft;
    clrB.onclick  = ()=>{ localStorage.removeItem(DRAFT_KEY); refresh('Draft cleared'); };
  }

  function refresh(msg=''){
    ensureUI();
    const canUndo = idx > 0;
    const canRedo = idx >= 0 && idx < history.length - 1;
    if (ui.undo) ui.undo.disabled = !canUndo;
    if (ui.redo) ui.redo.disabled = !canRedo;
    if (ui.load) ui.load.disabled = !localStorage.getItem(DRAFT_KEY);

    if (ui.undo) ui.undo.textContent = `Undo (${canUndo ? idx : 0})`;
    if (ui.redo) ui.redo.textContent = `Redo (${canRedo ? (history.length - 1 - idx) : 0})`;
    if (ui.info) ui.info.textContent = `History ${ idx + 1 } / ${ history.length }${msg ? ' • ' + msg : ''}`;
  }

  // ---------- Draft ----------
  function saveDraft(){ if (idx>=0){ try{ localStorage.setItem(DRAFT_KEY, history[idx]); refresh('Draft saved'); }catch(_){ refresh('Draft failed'); } } }
  function restoreDraft(){
    const j = localStorage.getItem(DRAFT_KEY);
    if (!j) return refresh('No draft');
    history = [j]; idx = 0; restore(j, 'Draft restored');
  }

  // ---------- Wiring (non‑invasive) ----------
  let burstTimer = null;
  function schedulePush(label){ if (isMuted()) return; if (burstTimer) return; burstTimer = setTimeout(()=>{ burstTimer=null; push(label); }, 40); }

  function wire(){
    c = C(); if (!c) return defer(wire, 120);
    ensureUI();

    // Take a baseline snapshot a moment after the app finishes initial setup
    defer(()=>{ push('Init'); }, 150);

    // Fabric events — safe, view‑only recording
    c.on('object:modified', ()=> schedulePush('Edit'));
    c.on('object:added',    (e)=>{ const o=e?.target; if (o && o._isBgRect) return; schedulePush('Add'); });
    c.on('object:removed',  ()=> schedulePush('Remove'));

    // Keyboard shortcuts (ignore when typing)
    document.addEventListener('keydown', (e)=>{
      const tag=(e.target&&e.target.tagName||'').toLowerCase();
      if (/^(input|textarea|select)$/.test(tag) || e.target?.isContentEditable) return;
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z' && !e.shiftKey){ e.preventDefault(); undo(); }
      else if (((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z' && e.shiftKey) ||
               ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='y')){ e.preventDefault(); redo(); }
    });

    // Canvas size dropdown → one snapshot around resize operations
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

/* ==========================================================
   RA_ANIMATE_PREVIEW_VIDEO_V3
   • Presets for: Everything (viewport), Base only, Overlays only.
   • Overlay presets now work even if "Everything" is selected (we auto-scope).
   • Bigger, clearer overlay motions; normalized slide distances (work on any size).
   • Added a chooseable Easing (Quad/Sine/Cubic/Back/Expo/Linear).
   • Preview safe: state restored; undo/redo not spammed.
   • Desktop/mobile layout untouched.
   ========================================================== */
(() => {
  if (window.__RA_ANIM_V3__) return; window.__RA_ANIM_V3__ = true;

  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  // ---------- Easings ----------
  const EASE = {
    linear: t => t,
    ioQuad: t => t<0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2,
    ioSine: t => -(Math.cos(Math.PI*t)-1)/2,
    ioCubic: t => t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2,
    ioBack: t => { const c1=1.70158, c2=c1*1.525; return t<0.5
      ? (Math.pow(2*t,2)*((c2+1)*2*t - c2))/2
      : (Math.pow(2*t-2,2)*((c2+1)*(2*t-2)+c2)+2)/2; },
    ioExpo: t => t===0?0 : t===1?1 : (t<0.5 ? Math.pow(2,20*t-10)/2 : (2 - Math.pow(2,-20*t+10))/2)
  };

  // ---------- Presets ----------
  // kind:'viewport' => whole scene via viewport (Everything).
  // kind:'overlays' => only overlays/text/token label (works even if What: Everything is selected).
  // kind:'base'     => base image only.
  // Viewport params: z (zoom), x/y (normalized pan: -0.1..+0.1).
  // Overlay/Base params: s (scale), rot (deg), alpha (0..1), dx/dy (px), dxN/dyN (normalized to W/H).
  const PRESETS = [
    // — Viewport / Everything —
    {id:'kb_in_ur',  name:'Ken Burns — in ↗',   kind:'viewport', ease:'ioSine',  from:{z:1.00,x:0.00,y:0.00},  to:{z:1.18,x:-0.06,y:-0.06}},
    {id:'kb_in_ul',  name:'Ken Burns — in ↖',   kind:'viewport', ease:'ioSine',  from:{z:1.00,x:0.00,y:0.00},  to:{z:1.18,x: 0.06,y:-0.06}},
    {id:'kb_in_dr',  name:'Ken Burns — in ↘',   kind:'viewport', ease:'ioSine',  from:{z:1.00,x:0.00,y:0.00},  to:{z:1.18,x:-0.06,y: 0.06}},
    {id:'kb_in_dl',  name:'Ken Burns — in ↙',   kind:'viewport', ease:'ioSine',  from:{z:1.00,x:0.00,y:0.00},  to:{z:1.18,x: 0.06,y: 0.06}},
    {id:'kb_out',    name:'Ken Burns — out',    kind:'viewport', ease:'ioSine',  from:{z:1.15,x:0.00,y:0.00},  to:{z:1.00,x: 0.00,y: 0.00}},
    {id:'pan_up',    name:'Pan up (slow)',      kind:'viewport', ease:'ioQuad',  from:{z:1.00,x:0.00,y: 0.06}, to:{z:1.00,x:0.00,y:-0.06}},
    {id:'pan_down',  name:'Pan down (slow)',    kind:'viewport', ease:'ioQuad',  from:{z:1.00,x:0.00,y:-0.06}, to:{z:1.00,x:0.00,y: 0.06}},
    {id:'pan_left',  name:'Pan left (slow)',    kind:'viewport', ease:'ioQuad',  from:{z:1.00,x: 0.06,y:0.00}, to:{z:1.00,x:-0.06,y:0.00}},
    {id:'pan_right', name:'Pan right (slow)',   kind:'viewport', ease:'ioQuad',  from:{z:1.00,x:-0.06,y:0.00}, to:{z:1.00,x: 0.06,y:0.00}},
    {id:'zoom_in',   name:'Zoom in (gentle)',   kind:'viewport', ease:'ioCubic', from:{z:1.00,x:0.00,y:0.00},  to:{z:1.15,x: 0.00,y: 0.00}},
    {id:'zoom_out',  name:'Zoom out (gentle)',  kind:'viewport', ease:'ioCubic', from:{z:1.12,x:0.00,y:0.00},  to:{z:1.00,x: 0.00,y: 0.00}},

    // — Overlays only —
    {id:'ov_pop',     name:'Overlays pop (scale)',           kind:'overlays', ease:'ioBack', from:{s:0.90},            to:{s:1.00}},
    {id:'ov_slide_up',name:'Overlays slide up',              kind:'overlays', ease:'ioSine', from:{dyN:0.14},          to:{dyN:0.00}},
    {id:'ov_slide_dn',name:'Overlays slide down',            kind:'overlays', ease:'ioSine', from:{dyN:-0.14},         to:{dyN:0.00}},
    {id:'ov_slide_l', name:'Overlays slide in ←',            kind:'overlays', ease:'ioSine', from:{dxN:-0.18},         to:{dxN:0.00}},
    {id:'ov_slide_r', name:'Overlays slide in →',            kind:'overlays', ease:'ioSine', from:{dxN: 0.18},         to:{dxN:0.00}},
    {id:'ov_fade',    name:'Overlays fade in',               kind:'overlays', ease:'ioCubic',from:{alpha:0.00},        to:{alpha:1.00}},
    {id:'ov_wiggle',  name:'Overlays tiny rotate',           kind:'overlays', ease:'ioSine', from:{rot:-5},            to:{rot:0}},
    {id:'ov_pop_big', name:'Overlays big pop (stronger)',    kind:'overlays', ease:'ioBack', from:{s:0.85},            to:{s:1.00}},

    // — Base only (optional fun) —
    {id:'base_nudge', name:'Base nudge (gentle zoom in)',     kind:'base',     ease:'ioSine', from:{s:1.00},          to:{s:1.06}},
    {id:'base_slide', name:'Base slide right a bit',          kind:'base',     ease:'ioQuad', from:{dxN:-0.06},       to:{dxN:0.00}}
  ];

  // ---------- UI dock ----------
  function ensureDock(){
    let dock = $('#raAnimDock');
    if (dock) return dock;

    const host = $$('h3').find(h=>/export/i.test((h.textContent||'').trim()))?.parentNode || document.body;
    dock = document.createElement('div');
    dock.id = 'raAnimDock';
    dock.style.cssText = 'margin:16px 0;padding:12px;border:1px solid #23242a;border-radius:12px;background:#0f1116;color:#e7e7ea';
    dock.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <strong>Animate</strong>
        <label style="display:flex;gap:6px;align-items:center">
          What:
          <select id="raAnimScope">
            <option value="all">Everything</option>
            <option value="base">Base only</option>
            <option value="overlays">Overlays only</option>
          </select>
        </label>
        <label style="display:flex;gap:6px;align-items:center">
          Preset:
          <select id="raAnimPreset"></select>
        </label>
        <label style="display:flex;gap:6px;align-items:center">
          Easing:
          <select id="raAnimEase">
            <option value="ioSine">Smooth (Sine)</option>
            <option value="ioQuad">Natural (Quad)</option>
            <option value="ioCubic">Rounded (Cubic)</option>
            <option value="ioBack">Bounce-back</option>
            <option value="ioExpo">Snappy (Expo)</option>
            <option value="linear">Linear</option>
          </select>
        </label>
        <label style="display:flex;gap:6px;align-items:center">
          Duration: <input id="raAnimDur" type="number" min="2" max="20" value="6" style="width:60px">s
        </label>
        <button id="raAnimPreview" class="btn small">Preview</button>
        <button id="raAnimExport"  class="btn small">Export video</button>
        <span id="raAnimMsg" style="font-size:12px;opacity:.75;"></span>
      </div>
      <video id="raAnimOut" style="display:none;margin-top:10px;max-width:100%;border-radius:8px" controls></video>
    `;
    host.appendChild(dock);

    // Fill presets
    const sel = $('#raAnimPreset', dock);
    PRESETS.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); });

    // Events
    $('#raAnimPreview', dock).onclick = ()=> run(false);
    $('#raAnimExport',  dock).onclick = ()=> run(true);
    $('#raAnimPreset',  dock).onchange = () => {
      const id = $('#raAnimPreset').value;
      const p  = PRESETS.find(x=>x.id===id);
      if (!p) return;
      // If user has Everything/Base but picked an overlay preset, auto-scope to overlays.
      const scopeEl = $('#raAnimScope');
      if (p.kind==='overlays' && scopeEl.value!=='overlays') {
        scopeEl.value = 'overlays';
        msg('Preset targets overlays → switched "What" to Overlays.');
      }
      // Prefer preset’s ease if it has one
      if (p.ease) $('#raAnimEase').value = p.ease;
    };

    return dock;
  }

  function msg(t){
    const m = $('#raAnimMsg');
    if (!m) return;
    m.textContent = t||'';
    if (t) setTimeout(()=>{ if ($('#raAnimMsg')===m) m.textContent=''; }, 2000);
  }

  // ---------- Helpers ----------
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;

  function findBaseObjs(c){ return (c.getObjects()||[]).filter(o => o._isBase && !o._isBgRect); }
  function findOverlayObjs(c){
    // overlays + custom text + tokenId label; exclude base/background
    return (c.getObjects()||[]).filter(o => !o._isBgRect && !o._isBase && (o._kind==='overlay' || o._kind==='customText' || o._kind==='tokenId'));
  }

  // ---------- Core ----------
  let running=false;
  async function run(record){
    const c=C(); if(!c){ alert('Canvas not ready'); return; }
    if (running) return;

    ensureDock();
    const scopeEl = $('#raAnimScope');
    const presetEl= $('#raAnimPreset');
    const easeEl  = $('#raAnimEase');
    const durSec  = clamp(parseFloat($('#raAnimDur')?.value||'6'),2,20);
    const dur     = Math.round(durSec*1000);

    const preset  = PRESETS.find(p=>p.id===presetEl.value) || PRESETS[0];
    const ease    = EASE[(easeEl?.value)||preset.ease||'ioQuad'] || EASE.ioQuad;
    let   scope   = scopeEl?.value || 'all';

    // Auto-scope overlays if user picked an overlay preset
    if (preset.kind==='overlays') scope = 'overlays';

    const baseObjs    = findBaseObjs(c);
    const overlayObjs = findOverlayObjs(c);

    if (scope==='base' && baseObjs.length===0){ msg('Load an image first'); return; }
    if (scope==='overlays' && overlayObjs.length===0){ msg('Add an overlay or text first'); return; }

    running=true; msg(record?'Recording…':'Playing…');

    // Save state
    const vt0 = (c.viewportTransform||[1,0,0,1,0,0]).slice();
    const active = c.getActiveObject(); c.discardActiveObject(); c.requestRenderAll();

    // Snapshots
    const snap = new Map();
    const store = o => snap.set(o, { left:o.left, top:o.top, scaleX:o.scaleX, scaleY:o.scaleY, angle:o.angle, opacity:o.opacity });

    const W=c.getWidth(), H=c.getHeight(), cx=W/2, cy=H/2;

    let targets = [];
    if (preset.kind==='viewport' && scope==='all'){
      targets = []; // viewport only
    } else if (scope==='base'){
      baseObjs.forEach(store); targets = baseObjs.slice();
    } else if (scope==='overlays'){
      overlayObjs.forEach(store); targets = overlayObjs.slice();
    }

    // Recording (optional)
    let rec, chunks=[];
    if (record){
      try{
        const stream = (c.lowerCanvasEl || c.upperCanvasEl).captureStream(30);
        rec = new MediaRecorder(stream, { mimeType:'video/webm;codecs=vp9' });
        rec.ondataavailable = e=>{ if (e.data && e.data.size) chunks.push(e.data); };
        rec.start();
      }catch(_){ msg('Recording not supported'); }
    }

    const t0 = performance.now(); let rafId=0;

    function applyViewport(z,xN,yN){
      const e = (1 - z) * cx + xN * W;
      const f = (1 - z) * cy + yN * H;
      c.setViewportTransform([z,0,0,z, e, f]);
    }

    function step(now){
      const raw = clamp((now - t0)/dur, 0, 1);
      const t   = ease(raw);

      if (preset.kind==='viewport' && scope==='all'){
        const z  = lerp(preset.from.z, preset.to.z, t);
        const xn = lerp(preset.from.x, preset.to.x, t);
        const yn = lerp(preset.from.y, preset.to.y, t);
        applyViewport(z, xn, yn);
      } else {
        const hasScale = (preset.from?.s!=null && preset.to?.s!=null);
        const hasRot   = (preset.from?.rot!=null && preset.to?.rot!=null);
        const hasAlpha = (preset.from?.alpha!=null && preset.to?.alpha!=null);

        const dx  = (preset.from?.dx!=null && preset.to?.dx!=null) ? lerp(preset.from.dx,  preset.to.dx,  t) : 0;
        const dy  = (preset.from?.dy!=null && preset.to?.dy!=null) ? lerp(preset.from.dy,  preset.to.dy,  t) : 0;
        const dxN = (preset.from?.dxN!=null && preset.to?.dxN!=null)? lerp(preset.from.dxN, preset.to.dxN, t) : 0;
        const dyN = (preset.from?.dyN!=null && preset.to?.dyN!=null)? lerp(preset.from.dyN, preset.to.dyN, t) : 0;

        const dpx = dx + dxN*W;
        const dpy = dy + dyN*H;

        const s   = hasScale ? lerp(preset.from.s,   preset.to.s,   t) : 1.0;
        const rot = hasRot   ? lerp(preset.from.rot, preset.to.rot, t) : 0;
        const a   = hasAlpha ? lerp(preset.from.alpha, preset.to.alpha, t) : null;

        targets.forEach(o=>{
          const o0 = snap.get(o); if(!o0) return;
          o.scaleX = o0.scaleX * s;
          o.scaleY = o0.scaleY * s;
          o.left   = o0.left + dpx;
          o.top    = o0.top  + dpy;
          if (hasRot)   o.angle   = o0.angle + rot;
          if (a!=null)  o.opacity = a * (o0.opacity==null?1:o0.opacity);
          o.setCoords();
        });
      }

      c.requestRenderAll();
      if (raw<1) { rafId = requestAnimationFrame(step); } else { finish(); }
    }

    function finish(){
      cancelAnimationFrame(rafId);
      if (rec){
        try{
          rec.onstop = ()=>{
            const blob = new Blob(chunks, {type:'video/webm'});
            const url  = URL.createObjectURL(blob);
            const vid  = $('#raAnimOut'); if (vid){ vid.style.display='block'; vid.src=url; vid.play().catch(()=>{}); }
            msg('Done. Use the video menu to download.');
          };
          rec.stop();
        }catch(_){}
      } else {
        msg('Done');
      }
      try { c.setViewportTransform(vt0); } catch(_){}
      targets.forEach(o=>{
        const s = snap.get(o); if(!s) return;
        o.left=s.left; o.top=s.top; o.scaleX=s.scaleX; o.scaleY=s.scaleY; o.angle=s.angle; o.opacity=s.opacity;
        o.setCoords();
      });
      if (active) try{ c.setActiveObject(active); }catch(_){}
      c.requestRenderAll();
      running=false;
    }

    requestAnimationFrame(step);
  }

  // Build UI now/when ready
  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ensureDock, {once:true});
  } else {
    ensureDock();
  }
})();

/* ================= RA_DISABLE_FIXED_CANVAS_ON_MOBILE_v1 =================
   Neutralizes RA_FIXED_CENTER_CANVAS_V1 on mobile only.
   - Reverts "position:fixed" styles on the canvas card.
   - Removes #raCanvasGhost spacer that causes the mid‑page blank gap.
   - Desktop unaffected.
   ======================================================================= */
(() => {
  const MQ = '(max-width: 920px)';
  if (!window.matchMedia(MQ).matches) return;

  function getCanvasCard(){
    const c = document.getElementById('c');
    if (!c) return null;
    return c.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper') || c.parentElement;
  }

  function unfix(){
    const card  = getCanvasCard();
    const ghost = document.getElementById('raCanvasGhost');

    if (ghost){
      ghost.remove(); // this is the big blank spacer
    }
    if (card){
      Object.assign(card.style, {
        position:'', zIndex:'', margin:'', left:'', top:'', right:'', transform:'', width:''
      });
      // mark so the desktop fixer (if any) won’t reapply while on mobile
      card.setAttribute('data-ra-mobile-inflow','1');
    }
  }

  function run(){ if (window.matchMedia(MQ).matches) unfix(); }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run, {once:true});
  } else {
    run();
  }
  window.addEventListener('resize',           run, {passive:true});
  window.addEventListener('orientationchange',() => setTimeout(run, 100), {passive:true});
})();

/* ================= RA_HIDE_TOKEN_VIDEO_PANEL_v1 ================= */
(() => {
  function hide() {
    // Remove by ID if it exists
    const el = document.getElementById('raVideoPanel');
    if (el) el.remove();

    // Fallback: hide any card whose heading says “Video (token‑only)”
    Array.from(document.querySelectorAll('h2,h3')).forEach(h => {
      const t = (h.textContent || '').toLowerCase();
      if (t.includes('video') && t.includes('token')) {
        const card = h.closest('section,div') || h.parentElement;
        if (card) card.style.display = 'none';
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hide, { once:true });
  } else { hide(); }
  new MutationObserver(hide).observe(document.documentElement, { childList:true, subtree:true });
})();

/* ==========================================================
   RA_WM_CENTER_ADMIN_NO_STAMPS_V2
   • Removes corner stamps from EVERY new/old base or overlay.
     (We strip the stamp children out of the group; no re-centering bugs.)
   • One centered watermark layer with admin-only controls.
     - Enable/disable
     - Show on Tokens
     - Show on Uploads
     - Opacity + Size (width % of canvas)
   • No dependency on your Undo/Redo patch and no overrides.
     (We never touch window.raHist and we don’t replace base objects.)
   ========================================================== */
(() => {
  if (window.__RA_WM_CENTER_ADMIN_NO_STAMPS_V2__) return;
  window.__RA_WM_CENTER_ADMIN_NO_STAMPS_V2__ = true;

  // ---------- helpers ----------
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const isAdmin = /\badmin=1\b/i.test(location.search);

  // ---------- persisted state ----------
  const KEY = 'ra_wm_center_admin_v2';
  const STATE = {
    enabled: true,
    showOnTokens:  true,
    showOnUploads: true,
    opacity: 0.18,
    sizePct: 0.88,                         // watermark width as % of canvas width
    img: null,
    dataURL: null
  };
  try { Object.assign(STATE, JSON.parse(localStorage.getItem(KEY)||'{}')); } catch(_){}
  const save = ()=>{ try {
    localStorage.setItem(KEY, JSON.stringify({
      enabled:STATE.enabled,
      showOnTokens:STATE.showOnTokens,
      showOnUploads:STATE.showOnUploads,
      opacity:STATE.opacity,
      sizePct:STATE.sizePct
    }));
  } catch(_){} };

  // ---------- load watermark image (same precedence you’ve used) ----------
  const queryWM = new URLSearchParams(location.search).get('wm');
  const CAND = [ queryWM, '/assets/watermark.png?v=wm10', '/watermark.png?v=wm10' ].filter(Boolean);

  async function fetchAsDataURL(u){
    const r = await fetch(u, { cache:'no-store', mode:'cors' });
    if (!r.ok) throw new Error('x');
    const b = await r.blob();
    return await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); });
  }
  async function ensureWM(){
    if (STATE.img) return true;
    for (const u of CAND){
      try{
        const data = await fetchAsDataURL(u);
        const im = await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.crossOrigin='anonymous'; i.src=data; });
        STATE.img = im; STATE.dataURL = im.src; return true;
      }catch(_){}
    }
    return false;
  }

  // ---------- identify base type ----------
  function findBase(c){
    return (c.getObjects()||[]).find(o => o && o._isBase && !o._isBgRect) || null;
  }
  function baseIsToken(base){
    // In your app: tokens were plain Image, uploads were Group.
    // We keep that invariant by stripping stamp children in-place.
    return !!(base && base.type === 'image');
  }

  // ---------- strip corner-stamp children from a group ----------
  function isStamp(o){ return !!(o && (o._isWatermark || o.raWM || o.raPos)); }

  function stripStampsFromGroup(g){
    if (!g || g.type!=='group') return false;
    const kids = (g._objects||[]);
    const has = kids.some(isStamp);
    if (!has) return false;

    // remove only the stamp children; keep the main image and group transform
    kids.slice().forEach(k => { if (isStamp(k)) g.remove(k); });
    try {
      g._calcBounds && g._calcBounds();
      g._updateObjectCoords && g._updateObjectCoords();
      g.dirty = true; g.setCoords();
    } catch(_){}
    return true;
  }

  function cleanCornerStamps(c){
    if (!c) return;
    (c.getObjects()||[]).forEach(o=>{
      if (o.type==='group') stripStampsFromGroup(o);
    });
    c.requestRenderAll();
  }

  // ---------- centered watermark layer ----------
  function ensureCenteredWM(c){
    if (!c || !STATE.img) return;

    const base = findBase(c);
    const hasBase = !!base;
    const isToken = baseIsToken(base);

    const shouldShow =
      STATE.enabled &&
      hasBase &&
      ((isToken && STATE.showOnTokens) || (!isToken && STATE.showOnUploads));

    let wm = (c.getObjects()||[]).find(o => o && o._raWMCenter);
    if (!shouldShow){
      if (wm){ c.remove(wm); c.requestRenderAll(); }
      return;
    }

    if (!wm){
      wm = new fabric.Image(STATE.img, {
        originX:'center', originY:'center',
        left:c.getWidth()/2, top:c.getHeight()/2,
        selectable:false, evented:false, hasControls:false,
        _raWMCenter:true, _raSys:true
      });
      c.add(wm);
    }

    const targetW = clamp(Math.round(c.getWidth()*STATE.sizePct), 16, c.getWidth()*1.4);
    const s = targetW / (STATE.img.width||targetW);
    wm.scaleX = s; wm.scaleY = s;
    wm.opacity = clamp(STATE.opacity, 0, 1);
    wm.left = c.getWidth()/2; wm.top = c.getHeight()/2;
    wm.setCoords();
    c.bringToFront(wm);
    c.requestRenderAll();
  }

  // ---------- admin dock (only with ?admin=1) ----------
  function ensureAdminDock(){
    if (!isAdmin) return;

    if ($('#raWmCenterDock')) return;
    const holder =
      $$('h3').find(h=>/selection/i.test((h.textContent||'').trim()))?.parentNode
      || $$('h3').find(h=>/export/i.test((h.textContent||'').trim()))?.parentNode
      || document.body;

    const pane = document.createElement('div');
    pane.id = 'raWmCenterDock';
    pane.style.cssText = 'margin:12px 0;border:1px solid #23242a;border-radius:12px;background:#0f1116;color:#e7e7ea;padding:10px';
    pane.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong>Watermark</strong>
        <div style="display:flex;gap:6px">
          <button id="raWmCRefresh" class="btn small">Refresh</button>
          <button id="raWmCHide" class="btn small">Hide</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center">
        <label><input id="raWmCEnabled" type="checkbox"> Enabled</label>
        <label><input id="raWmCOnTok"  type="checkbox"> Show on tokens</label>
        <label><input id="raWmCOnUp"   type="checkbox"> Show on uploads</label>
        <label style="display:flex;align-items:center;gap:6px">Opacity
          <input id="raWmCOpacity" type="range" min="0" max="1" step="0.01" style="width:140px">
        </label>
        <label style="display:flex;align-items:center;gap:6px">Size (width %)
          <input id="raWmCSize" type="range" min="0.3" max="1.2" step="0.01" style="width:160px">
        </label>
      </div>
      <div style="margin-top:6px;font-size:11px;opacity:.65">Corner stamps are removed automatically from base & overlays.</div>
    `;
    holder.appendChild(pane);

    $('#raWmCEnabled').checked   = !!STATE.enabled;
    $('#raWmCOnTok').checked     = !!STATE.showOnTokens;
    $('#raWmCOnUp').checked      = !!STATE.showOnUploads;
    $('#raWmCOpacity').value     = STATE.opacity;
    $('#raWmCSize').value        = STATE.sizePct;

    const c = C();
    const sync = ()=>{ save(); ensureCenteredWM(c); };

    $('#raWmCEnabled').onchange = e=>{ STATE.enabled = !!e.target.checked; sync(); };
    $('#raWmCOnTok').onchange   = e=>{ STATE.showOnTokens  = !!e.target.checked; sync(); };
    $('#raWmCOnUp').onchange    = e=>{ STATE.showOnUploads = !!e.target.checked; sync(); };
    $('#raWmCOpacity').oninput  = e=>{ STATE.opacity = clamp(parseFloat(e.target.value||'0.18'),0,1); sync(); };
    $('#raWmCSize').oninput     = e=>{ STATE.sizePct = clamp(parseFloat(e.target.value||'0.88'),0.3,1.2); sync(); };
    $('#raWmCRefresh').onclick  = sync;
    $('#raWmCHide').onclick     = ()=>{ pane.style.display='none'; };
  }

  // ---------- boot & wiring ----------
  async function boot(){
    await ensureWM();
    const c = C(); if (!c) return;

    // 1) immediately remove any stamp-children already present
    cleanCornerStamps(c);

    // 2) watermark in correct state
    ensureCenteredWM(c);

    // 3) watch for future adds/mods
    if (!c.__raNoStampsV2){
      c.__raNoStampsV2 = true;

      c.on('object:added', (e)=>{
        const t = e?.target;
        if (!t) return;

        if (t.type==='group'){
          if (stripStampsFromGroup(t)) c.requestRenderAll();
        }
        // keep WM consistent
        ensureCenteredWM(c);
      });

      c.on('object:modified', ()=> ensureCenteredWM(c));
      c.on('object:removed',  ()=> ensureCenteredWM(c));
    }

    // 4) keep WM scaled if canvas element resizes
    try {
      const el = c.getElement ? c.getElement() : (c.wrapperEl || c.upperCanvasEl);
      new ResizeObserver(()=> ensureCenteredWM(c)).observe(el);
    } catch(_) {}

    // 5) admin UI
    ensureAdminDock();
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();

/* ==========================================================
   RA_FIX_UPLOAD_RECENTER_AFTER_STRIP_V1
   Keeps newly added base/overlay groups centered after the
   corner-stamp children are removed.
   - Runs after the existing watermark/no-stamps patch.
   - No impact on Undo/Redo (we just correct the initial add).
   ========================================================== */
(() => {
  if (window.__RA_FIX_RECENTER_V1__) return;
  window.__RA_FIX_RECENTER_V1__ = true;

  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function centerIfMoved(o){
    const c = C(); if (!c || !o) return;
    if (o.type !== 'group') return;
    // Only care about our base group or overlay groups created by the builder.
    if (!o._isBase && o._kind !== 'overlay') return;

    const cw = c.getWidth(), ch = c.getHeight();
    const cp = (typeof o.getCenterPoint === 'function')
      ? o.getCenterPoint()
      : new fabric.Point(o.left || 0, o.top || 0);

    // If center drifted by more than a few pixels, put it back in the middle.
    if (Math.abs(cp.x - cw/2) > 4 || Math.abs(cp.y - ch/2) > 4){
      try{
        o.set({ originX: 'center', originY: 'center' });
        if (o.setPositionByOrigin) {
          o.setPositionByOrigin(new fabric.Point(cw/2, ch/2), 'center', 'center');
        } else {
          o.left = cw/2; o.top = ch/2;
        }
        o.setCoords();
        c.requestRenderAll();
      }catch(_){}
    }
  }

  function fixExisting(){
    const c = C(); if (!c) return;
    (c.getObjects() || []).forEach(centerIfMoved);
  }

  function wire(){
    const c = C(); if (!c) { setTimeout(wire, 120); return; }

    // Correct anything already on the canvas (e.g., immediately after an upload)
    setTimeout(fixExisting, 30);

    // After any object is added, correct the center once the other listener strips stamps.
    if (!c.__raFixRecenterBound){
      c.__raFixRecenterBound = true;
      c.on('object:added', (e) => {
        const t = e && e.target;
        if (!t) return;
        // Defer to allow the stamp-stripper to finish, then re-center if needed.
        setTimeout(() => centerIfMoved(t), 0);
      });
    }

    // If the canvas element resizes, keep the base centered.
    try {
      const el = c.getElement ? c.getElement() : (c.wrapperEl || c.upperCanvasEl);
      new ResizeObserver(() => setTimeout(fixExisting, 0)).observe(el);
    } catch(_){}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
})();

/* ==========================================================
   RA_ADMIN_OVERLAYS_LIVE_V2
   - Live refresh of "Published Overlays" after Publish.
   - Admin-only delete (×) on published tiles.
   - No changes to non-admin users.
   ========================================================== */
(() => {
  if (window.__RA_ADMIN_OVERLAYS_LIVE_V2__) return;
  window.__RA_ADMIN_OVERLAYS_LIVE_V2__ = true;

  const KEY = 'ra2_published';
  const isAdmin = /\badmin=1\b/i.test(location.search);

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function getShelf(){
    try { return JSON.parse((localStorage||sessionStorage).getItem(KEY) || '[]'); }
    catch(_) { return []; }
  }
  function setShelf(arr){
    try { (localStorage||sessionStorage).setItem(KEY, JSON.stringify(arr||[])); } catch(_){}
  }

  // Minimal overlay adder (in case we rebuild the grid ourselves)
  function addOverlayFromDataURL(dataURL){
    try{
      const c = window.canvas; if (!c || !window.fabric) return;
      fabric.Image.fromURL(dataURL, img => {
        const cw=c.getWidth(), ch=c.getHeight();
        img.set({ originX:'center', originY:'center' });
        const maxDim = Math.min(cw, ch) * 0.60;
        const iw = img.width||maxDim, ih = img.height||maxDim;
        const sc = Math.min(1, maxDim / Math.max(iw, ih));
        if (isFinite(sc) && sc>0) img.scale(sc);
        img._kind = 'overlay';
        c.add(img);
        img.set({ left:cw/2, top:ch/2 }); img.setCoords();
        c.setActiveObject(img);
        try { window.bringInterfaceToFront && window.bringInterfaceToFront(); } catch(_){}
        c.requestRenderAll();
      }, { crossOrigin:'anonymous' });
    }catch(_){}
  }

  // Rebuild the Published Overlays grid (safe even if original drawer already ran)
  function drawShelf(){
    const wrap = $('#ra2ShelfGrid');
    if (!wrap) { setTimeout(drawShelf, 200); return; }

    const items = getShelf();
    wrap.innerHTML = '';
    items.forEach((item, idx) => {
      const tile = document.createElement('div');
      tile.style.cssText =
        'position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;text-align:center;cursor:pointer;';
      tile.innerHTML = `
        <div style="height:80px;display:flex;align-items:center;justify-content:center;">
          <img src="${item.dataURL}" alt="${item.name||''}" style="max-width:100%;max-height:80px;"/>
        </div>
        <div style="font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${item.name||''}
        </div>
      `;

      // Click = add overlay (ignore if clicking the delete button)
      tile.addEventListener('click', (ev) => {
        if (ev.target && ev.target.closest && ev.target.closest('.raDelPub')) return;
        addOverlayFromDataURL(item.dataURL);
      });

      // Admin-only: delete from shelf
      if (isAdmin){
        const del = document.createElement('button');
        del.className = 'raDelPub';
        del.title = 'Remove from Published';
        del.textContent = '×';
        del.style.cssText =
          'position:absolute;top:4px;right:6px;background:#2a2a2e;border:0;color:#ddd;border-radius:6px;padding:2px 6px;cursor:pointer;';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          const arr = getShelf();
          arr.splice(idx, 1);
          setShelf(arr);
          drawShelf();
        });
        tile.appendChild(del);
      }

      wrap.appendChild(tile);
    });
  }

  // After "Publish" in the Admin Overlays dock, refresh shelf immediately.
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('button');
    if (!btn) return;
    const txt = (btn.textContent || '').toLowerCase();
    // The Admin Overlays dock buttons include "Publish"
    if (/^publish$/.test(txt) || /publish/.test(txt)) {
      // Give the original handler a tick to write localStorage, then redraw.
      setTimeout(drawShelf, 50);
    }
  }, true);

  // Keep the shelf in sync if some other code mutates the DOM around it.
  new MutationObserver(() => { /* cheap keep-alive */ }).observe(document.body, { childList:true, subtree:true });

  // Initial render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', drawShelf, { once:true });
  } else {
    drawShelf();
  }
})();

/* ==========================================================
   RA_CURVED_TEXT_V1
   - Curved text for Fabric: toggle on/off + live controls.
   - Integrates with your existing Custom Text controls.
   - Tagged as _kind:'customText' so Animate includes it.
   - Desktop/mobile safe; no layout changes.
   ========================================================== */
(() => {
  if (window.__RA_CURVED_TEXT_V1__) return; window.__RA_CURVED_TEXT_V1__ = true;

  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function styleFromUI(){
    return {
      fontFamily: ($('#fontFamily')||{}).value || "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
      fontSize:   parseInt(($('#fontSize')||{}).value||'48',10),
      fill:       ($('#fontColor')||{}).value || '#ffffff',
      stroke:     ($('#strokeColor')||{}).value || 'transparent',
      strokeWidth:parseInt(($('#strokeWidth')||{}).value||'0',10)
    };
  }

  function isCurved(o){ return !!(o && (o._raCurved || o?.data?.raType==='curvedText')); }
  function plainText(o){
    if (!o) return '';
    if (o.type==='textbox' || o.type==='text') return String(o.text||'');
    if (isCurved(o)) return (o._objects||[]).map(g=>g.text||'').join('');
    return '';
  }

  // Build a curved text group (center-origin)
  function buildCurved(text, opts){
    const c=C(); const cw=c?c.getWidth():700, ch=c?c.getHeight():700, side=Math.min(cw,ch);
    const radius  = Math.round((opts?.radius ?? side*0.35));
    const arc     = (opts?.arc    ?? 180);
    const start   = (opts?.start  ?? 0);
    const spacing = (opts?.spacing?? 0);         // px-ish fudge
    const inward  = !!(opts?.inward);
    const st      = opts?.style || styleFromUI();

    const chars = Array.from(String(text||''));
    const N     = Math.max(chars.length, 1);
    const step  = (N>1 ? arc/(N-1) : 0) + (spacing/Math.max(radius,1))*(180/Math.PI);
    const startDeg = start - arc/2;

    const kids=[];
    for (let i=0;i<N;i++){
      const ch = new fabric.Text(chars[i] || ' ', {
        originX:'center', originY:'center',
        fontFamily: st.fontFamily, fontSize: st.fontSize,
        fill: st.fill, stroke: st.stroke, strokeWidth: st.strokeWidth,
        selectable:false, evented:false
      });
      const ang = (startDeg + i*step) * Math.PI/180;
      ch.left  = radius * Math.cos(ang);
      ch.top   = radius * Math.sin(ang);
      ch.angle = (startDeg + i*step) + (inward ? -90 : 90);
      ch.data  = Object.assign({}, ch.data, { raGlyph:true });
      kids.push(ch);
    }

    const g = new fabric.Group(kids, { originX:'center', originY:'center' });
    g._kind = 'customText';
    g._raCurved = true;
    g.raCurve = { text:String(text||''), radius, arc, start, spacing, inward };
    g.data = Object.assign({}, g.data, { raType:'curvedText', raCurve:g.raCurve });
    return g;
  }

  function replaceObject(newObj, oldObj){
    const c=C(); if(!c) return;
    const ctr = oldObj.getCenterPoint ? oldObj.getCenterPoint() : new fabric.Point(oldObj.left||0, oldObj.top||0);
    newObj.set({ left: ctr.x, top: ctr.y });
    newObj.setCoords();
    c.remove(oldObj); c.add(newObj); c.setActiveObject(newObj); c.requestRenderAll();
  }

  function toCurved(o){
    const st = {
      fontFamily: o.fontFamily || styleFromUI().fontFamily,
      fontSize:   o.fontSize   || styleFromUI().fontSize,
      fill:       o.fill       || styleFromUI().fill,
      stroke:     o.stroke     || styleFromUI().stroke,
      strokeWidth:o.strokeWidth|| styleFromUI().strokeWidth
    };
    const vals = readUI();
    const g = buildCurved(plainText(o), { radius: vals.radius, arc: vals.arc, start: vals.start, spacing: vals.spacing, inward: vals.flip, style: st });
    replaceObject(g, o); reflectUI(g);
  }

  function toLinear(g){
    const c=C(); const s=styleFromUI();
    const tb = new fabric.Textbox(plainText(g), {
      originX:'center', originY:'center',
      width: Math.floor(c.getWidth()*0.8), textAlign:'left',
      fontFamily:s.fontFamily, fontSize:s.fontSize, fill:s.fill, stroke:s.stroke, strokeWidth:s.strokeWidth,
      editable:true
    });
    tb._kind='customText';
    replaceObject(tb, g); reflectUI(tb);
  }

  function updateCurved(g, nextPart){
    if (!isCurved(g)) return g;
    const keep = Object.assign({}, g.raCurve);
    const next = Object.assign(keep, nextPart||{});
    g.raCurve = next; g.data = Object.assign({}, g.data, { raCurve: next });

    const ctr = g.getCenterPoint ? g.getCenterPoint() : new fabric.Point(g.left||0, g.top||0);
    const ang = g.angle||0, sx=g.scaleX||1, sy=g.scaleY||1;
    const st  = styleFromUI();

    const fresh = buildCurved(next.text, {
      radius: next.radius, arc: next.arc, start: next.start, spacing: next.spacing, inward: next.inward,
      style: { fontFamily:st.fontFamily, fontSize:st.fontSize, fill:st.fill, stroke:st.stroke, strokeWidth:st.strokeWidth }
    });
    fresh.set({ left:ctr.x, top:ctr.y, angle:ang, scaleX:sx, scaleY:sy }); fresh.setCoords();

    const c=C(); c.remove(g); c.add(fresh); c.setActiveObject(fresh); c.requestRenderAll();
    return fresh;
  }

  function readUI(){
    const num = (id, d)=>{ const el=$(id); const v=parseFloat(el?.value||''); return Number.isFinite(v)?v:d; };
    const c=C(); const side=c?Math.min(c.getWidth(), c.getHeight()):700;
    return {
      enabled: !!$('#raCurveEnable')?.checked,
      radius:  num('#raCurveRadius', Math.round(side*0.35)),
      arc:     num('#raCurveArc', 180),
      start:   num('#raCurveStart', 0),
      spacing: num('#raCurveSpacing', 0),
      flip:    !!$('#raCurveFlip')?.checked
    };
  }
  function updateLabels(){
    const get=(id,d)=>{ const el=$(id); const v=parseFloat(el?.value||''); return Number.isFinite(v)?v:d; };
    const put=(id,v,s='')=>{ const el=$(id); if(el) el.textContent=String(v)+(s||''); };
    put('#raCurveRadiusVal', Math.round(get('#raCurveRadius',0)));
    put('#raCurveArcVal',    Math.round(get('#raCurveArc',0)), '°');
    put('#raCurveStartVal',  Math.round(get('#raCurveStart',0)), '°');
    put('#raCurveSpacingVal',Math.round(get('#raCurveSpacing',0)));
  }
  function reflectUI(obj){
    const vals = isCurved(obj) ? obj.raCurve : null;
    const set = (id,v)=>{ const el=$(id); if(!el) return; if (typeof v==='boolean') el.checked=v; else el.value=String(v); };
    set('#raCurveEnable', !!vals);
    set('#raCurveRadius', vals ? Math.round(vals.radius) : '');
    set('#raCurveArc',    vals ? Math.round(vals.arc)    : 180);
    set('#raCurveStart',  vals ? Math.round(vals.start)  : 0);
    set('#raCurveSpacing',vals ? Math.round(vals.spacing): 0);
    set('#raCurveFlip',   vals ? !!vals.inward : false);
    updateLabels();
    const txt=$('#customText'); if (txt) txt.value = obj ? plainText(obj) : '';
  }

  function ensureUI(){
    if ($('#raCurveRow')) return;

    const h3 = $$('h3').find(h => /custom\s*text/i.test((h.textContent||'').trim()));
    const card = h3 ? h3.parentNode : null;
    if (!card) return setTimeout(ensureUI, 200);

    const row = document.createElement('div');
    row.id='raCurveRow';
    row.style.cssText='margin-top:8px;padding:8px;border:1px dashed #2a2a2e;border-radius:8px;background:#0d0f14';
    row.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label style="display:flex;gap:6px;align-items:center"><input id="raCurveEnable" type="checkbox"> Curved</label>
        <label style="display:flex;gap:6px;align-items:center">Radius
          <input id="raCurveRadius" type="range" min="40" max="1200" value="240" style="width:150px">
          <span id="raCurveRadiusVal" style="opacity:.7;font-size:12px">240</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center">Arc
          <input id="raCurveArc" type="range" min="20" max="360" value="180" style="width:140px">
          <span id="raCurveArcVal" style="opacity:.7;font-size:12px">180°</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center">Start
          <input id="raCurveStart" type="range" min="-180" max="180" value="0" style="width:140px">
          <span id="raCurveStartVal" style="opacity:.7;font-size:12px">0°</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center">Spacing
          <input id="raCurveSpacing" type="range" min="-50" max="200" value="0" style="width:140px">
          <span id="raCurveSpacingVal" style="opacity:.7;font-size:12px">0</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center"><input id="raCurveFlip" type="checkbox"> Inside</label>
      </div>
    `;
    card.appendChild(row);

    // Change handlers
    const onAny = ()=>{
      updateLabels();
      const c=C(); if(!c) return;
      const o=c.getActiveObject();
      const vals=readUI();

      if (!o){
        // No selection: if Curved enabled and there is text in input, create a new curved text
        if (vals.enabled){
          const t=($('#customText')||{}).value?.trim(); if (!t) return;
          const g = buildCurved(t, { radius:vals.radius, arc:vals.arc, start:vals.start, spacing:vals.spacing, inward:vals.flip, style:styleFromUI() });
          g.set({ left:c.getWidth()/2, top:c.getHeight()/2 }); g.setCoords();
          c.add(g).setActiveObject(g); c.requestRenderAll();
        }
        return;
      }

      if (!isCurved(o)){
        if (vals.enabled && o._kind==='customText'){ toCurved(o); }
        return;
      }

      if (!vals.enabled){ toLinear(o); }
      else {
        updateCurved(o, {
          radius: vals.radius, arc: vals.arc, start: vals.start, spacing: vals.spacing, inward: vals.flip,
          text: plainText(o)
        });
      }
    };

    ['change','input'].forEach(ev=>{
      ['#raCurveEnable','#raCurveRadius','#raCurveArc','#raCurveStart','#raCurveSpacing','#raCurveFlip']
      .forEach(id=>{ const el=$(id); if(el) el.addEventListener(ev, onAny); });
    });

    // Sync UI on selection changes
    const c=C();
    if (c && !c.__raCurveSelBound){
      c.__raCurveSelBound=true;
      c.on('selection:created', e=> reflectUI(e?.selected?.[0]));
      c.on('selection:updated', e=> reflectUI(e?.selected?.[0]||c.getActiveObject()));
      c.on('selection:cleared', ()=> reflectUI(null));
    }

    // Rebuild when text or font controls change
    const bindTextControls = ()=>{
      const txt=$('#customText');
      if (txt && !txt.__raCurveBound){
        const h=()=>{
          const c=C(), o=c?.getActiveObject();
          if (o && isCurved(o)){
            const v=(txt.value||'').replace(/\r?\n/g,' ');
            const fresh = updateCurved(o,{ text:v });
            c.setActiveObject(fresh||o);
          }
        };
        txt.__raCurveBound=true; txt.addEventListener('change',h); txt.addEventListener('input',h);
      }
      [['#fontFamily'],['#fontSize'],['#fontColor'],['#strokeColor'],['#strokeWidth']].forEach(([id])=>{
        const el=$(id); if (!el || el.__raCurveBound) return;
        const h=()=>{ const c=C(), o=c?.getActiveObject(); if (o && isCurved(o)) updateCurved(o, {}); };
        el.__raCurveBound=true; el.addEventListener('change',h); el.addEventListener('input',h);
      });
    };
    bindTextControls();
    new MutationObserver(bindTextControls).observe(document.documentElement, { childList:true, subtree:true });
  }

  function boot(){ if (!C()) return setTimeout(boot,200); ensureUI(); }
  if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', boot, {once:true}); } else { boot(); }
})();

/* ==========================================================
   RA_SMART_GUIDES_OVERLAY_V3
   • Guides appear ONLY while dragging/scaling/rotating overlays or text.
   • Lines draw on a dedicated overlay <canvas> above Fabric → always visible.
   • Disappear on drop (mouse:up / selection:cleared).
   • Rulers toggle unchanged (DOM overlay). Desktop/mobile safe.
   • No changes to exports, layout, or undo/redo.
   ========================================================== */
(() => {
  if (window.__RA_GUIDES_OVERLAY_V3__) return;
  window.__RA_GUIDES_OVERLAY_V3__ = true;

  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  // --------------------------------------------------------
  // UI toggles (reuse the Selection row if it exists)
  // --------------------------------------------------------
  const S = {
    guidesOn: true,
    rulersOn: !window.matchMedia('(max-width: 900px)').matches, // default off on small screens
    tolPx: 10,   // snap/align proximity in screen pixels
    lines: null  // cached lines to draw while transforming
  };

  function ensureToggles(){
    let row = $('#raSnapRow');
    if (!row){
      const holder =
        $$('h3').find(h => /selection/i.test((h.textContent||'').trim()))?.parentNode
        || document.body;
      row = document.createElement('div');
      row.id = 'raSnapRow';
      row.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center';
      holder.appendChild(row);
    }
    if (!$('#raGuidesToggle')){
      const b = document.createElement('button');
      b.id='raGuidesToggle'; b.className='btn small'; b.style.minWidth='96px';
      b.onclick = ()=>{ S.guidesOn = !S.guidesOn; b.textContent = 'Guides: ' + (S.guidesOn?'On':'Off'); clearOverlay(); };
      row.appendChild(b);
    }
    if (!$('#raRulersToggle')){
      const b = document.createElement('button');
      b.id='raRulersToggle'; b.className='btn small'; b.style.minWidth='96px';
      b.onclick = ()=>{ S.rulersOn = !S.rulersOn; b.textContent = 'Rulers: ' + (S.rulersOn?'On':'Off'); placeRulers(); };
      row.appendChild(b);
    }
    $('#raGuidesToggle').textContent = 'Guides: ' + (S.guidesOn?'On':'Off');
    $('#raRulersToggle').textContent = 'Rulers: ' + (S.rulersOn?'On':'Off');
  }

  // --------------------------------------------------------
  // Overlay canvas (sits ABOVE Fabric; pointer-events: none)
  // --------------------------------------------------------
  let overlay, octx, wrapper, topResizeObs;

  function ensureOverlay(){
    const c = C(); if (!c) return false;

    // Fabric wraps the canvases in a position:relative container
    wrapper = c.upperCanvasEl && c.upperCanvasEl.parentElement;
    if (!wrapper) return false;

    if (!overlay){
      overlay = document.createElement('canvas');
      overlay.id = 'raGuidesOverlay';
      Object.assign(overlay.style, {
        position:'absolute', inset:'0', pointerEvents:'none', zIndex: 2, // above Fabric controls
      });
      wrapper.appendChild(overlay);

      // Keep overlay sized with Fabric’s upper canvas (retina aware)
      topResizeObs = new ResizeObserver(sizeOverlay);
      try { topResizeObs.observe(wrapper); } catch(_) {}
    }
    octx = overlay.getContext('2d');
    sizeOverlay();
    return true;
  }

  function sizeOverlay(){
    const c = C(); if (!c || !overlay || !wrapper) return;
    // Match Fabric’s actual pixel buffer
    const src = c.upperCanvasEl || c.lowerCanvasEl;
    if (!src) return;
    const cssW = src.clientWidth, cssH = src.clientHeight;
    const pxW  = src.width,       pxH  = src.height;
    overlay.width = pxW; overlay.height = pxH;
    overlay.style.width  = cssW + 'px';
    overlay.style.height = cssH + 'px';
    redrawOverlay();
  }

  function clearOverlay(){
    if (!overlay || !octx) return;
    octx.setTransform(1,0,0,1,0,0);
    octx.clearRect(0,0,overlay.width,overlay.height);
  }

  function redrawOverlay(){
    clearOverlay();
    if (!S.guidesOn || !S.lines || !S.lines.length) return;
    octx.save();
    octx.setTransform(1,0,0,1,0,0);
    // draw lines
    S.lines.forEach(L=>{
      octx.strokeStyle = (L.kind==='edge') ? '#f87171' : '#60a5fa'; // red for edges, blue for centers
      octx.lineWidth = 2;
      octx.setLineDash([8,6]);
      octx.beginPath();
      octx.moveTo(L.x1, L.y1);
      octx.lineTo(L.x2, L.y2);
      octx.stroke();
    });
    octx.restore();
  }

  // --------------------------------------------------------
  // Math: map canvas units → overlay pixels
  // --------------------------------------------------------
  function vpt(c){ return (c && c.viewportTransform) || [1,0,0,1,0,0]; }
  function toPx(c, x, y){
    const m = vpt(c);
    // Because overlay pixel buffer matches Fabric’s upperCanvasEl (retina included),
    // we can use the viewport transform directly.
    return { x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] };
  }
  function canvasEdgesPx(c){
    const tl = toPx(c, 0, 0);
    const tr = toPx(c, c.getWidth(), 0);
    const bl = toPx(c, 0, c.getHeight());
    const cx = toPx(c, c.getWidth()/2, 0).x;
    const cy = toPx(c, 0, c.getHeight()/2).y;
    return { left: tl.x, right: tr.x, top: tl.y, bottom: bl.y, cx, cy };
  }
  function objBoundsPx(c, o){
    // Accurate, rotation‑aware bounding box in canvas units:
    const br = o.getBoundingRect(true, true); // absolute, calculate
    const tl = toPx(c, br.left, br.top);
    const brp= toPx(c, br.left + br.width, br.top + br.height);
    const xMin = Math.min(tl.x, brp.x), xMax = Math.max(tl.x, brp.x);
    const yMin = Math.min(tl.y, brp.y), yMax = Math.max(tl.y, brp.y);
    return { xMin, xMax, yMin, yMax, cx:(xMin+xMax)/2, cy:(yMin+yMax)/2 };
  }

  function computeLines(c, o){
    const E = canvasEdgesPx(c);
    const O = objBoundsPx(c, o);
    const within = (a,b)=> Math.abs(a-b) <= S.tolPx;
    const L = [];

    // center alignments
    if (within(O.cx, E.cx)) L.push({ x1:E.cx, y1:E.top, x2:E.cx, y2:E.bottom, kind:'center' });
    if (within(O.cy, E.cy)) L.push({ x1:E.left, y1:E.cy, x2:E.right, y2:E.cy, kind:'center' });

    // edge-to-edge (object vs canvas)
    if (within(O.xMin, E.left))   L.push({ x1:E.left,  y1:E.top,    x2:E.left,  y2:E.bottom, kind:'edge' });
    if (within(O.xMax, E.right))  L.push({ x1:E.right, y1:E.top,    x2:E.right, y2:E.bottom, kind:'edge' });
    if (within(O.yMin, E.top))    L.push({ x1:E.left,  y1:E.top,    x2:E.right, y2:E.top,    kind:'edge' });
    if (within(O.yMax, E.bottom)) L.push({ x1:E.left,  y1:E.bottom, x2:E.right, y2:E.bottom, kind:'edge' });

    return L;
  }

  // --------------------------------------------------------
  // Wire Fabric events (drag-only guides)
  // --------------------------------------------------------
  function wireGuides(){
    const c = C(); if (!c || c.__raGuidesOverlayV3) return;
    c.__raGuidesOverlayV3 = true;

    const onTransform = e => {
      if (!S.guidesOn) return;
      const o = e?.target; if (!o || o._isBgRect || o._isBase) return; // only overlays/text/labels
      if (!ensureOverlay()) return;
      try { o.setCoords(); } catch(_){}
      S.lines = computeLines(c, o);
      redrawOverlay();
    };

    c.on('object:moving',   onTransform);
    c.on('object:scaling',  onTransform);
    c.on('object:rotating', onTransform);

    const clear = ()=>{ S.lines = null; redrawOverlay(); };
    c.on('mouse:up', clear);
    c.on('selection:cleared', clear);

    // keep overlay sized/placed as Fabric redraws (zoom/pan/resize)
    c.on('after:render', ()=>{ sizeOverlay(); if (S.lines) redrawOverlay(); });
  }

  // --------------------------------------------------------
  // Rulers (unchanged)
  // --------------------------------------------------------
  let topRule=null, leftRule=null, rulerHost=null;
  function getCanvasCard(){
    const base = $('#c');
    return base ? (base.closest('.card, .panel, .box, .canvas-card, .content, .canvas-wrapper') || base.parentElement) : null;
  }
  function buildRulers(){
    const card = getCanvasCard(); if (!card) return;
    if (!rulerHost){
      rulerHost = document.createElement('div');
      rulerHost.id = 'raRulerHost';
      Object.assign(rulerHost.style, { position:'absolute', inset:'0', pointerEvents:'none' });
      const cs = getComputedStyle(card);
      if (cs.position==='static') card.style.position = 'relative';
      card.appendChild(rulerHost);
    }
    if (!topRule){
      topRule = document.createElement('div');
      Object.assign(topRule.style, {
        position:'absolute', left:'0', top:'0', height:'22px', width:'100%',
        background:'#0f1116', borderBottom:'1px solid #222', pointerEvents:'none',
        boxShadow:'inset 0 -1px 0 rgba(255,255,255,.04)'
      });
      rulerHost.appendChild(topRule);
    }
    if (!leftRule){
      leftRule = document.createElement('div');
      Object.assign(leftRule.style, {
        position:'absolute', left:'0', top:'0', width:'22px', height:'100%',
        background:'#0f1116', borderRight:'1px solid #222', pointerEvents:'none',
        boxShadow:'inset -1px 0 0 rgba(255,255,255,.04)'
      });
      rulerHost.appendChild(leftRule);
    }
  }
  function paintRuler(el, horizontal, pixelsPer100){
    const minor = pixelsPer100/10;
    if (horizontal){
      el.style.backgroundImage =
        `repeating-linear-gradient(to right,
           transparent 0, transparent ${minor-1}px, rgba(255,255,255,.08) ${minor-1}px, rgba(255,255,255,.08) ${minor}px,
           transparent ${minor}px, transparent ${pixelsPer100-1}px, rgba(255,255,255,.18) ${pixelsPer100-1}px, rgba(255,255,255,.18) ${pixelsPer100}px)`;
      el.style.backgroundSize = `${pixelsPer100}px 100%`;
    } else {
      el.style.backgroundImage =
        `repeating-linear-gradient(to bottom,
           transparent 0, transparent ${minor-1}px, rgba(255,255,255,.08) ${minor-1}px, rgba(255,255,255,.08) ${minor}px,
           transparent ${minor}px, transparent ${pixelsPer100-1}px, rgba(255,255,255,.18) ${pixelsPer100-1}px, rgba(255,255,255,.18) ${pixelsPer100}px)`;
      el.style.backgroundSize = `100% ${pixelsPer100}px`;
    }
  }
  function placeRulers(){
    buildRulers();
    const c = C(); const card = getCanvasCard();
    if (!c || !card || !topRule || !leftRule) return;
    const vis = S.rulersOn ? 'block' : 'none';
    rulerHost.style.display = vis; topRule.style.display = vis; leftRule.style.display = vis;
    if (!S.rulersOn) return;

    const rect = (c.upperCanvasEl || c.lowerCanvasEl).getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const offsetLeft = rect.left - cardRect.left;
    const offsetTop  = rect.top  - cardRect.top;

    topRule.style.left = offsetLeft + 'px';
    topRule.style.width= rect.width + 'px';
    leftRule.style.top  = offsetTop + 'px';
    leftRule.style.height= rect.height + 'px';

    const z = (c.getZoom && c.getZoom()) || 1;
    const pixelsPer100 = Math.max(40, 100 * z);
    paintRuler(topRule,  true,  pixelsPer100);
    paintRuler(leftRule, false, pixelsPer100);
  }

  // --------------------------------------------------------
  // Boot
  // --------------------------------------------------------
  function boot(){
    ensureToggles();
    wireGuides();
    placeRulers();
    ensureOverlay();
    sizeOverlay();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  window.addEventListener('resize', ()=>{ placeRulers(); sizeOverlay(); }, {passive:true});
  window.addEventListener('scroll', ()=>{ placeRulers(); }, {passive:true});
  document.addEventListener('ra:canvas-ready', ()=>{ placeRulers(); sizeOverlay(); });

  // If your app overrides setCanvasSize, mirror sizing afterwards
  if (typeof window.setCanvasSize === 'function' && !window.setCanvasSize.__raGuideWrap){
    const orig = window.setCanvasSize;
    window.setCanvasSize = function(newSize){
      const r = orig.apply(this, arguments);
      try{ placeRulers(); sizeOverlay(); redrawOverlay(); }catch(_){}
      return r;
    };
    window.setCanvasSize.__raGuideWrap = true;
  }
})();
