// ============================================================================
// 19-trim-overlays.js
// Original app.js lines 4369-4521 (153 lines)
// ============================================================================


/* ==========================================================
   RA_OVERLAY_AUTO_TRIM_ON_ADD_V2
   - Tightens the selection box: trims transparent padding on overlays.
   - Works when overlays are added from any source (grid, upload, publish).
   - Also enables per-pixel hit testing on overlays.
   - One initial pass trims existing overlays already on canvas.
   - No UI added. Desktop/mobile & exports unaffected.
   ========================================================== */
(() => {
  if (window.__RA_TRIM_OVERLAYS_V2__) return;
  window.__RA_TRIM_OVERLAYS_V2__ = true;

  const ALPHA_THRESHOLD = 8;     // 0..255 — pixels with alpha <= threshold are treated as transparent
  const MIN_SHRINK = 0.01;       // ignore trims that change <1% (avoid needless churn)

  function C(){ return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null; }

  // Grab the HTMLImageElement that Fabric uses internally
  function getImgEl(fabImg){
    return fabImg? (fabImg._originalElement || fabImg._element || fabImg.getElement?.() || null) : null;
  }

  // Compute tight bounds of non-transparent pixels
  function findOpaqueBounds(imgEl, thr = ALPHA_THRESHOLD){
    const w = imgEl.naturalWidth || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;
    if (!w || !h) return null;

    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(imgEl, 0, 0);
    const data = ctx.getImageData(0,0,w,h).data;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y=0, i=3; y<h; y++){
      for (let x=0; x<w; x++, i+=4){
        if (data[i] > thr){    // alpha channel
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) return null; // fully transparent
    return { x:minX, y:minY, w:(maxX - minX + 1), h:(maxY - minY + 1), W:w, H:h };
  }

  // Apply crop to a Fabric.Image in-place
  function applyCrop(img, bounds){
    if (!bounds) return false;
    const { x, y, w, h, W, H } = bounds;

    // Ignore microscopic trims (UI churn without benefit)
    const shrinkW = 1 - (w / W);
    const shrinkH = 1 - (h / H);
    if (shrinkW < MIN_SHRINK && shrinkH < MIN_SHRINK) return false;

    // Keep current scale; change the source frame to the tight rect
    // Fabric's bbox = width*scaleX by height*scaleY, so shrink width/height.
    img.set({
      cropX: x, cropY: y,
      width: w, height: h
    });
    img.setCoords();
    // Better hit-testing on irregular shapes
    img.perPixelTargetFind = true;
    img.targetFindTolerance = 4;
    return true;
  }

  // If an overlay is wrapped in a group, trim the inner image instead.
  function trimOverlayObject(obj){
    try{
      if (!obj || obj._kind !== 'overlay') return false;

      if (obj.type === 'image'){
        const el = getImgEl(obj);
        if (!el) return false;
        const b = findOpaqueBounds(el);
        return applyCrop(obj, b);
      }

      if (obj.type === 'group' && Array.isArray(obj._objects)){
        const inner = obj._objects.find(o => o.type === 'image');
        if (!inner) return false;
        const el = getImgEl(inner);
        if (!el) return false;
        const b = findOpaqueBounds(el);
        const changed = applyCrop(inner, b);
        if (changed){
          obj.addWithUpdate();  // refresh group geometry
          obj.setCoords();
        }
        return changed;
      }
    }catch(_){}
    return false;
  }

  function enablePerPixel(obj){
    if (!obj || obj._kind !== 'overlay') return;
    if (obj.type === 'image') {
      obj.perPixelTargetFind = true;
      obj.targetFindTolerance = 4;
    } else if (obj.type === 'group' && Array.isArray(obj._objects)){
      obj._objects.forEach(k => {
        if (k.type === 'image'){ k.perPixelTargetFind = true; k.targetFindTolerance = 4; }
      });
    }
  }

  function wire(){
    const c = C(); if (!c) return setTimeout(wire, 120);

    // Trim overlays as they are added
    if (!c.__raTrimBound){
      c.__raTrimBound = true;

      c.on('object:added', (e)=>{
        const o = e?.target;
        if (!o || o._isBgRect) return;

        // Only overlays (not base image, not background, not token id text)
        if (o._kind === 'overlay'){
          const changed = trimOverlayObject(o);
          enablePerPixel(o);
          if (changed){
            try { c.requestRenderAll(); } catch(_){}
          }
        }
      });

      // One-time pass to tighten any existing overlays (e.g., after reload)
      (c.getObjects()||[]).forEach(o=>{
        if (o._kind === 'overlay'){
          const changed = trimOverlayObject(o);
          enablePerPixel(o);
          if (changed) o.setCoords();
        }
      });
      try { c.requestRenderAll(); } catch(_){}
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wire, { once:true });
  } else {
    wire();
  }
})();