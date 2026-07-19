// ============================================================================
// 58-ai-overlay.js — Phase 4a: AI Overlay (MVP, admin-gated)
// ============================================================================
// Adds an "AI Overlay" mini-panel to the Overlays card. Sends the current base
// image to /api/generate-overlay and drops the returned transparent PNG onto
// the canvas as a normal selectable overlay.
//
// MVP gating: only visible with ?admin=1 (same gate as the other admin UI)
// while generation is free. Phase 4b moves this behind commander sign-in +
// Rebel Economy points/APE packages.
// ============================================================================
;(() => {
  if (window.__RA_AI_OVERLAY_V1__) return;
  window.__RA_AI_OVERLAY_V1__ = true;

  const isAdmin = /\badmin=1\b/i.test(location.search);
  if (!isAdmin) return; // MVP: admin only while free

  const getCanvas = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function findOverlaysCard(){
    const hs = Array.from(document.querySelectorAll('h2,h3,h4,strong'));
    const h = hs.find(x => /^\s*overlays\s*$/i.test(x.textContent || ''));
    return h ? (h.closest('section,.card,div') || h.parentElement) : null;
  }

  function baseToDataURL(){
    const c = getCanvas(); if (!c) return null;
    const base = (c.getObjects() || []).find(o => o && o._isBase && !o._isBgRect);
    if (!base) return null;
    const el = base._originalElement || (base.getElement && base.getElement());
    if (!el) return null;
    try {
      const t = document.createElement('canvas');
      t.width = el.naturalWidth || el.width || 1024;
      t.height = el.naturalHeight || el.height || 1024;
      t.getContext('2d').drawImage(el, 0, 0, t.width, t.height);
      return t.toDataURL('image/png');
    } catch (e) {
      // Tainted canvas (no-CORS fallback path) — cannot serialize
      return 'TAINTED';
    }
  }

  function addOverlayFromB64(b64){
    const c = getCanvas(); if (!c || !window.fabric) return;
    const dataURL = 'data:image/png;base64,' + b64;
    fabric.Image.fromURL(dataURL, (img) => {
      if (!img) return;
      const cw = c.getWidth(), ch = c.getHeight();
      const target = Math.min(cw, ch) * 0.6;
      const s = Math.min(target / (img.width || 1), target / (img.height || 1));
      img.set({
        originX: 'center', originY: 'center',
        left: cw / 2, top: ch / 2,
        scaleX: s, scaleY: s,
        selectable: true, evented: true
      });
      img._kind = 'aiOverlay';
      c.add(img);
      try { c.setActiveObject(img); } catch(_){}
      c.requestRenderAll && c.requestRenderAll();
    });
  }

  function injectUI(){
    const card = findOverlaysCard();
    if (!card || document.getElementById('raAiOverlayBox')) return;

    const box = document.createElement('div');
    box.id = 'raAiOverlayBox';
    box.style.cssText = 'margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;';
    box.innerHTML = [
      '<div style="font-weight:600;margin-bottom:6px;">AI Overlay <span style="opacity:.55;font-weight:400;font-size:12px;">(admin preview)</span></div>',
      '<input id="raAiOverlayPrompt" type="text" placeholder="e.g. katana + red aura" ',
      ' style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px;margin-bottom:8px;" />',
      '<button id="raAiOverlayBtn" class="btn" style="width:100%;">Generate AI Overlay</button>',
      '<div id="raAiOverlayStatus" style="margin-top:6px;font-size:12px;opacity:.7;"></div>'
    ].join('');
    card.appendChild(box);

    const btn = document.getElementById('raAiOverlayBtn');
    const status = document.getElementById('raAiOverlayStatus');

    btn.addEventListener('click', async () => {
      const src = baseToDataURL();
      if (!src) { status.textContent = 'Load an NFT or upload a base image first.'; return; }
      if (src === 'TAINTED') { status.textContent = 'This base image blocks export (CORS). Reload the token and try again.'; return; }

      const prompt = (document.getElementById('raAiOverlayPrompt').value || '').trim();
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = 'Generating (can take up to a minute)...';
      status.textContent = '';
      try {
        const r = await fetch('/api/generate-overlay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: src, prompt })
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j && j.ok && j.imageB64) {
          addOverlayFromB64(j.imageB64);
          status.textContent = 'Done. Drag/scale it like any overlay.';
        } else {
          status.textContent = 'Failed: ' + ((j && j.error) || ('HTTP ' + r.status));
        }
      } catch (e) {
        status.textContent = 'Failed: ' + (e && e.message || 'network error');
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
  }

  // The Overlays card renders on load; retry briefly until it exists.
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    injectUI();
    if (document.getElementById('raAiOverlayBox') || tries > 40) clearInterval(t);
  }, 250);
})();
