// ============================================================================
// 03-snap-align.js
// Original app.js lines 849-1431 (583 lines)
// ============================================================================

})();

/* -------- Base image: load by token (multi-collection) -------- */
safeAddListener("loadToken","click", async ()=>{
  const statusEl = $("tokenStatus");
  const tokenIdRaw  = (($("tokenIdInput")||{}).value || "").trim();
  if (!tokenIdRaw){ if (statusEl) statusEl.textContent = "Enter a token ID."; return; }

  try { window.__raTokenMemory = String(tokenIdRaw).replace(/[^0-9]/g,''); } catch(_){}

  function selectedContract(){
    const sel = $("collectionSelect") || $("collectionKey") || document.querySelector("[data-ra-collection-select]");
    const opt = sel?.selectedOptions?.[0];
    const fromData = opt?.dataset?.contract || opt?.getAttribute?.("data-contract");
    const val = (fromData || sel?.value || "").trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(val)) return val;
    const list = (window.RA_COLLECTIONS && Array.isArray(window.RA_COLLECTIONS)) ? window.RA_COLLECTIONS : [];
    const hit  = list.find(x => x.key===val || x.slug===val || x.name===val);
    if (hit && (hit.address || hit.contract)) return (hit.address || hit.contract);
    return (typeof CONTRACT === "string" && CONTRACT) ? CONTRACT : "0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221";
  }

  const contract = selectedContract();
  if (statusEl) statusEl.textContent = "Fetching token…";

  try{
    const imgUrl = await fetchImageByTokenId(contract, tokenIdRaw);
    if (!imgUrl){ if (statusEl) statusEl.textContent = "No image URL found."; return; }

    if (statusEl) statusEl.textContent = "Downloading image…";
    const data = await fetchAsDataURL(imgUrl);

    await loadBaseImage(data, true); // token => no ring

    // Tag base with contract
    try{
      const base = (canvas.getObjects()||[]).find(o => o._isBase && !o._isBgRect);
      if (base) base._tokenContract = contract;
      window.__raLastTokenContract = contract;
    }catch(_){}

    if (statusEl) statusEl.textContent = "Loaded 👍";

    // Ensure ring stays hidden (safety; loadBaseImage already removed it)
    try {
      (canvas.getObjects()||[]).forEach(o=>{
        if (o && (false || false || false)) o.visible = false;
      });
      canvas.requestRenderAll();
    } catch(_){}
  }catch(_){
    if (statusEl) statusEl.textContent = "Failed to load token.";
  }
});

/* -------- Canvas controls -------- */
safeAddListener("zoomIn","click",  ()=> setZoom(zoom*1.1));
safeAddListener("zoomOut","click", ()=> setZoom(zoom/1.1));
safeAddListener("zoomReset","click", ()=>{
  setZoom(1);
  canvas.setViewportTransform([1,0,0,1,0,0]);
});

safeAddListener("canvasSize","change", (e)=>{
  const v = parseInt(e.target.value, 10);
  if (!isNaN(v)) setCanvasSize(v);
});

safeAddListener("clearBase","click", clearBaseOnly);

safeAddListener("clearCanvas","click", ()=>{
  raSafeClear(true);          // keep backgroundRect, clear everything else
  idLabel = null; 
  baseGroup = null;
  // Re-create faint ring (non-token mode) if appropriate
  try { /* no-op (legacy hook removed) */ } catch (_) {}
  // Re-enforce layer order after a short delay so undo/restore ops aren't racing
  setTimeout(()=>{
    try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch (_) {}
  }, 60);
});

/* -------- Token ID style live controls (if present) -------- */
["change","input"].forEach(ev=>{
  safeAddListener("idFormat", ev, ()=>{
    if (idLabel){
      idLabel.text = formatTokenId((($("tokenIdDisplay")||{}).value)||"", (($("idFormat")||{}).value)||"plain");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("idSize", ev, ()=>{
    if (idLabel){
      idLabel.set('fontSize', parseInt((($("idSize")||{}).value)||"52",10));
      canvas.requestRenderAll();
    }
  });
  safeAddListener("idColor", ev, ()=>{
    if (idLabel){
      idLabel.set('fill', (($("idColor")||{}).value)||"#fff");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("idStrokeColor", ev, ()=>{
    if (idLabel){
      idLabel.set('stroke', (($("idStrokeColor")||{}).value)||"transparent");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("idStrokeWidth", ev, ()=>{
    if (idLabel){
      idLabel.set('strokeWidth', parseInt((($("idStrokeWidth")||{}).value)||"0",10));
      canvas.requestRenderAll();
    }
  });
});
safeAddListener("deleteTokenId","click", ()=>{
  if (idLabel){ canvas.remove(idLabel); idLabel=null; canvas.requestRenderAll(); }
});

/* -------- Custom text (optional UI) -------- */
safeAddListener("addCustomText","click", ()=>{
  const val = (($("customText")||{}).value||"").trim(); if (!val) return;

  // Use IText (editable single-line) → tight bounds, no forced width
  const txt = new fabric.IText(val, {
    left: canvas.getWidth()/2,
    top:  canvas.getHeight()/2,
    originX: "center",
    originY: "center",
    textAlign: "left",
    fontFamily: (($("fontFamily")||{}).value) || "Arial, sans-serif",
    fontSize: parseInt((($("fontSize")||{}).value)||"48",10),
    fill: (($("fontColor")||{}).value) || "#ffffff",
    stroke: (($("strokeColor")||{}).value) || "transparent",
    strokeWidth: parseInt((($("strokeWidth")||{}).value)||"0",10),
    strokeUniform: true,
    paintFirst: "stroke",
    objectCaching: false,
    perPixelTargetFind: true
    // editable: true is default for IText
  });

  // Tighten bounds (ensure no cached wide box)
  txt.set({ width: undefined });
  if (txt.initDimensions) txt.initDimensions();
  txt.setCoords();

  txt._kind = 'customText';
  canvas.add(txt);
  canvas.setActiveObject(txt);
  bringInterfaceToFront();
  canvas.requestRenderAll();
});

["change","input"].forEach(ev=>{
  safeAddListener("fontFamily", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind==='customText'){
      o.set('fontFamily', (($("fontFamily")||{}).value)||o.fontFamily||"Arial, sans-serif");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("fontSize", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind === 'customText') {
      o.set('fontSize', parseInt((($("fontSize")||{}).value)||"48",10));
      canvas.requestRenderAll();
    }
  });
  safeAddListener("fontColor", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind==='customText'){
      o.set('fill', (($("fontColor")||{}).value)||o.fill||"#ffffff");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("strokeColor", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind==='customText'){
      o.set('stroke', (($("strokeColor")||{}).value)||o.stroke||"transparent");
      canvas.requestRenderAll();
    }
  });
  safeAddListener("strokeWidth", ev, ()=>{
    const o = canvas.getActiveObject();
    if (o && o._kind === 'customText') {
      o.set('strokeWidth', parseInt((($("strokeWidth")||{}).value)||"0",10));
      canvas.requestRenderAll();
    }
  });
});

safeAddListener("delSelectedText","click", ()=>{
  const o=canvas.getActiveObject();
  if (o && o._kind==='customText'){ canvas.remove(o); canvas.requestRenderAll(); }
});

safeAddListener("delAllText","click", ()=>{
  canvas.getObjects().slice().forEach(o=>{ if (o._kind==='customText') canvas.remove(o); });
  canvas.requestRenderAll();
});

/* -------- Selection tools -------- */
safeAddListener("duplicate","click", ()=>{
  const o = canvas.getActiveObject(); if (!o) return;
  o.clone(c=>{
    c.set({ left:(o.left||0)+20, top:(o.top||0)+20 });
    
    // Preserve permanence flag from original
    if (typeof o?._isPermanent !== 'undefined') {
      c._isPermanent = o._isPermanent;
    }

    // Force the clone and its children to be treated as overlays
    function setOverlayKindDeep(obj) {
      if (!obj) return;

      const isSystem =
        obj._raSys || false || false || obj._isBgRect || obj._isBase || false || obj._raTokenId;

      if (!isSystem) {
        obj._kind = 'overlay';
      }

      const children = (typeof obj.getObjects === 'function' ? obj.getObjects() : obj._objects) || [];
      children.forEach(setOverlayKindDeep);
    }
    setOverlayKindDeep(c);
    
    canvas.add(c).setActiveObject(c);
    canvas.requestRenderAll();
  });
});

safeAddListener("delete","click", ()=>{
  if (!window.canvas) return;
  const c = window.canvas;
  const o = c.getActiveObject && c.getActiveObject();
  if (!o) return;

  // Never delete background, base, or system items from this button
  if (o._isBgRect || o._isBase || o._raSys) return;

  // If it’s the Token-ID label, clear the pointer so it won’t come back
  try { if (o._raTokenId) { window.idLabel = null; } } catch(_) {}

  try { c.discardActiveObject(); } catch(_) {}
  try { c.remove(o); } catch(_) {}
  try { c.requestRenderAll(); } catch(_) {}
});

// -------- Keyboard Delete/Backspace (same rules as Selection → Delete)
document.addEventListener('keydown', (e)=>{
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (e.target?.isContentEditable || /^(input|textarea|select)$/.test(tag)) return;

  const isDeleteKey = (e.key === 'Delete') || (e.key === 'Backspace');
  if (!isDeleteKey) return;

  const c = window.canvas;
  if (!c) return;
  const o = c.getActiveObject && c.getActiveObject();
  if (!o) return;

  if (o._isBgRect || o._isBase || o._raSys) { e.preventDefault(); return; }

  try { if (o._raTokenId) { window.idLabel = null; } } catch(_) {}

  try { c.discardActiveObject(); } catch(_) {}
  try { c.remove(o); } catch(_) {}
  try { c.requestRenderAll(); } catch(_) {}

  e.preventDefault();
}, true);

safeAddListener("opacity","input", (e)=>{
  const o=canvas.getActiveObject(); if(!o) return;
  o.set('opacity', parseFloat(e.target.value||"1"));
  canvas.requestRenderAll();
});

safeAddListener("blendMode","change", (e)=>{
  const o = canvas.getActiveObject(); if (!o) return;
  o.globalCompositeOperation = (e.target.value === "normal") ? null : e.target.value;
  canvas.requestRenderAll();
});

safeAddListener("bringFront","click", ()=> reorderOverlay('front'));
safeAddListener("sendBack","click",  ()=> reorderOverlay('back'));

safeAddListener("flipX","click", ()=>{
  const o=canvas.getActiveObject(); if(!o) return;
  o.toggle && o.toggle('flipX'); canvas.requestRenderAll();
});

safeAddListener("flipY","click", ()=>{
  const o=canvas.getActiveObject(); if(!o) return;
  o.toggle && o.toggle('flipY'); canvas.requestRenderAll();
});

safeAddListener("lock","click", ()=>{
  const o = canvas.getActiveObject(); if (!o) return;
  o.set({
    selectable:false, evented:false, hasControls:false,
    lockMovementX:true, lockMovementY:true,
    lockScalingX:true, lockScalingY:true,
    lockRotation:true
  });
  canvas.requestRenderAll();
});

// ---- FIXED: do not unlock backgroundRect or _isBase objects ----
safeAddListener("unlockAll","click", ()=>{
  const c = window.canvas; if (!c) return;
  const objs = c.getObjects() || [];

  const bg = objs.find(o => o && o._isBgRect);
  if (bg) {
    bg.selectable = false; bg.evented = false; bg.hasControls = false;
    bg.lockMovementX = bg.lockMovementY = bg.lockScalingX = bg.lockScalingY = bg.lockRotation = true;
    try { c.moveTo(bg, 0); } catch(_) {}
  }

  const active = c.getActiveObject && c.getActiveObject();
  if (active && active._isBgRect) {
    try { c.discardActiveObject(); } catch(_) {}
  }

  objs.forEach(o => {
    if (!o) return;
    if (o._isBgRect || o._isBase || o._raSys || o._raTokenId) return;
    o.set({
      selectable: true, evented: true, hasControls: true,
      lockMovementX: false, lockMovementY: false,
      lockScalingX:  false, lockScalingY:  false,
      lockRotation:  false
    });
  });

  c.requestRenderAll();
});

safeAddListener("clearAllOverlays", "click", () => {
  const isSystem = (o) =>
    o?._raSys || o?.false || o?.false || o?._isBgRect || o?._isBase || o?.false || o?._raTokenId;

  const isRemovableOverlay = (o) =>
    o && o._kind === "overlay" && !o._isPermanent && !isSystem(o);

  function removeChildFromGroup(group, child) {
    if (typeof group.removeWithUpdate === "function") {
      group.removeWithUpdate(child);
    } else if (typeof group.remove === "function") {
      group.remove(child);
      group._calcBounds?.();
      group.setCoords?.();
    } else if (Array.isArray(group._objects)) {
      group._objects = group._objects.filter((o) => o !== child);
      group._calcBounds?.();
      group.setCoords?.();
    }
  }

  function pruneGroupRecursive(obj) {
    if (!obj || typeof obj.getObjects !== "function") return;
    const children = (obj.getObjects?.() || obj._objects || []).slice();

    children.forEach((child) => {
      if (isRemovableOverlay(child)) {
        removeChildFromGroup(obj, child);
      } else if (typeof child.getObjects === "function" || child.type === "group") {
        pruneGroupRecursive(child);
        const remaining = child.getObjects?.() || child._objects || [];
        if (remaining.length === 0 && !child._isPermanent) {
          removeChildFromGroup(obj, child);
        }
      }
    });
  }

  (canvas.getObjects?.() || []).slice().forEach((o) => {
    if (isRemovableOverlay(o)) {
      canvas.remove(o);
    } else if (typeof o.getObjects === "function" || o.type === "group") {
      pruneGroupRecursive(o);
      const remaining = o.getObjects?.() || o._objects || [];
      if (remaining.length === 0 && (o._kind === "overlay" || !o._isPermanent)) {
        canvas.remove(o);
      }
    }
  });

  canvas.discardActiveObject?.();
  canvas.requestRenderAll?.();
});

/* -------- Overlays panel & uploads -------- */
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
  overlayList = overlayList.filter(o=>o.perm);
  renderOverlayGrid();
});

// -------- Keyboard helpers (duplicate + nudge only; delete handled elsewhere) --------
document.addEventListener("keydown", (e)=>{
  const tag = (e.target && e.target.tagName || "").toLowerCase();
  if (e.target?.isContentEditable || /^(input|textarea|select)$/.test(tag)) return;

  const c = window.canvas; if (!c) return;
  const o = c.getActiveObject && c.getActiveObject();
  if (!o) return;

  // Duplicate (Cmd/Ctrl + D)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
    // Never duplicate system/base/bg/token-id items
    if (o._isBgRect || o._isBase || o._raSys || o._raTokenId || false || false || false) {
      e.preventDefault();
      return;
    }
    try {
      o.clone(cl => {
        cl.set({ left:(o.left||0)+10, top:(o.top||0)+10 });

        function markAsOverlayDeep(node){
          if (!node) return;
            // Skip if system-ish
            if (!(node._isBgRect || node._isBase || node._raSys || node._raTokenId || false || false || false)) {
              node._kind = 'overlay';
            }
            const kids = (typeof node.getObjects === 'function' ? node.getObjects() : node._objects) || [];
            kids.forEach(markAsOverlayDeep);
        }
        markAsOverlayDeep(cl);

        c.add(cl);
        c.setActiveObject(cl);
        c.requestRenderAll();
      });
    } catch(_) {}
    e.preventDefault();
    return;
  }

  // Arrow key nudge (Shift = 10px)
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {

    if (o._isBgRect || o._isBase || o._raSys || o._raTokenId || false || false || false) {
      e.preventDefault();
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft")  o.left -= step;
    if (e.key === "ArrowRight") o.left += step;
    if (e.key === "ArrowUp")    o.top  -= step;
    if (e.key === "ArrowDown")  o.top  += step;
    o.setCoords();
    c.requestRenderAll();
    e.preventDefault();
    return;
  }
});

/* -------- SNAP + ALIGN UI (v2 – robust bounding box snapping) -------- */
(function snapAlignV2(){
  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function ensureUI(){
    let row = document.getElementById("raSnapRow");
    if (!row){
      const header = Array.from(document.querySelectorAll("h3,h2")).find(h => (h.textContent||"").trim().toLowerCase()==="selection");
      const holder = header ? header.parentNode : document.body;
      row = document.createElement("div");
      row.id = "raSnapRow";
      row.style.cssText = "margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center";
      row.innerHTML = `
        <button class="btn small" id="raCenterH">Center H</button>
        <button class="btn small" id="raCenterV">Center V</button>
        <button class="btn small" id="raCenterHV">Center HV</button>
        <button class="btn small" id="raSnapToggle">Snap: On</button>
        <div style="opacity:.65;font-size:11px">Arrows=1px · Shift+Arrows=10px · Cmd/Ctrl+D duplicate</div>
      `;
      holder.appendChild(row);
      document.getElementById("raCenterH").onclick  = ()=>center("H");
      document.getElementById("raCenterV").onclick  = ()=>center("V");
      document.getElementById("raCenterHV").onclick = ()=>center("HV");
    }
    const toggle = document.getElementById("raSnapToggle");
    if (toggle && !toggle.__wired){
      toggle.__wired = true;
      toggle.onclick = ()=>{
        window.__snapOn = !window.__snapOn;
        toggle.textContent = "Snap: " + (window.__snapOn ? "On" : "Off");
      };
    }
  }

  function center(which){
    const c = C(); if (!c) return;
    const o = c.getActiveObject(); if(!o) return;

    if (o._raSys || false || false || false || o._isBgRect || o._isBase || o._raTokenId) return;
    const cw = c.getWidth(), ch = c.getHeight();
    if (which==="H" || which==="HV") o.left = cw/2;
    if (which==="V" || which==="HV") o.top  = ch/2;
    o.setCoords(); c.requestRenderAll();
  }

  function isSnapTarget(o){
    if (!o) return false;

    if (o._raSys || false || false || false || o._isBgRect || o._isBase || o._raTokenId) return false;
    const kind = (o._kind||'').toLowerCase();
    const t = (o.type||'').toLowerCase();
    return kind==='overlay' || kind==='sticker' || kind==='icon' || kind==='customtext' ||
           t==='textbox' || t==='i-text' || t==='text';
  }

  function snapObject(o){
    if (!window.__snapOn || !isSnapTarget(o)) return;
    const c = C(); if (!c) return;
    let br;
    try { br = o.getBoundingRect(true, true); } catch(_){ return; }

    const cw = c.getWidth(), ch = c.getHeight();
    const tol = 8;

    const centerX = br.left + br.width / 2;
    const centerY = br.top  + br.height / 2;

    let dx = 0, dy = 0;

    // Center lines
    if (Math.abs(centerX - cw/2) <= tol) dx += (cw/2 - centerX);
    if (Math.abs(centerY - ch/2) <= tol) dy += (ch/2 - centerY);

    // Edges
    if (Math.abs(br.left - 0) <= tol) dx += (0 - br.left);
    if (Math.abs(br.top - 0) <= tol) dy += (0 - br.top);
    if (Math.abs((br.left + br.width) - cw) <= tol) dx += (cw - (br.left + br.width));
    if (Math.abs((br.top + br.height) - ch) <= tol) dy += (ch - (br.top + br.height));

    if (dx || dy){
      o.left += dx;
      o.top  += dy;
      o.setCoords();
    }
  }

  function wireSnap(){
    const c = C(); if (!c){ setTimeout(wireSnap,120); return; }
    if (c.__snapV2Wired) return;
    c.__snapV2Wired = true;

    if (typeof window.__snapOn === 'undefined') window.__snapOn = true;

    function handler(e){
      const o = e && e.target;
      if (!o) return;
      snapObject(o);
    }

    c.on('object:moving',   handler);
    c.on('object:scaling',  handler);
    c.on('object:rotating', handler);

    c.on('mouse:up', ()=>{
      const o = c.getActiveObject();
      if (o){ snapObject(o); c.requestRenderAll(); }
    });
  }

  ensureUI();
  wireSnap();
})();