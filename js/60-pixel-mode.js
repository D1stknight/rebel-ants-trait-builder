// ============================================================================
// 60-pixel-mode.js — "Convert your NFT to Pixel"
// ============================================================================
// True pixel-art conversion of the base image (not the live shader mosaic):
// downsample to an N x N grid, optional retro palette quantization, then
// nearest-neighbor upscale. Apply replaces the base on canvas (original kept
// for Restore); Download saves the PNG at full canvas resolution.
// ============================================================================
;(() => {
  if (window.__RA_PIXEL_MODE_V1__) return;
  window.__RA_PIXEL_MODE_V1__ = true;

  const getCanvas = () => (window.canvas && window.canvas.lowerCanvasEl) ? window.canvas : null;
  const findBase = (c) => (c.getObjects() || []).find(o => o && o._isBase && !o._isBgRect);

  const PALETTES = {
    full:    { name: 'Full color', fn: null },
    retro64: { name: 'Retro 64',   fn: (r,g,b) => quant(r,g,b,4) },
    retro27: { name: 'Retro 27',   fn: (r,g,b) => quant(r,g,b,3) },
    retro8:  { name: 'Retro 8',    fn: (r,g,b) => quant(r,g,b,2) },
    gameboy: { name: 'Game Boy',   fn: (r,g,b) => ramp(r,g,b, [[15,56,15],[48,98,48],[139,172,15],[155,188,15]]) },
    noir:    { name: 'Noir',       fn: (r,g,b) => ramp(r,g,b, [[10,10,12],[85,85,90],[170,170,175],[245,245,248]]) }
  };
  function quant(r,g,b,levels){
    const s = 255/(levels-1);
    return [Math.round(Math.round(r/s)*s), Math.round(Math.round(g/s)*s), Math.round(Math.round(b/s)*s)];
  }
  function ramp(r,g,b,colors){
    const luma = (0.299*r + 0.587*g + 0.114*b)/255;
    const i = Math.min(colors.length-1, Math.floor(luma*colors.length));
    return colors[i];
  }

  function baseElement(){
    const c = getCanvas(); if (!c) return null;
    const base = findBase(c); if (!base) return null;
    return { c, base, el: base._originalElement || (base.getElement && base.getElement()) };
  }

  // Produce the pixelated dataURL at output size (canvas backing resolution)
  function pixelate(el, grid, paletteFn, outSize){
    const small = document.createElement('canvas');
    small.width = grid; small.height = grid;
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = true; // averaging on the way DOWN
    sctx.drawImage(el, 0, 0, grid, grid);
    if (paletteFn){
      const im = sctx.getImageData(0, 0, grid, grid);
      const d = im.data;
      for (let i = 0; i < d.length; i += 4){
        if (d[i+3] < 8) continue;
        const [r,g,b] = paletteFn(d[i], d[i+1], d[i+2]);
        d[i] = r; d[i+1] = g; d[i+2] = b;
      }
      sctx.putImageData(im, 0, 0);
    }
    const out = document.createElement('canvas');
    out.width = outSize; out.height = outSize;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false; // crisp squares on the way UP
    octx.drawImage(small, 0, 0, outSize, outSize);
    return out.toDataURL('image/png');
  }

  let savedOriginal = null; // previous base fabric object for Restore

  function replaceBase(dataURL){
    const c = getCanvas(); if (!c || !window.fabric) return;
    const old = findBase(c);
    fabric.Image.fromURL(dataURL, (img) => {
      if (!img) return;
      const cw = c.getWidth(), ch = c.getHeight();
      const sc = Math.min(cw/(img.width||cw), ch/(img.height||ch));
      img.set({ originX:'center', originY:'center', left:cw/2, top:ch/2 });
      if (Number.isFinite(sc) && sc > 0) img.scale(sc);
      img._isBase = true; img._raBaseSig = 'BASE_V1';
      img.selectable = false; img.evented = false; img.hasControls = false;
      img.lockMovementX = img.lockMovementY = img.lockScalingX = img.lockScalingY = img.lockRotation = true;
      if (old) { savedOriginal = old; try { c.remove(old); } catch(_){} }
      c.add(img);
      try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
      c.requestRenderAll();
    });
  }

  function restoreOriginal(statusEl){
    const c = getCanvas(); if (!c || !savedOriginal) { statusEl.textContent = 'Nothing to restore.'; return; }
    const cur = findBase(c);
    if (cur) { try { c.remove(cur); } catch(_){} }
    c.add(savedOriginal);
    try { window.raEnforceLayerOrder && window.raEnforceLayerOrder(); } catch(_){}
    c.requestRenderAll();
    savedOriginal = null;
    statusEl.textContent = 'Original restored.';
  }

  function injectUI(){
    if (document.getElementById('raPixelPanel')) return true;
    const fx = document.getElementById('raFxPanel');
    if (!fx) return false;
    const panel = document.createElement('div');
    panel.id = 'raPixelPanel';
    panel.style.cssText = 'margin:16px 0;padding:14px;border:1px solid #23262c;border-radius:12px;background:#0f1116;color:#e9eaed;font:12px system-ui;';
    const palOpts = Object.entries(PALETTES).map(([k,v]) => '<option value="'+k+'">'+v.name+'</option>').join('');
    panel.innerHTML = [
      '<div style="margin-bottom:10px;"><strong style="font-size:14px;">Pixel Mode</strong> ',
      '<span style="opacity:.5;font-size:11px;">convert your NFT to pixel art</span></div>',
      '<div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;">',
      '<label>Grid</label><select id="raPixGrid"><option>16</option><option>24</option><option selected>32</option><option>48</option><option>64</option><option>96</option></select>',
      '<label>Palette</label><select id="raPixPal">' + palOpts + '</select>',
      '</div>',
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">',
      '<button id="raPixApply" class="btn">Apply to canvas</button>',
      '<button id="raPixRestore" class="btn">Restore original</button>',
      '<button id="raPixDownload" class="btn">Download PNG</button>',
      '</div>',
      '<div id="raPixStatus" style="margin-top:6px;font-size:12px;opacity:.75;"></div>'
    ].join('');
    panel.querySelectorAll('select').forEach(s => {
      s.style.cssText = 'background:#161a21;color:#e9eaed;border:1px solid #2c3138;border-radius:8px;padding:7px 10px;';
    });
    fx.parentNode.insertBefore(panel, fx.nextSibling);
    const status = panel.querySelector('#raPixStatus');
    const run = (mode) => {
      const info = baseElement();
      if (!info || !info.el) { status.textContent = 'Load an NFT or upload a base image first.'; return; }
      const grid = parseInt(document.getElementById('raPixGrid').value, 10) || 32;
      const pal = PALETTES[document.getElementById('raPixPal').value] || PALETTES.full;
      const outSize = Math.max(info.c.lowerCanvasEl.width, 1024);
      let dataURL;
      try { dataURL = pixelate(info.el, grid, pal.fn, outSize); }
      catch (e) { status.textContent = 'This base image blocks export (CORS). Reload the token and try again.'; return; }
      if (mode === 'apply'){
        replaceBase(dataURL);
        status.textContent = 'Applied ' + grid + 'x' + grid + ' (' + pal.name + '). Use Restore to undo.';
      } else {
        const a = document.createElement('a');
        a.href = dataURL; a.download = 'pixel-' + grid + 'x' + grid + '.png';
        document.body.appendChild(a); a.click();
        setTimeout(() => a.remove(), 200);
        status.textContent = 'Downloaded ' + grid + 'x' + grid + ' PNG.';
      }
    };
    panel.querySelector('#raPixApply').onclick = () => run('apply');
    panel.querySelector('#raPixDownload').onclick = () => run('download');
    panel.querySelector('#raPixRestore').onclick = () => restoreOriginal(status);
    return true;
  }
  let tries = 0;
  const t = setInterval(() => { if (injectUI() || ++tries > 60) clearInterval(t); }, 300);
})();
