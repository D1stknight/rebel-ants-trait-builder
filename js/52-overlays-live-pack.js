// ============================================================================
// 52-overlays-live-pack.js
// Original app.js lines 10312-10569 (258 lines)
// ============================================================================


/* =========================================================
   LIVE PUBLISHED OVERLAYS (final polish)
   - 3‑column compact grid with internal scroll
   - Hides legacy "Published Overlays" label (not our (live) one)
   - Adds overlay centered & scaled smaller on canvas
   - Ensures tile labels use a readable light color
========================================================= */
(function(){
  // Pull overlays from the live API
  async function fetchLivePack(){
    try {
      const r = await fetch('/api/overlays', { cache: 'no-store' });
      if (!r.ok) return [];
      const j = await r.json().catch(()=>null);
      const arr = (j && Array.isArray(j.overlays)) ? j.overlays : [];
      return arr.filter(o => (o && (o.url || o.dataURL)));
    } catch { return []; }
  }

  // Right panel helper (covers your markup variants)
  function findRightPanel(){
    return document.querySelector('aside.panel.right')
        || document.querySelector('.panel.right')
        || document.querySelector('aside.right')
        || document.querySelector('aside')
        || document.body;
  }

  // Robustly hide the old static "Published Overlays" label (not the new "(live)" one)
  function hideLegacyPublishedLabel(){
    const right = findRightPanel();
    if (!right) return;
    const candidates = right.querySelectorAll('h1,h2,h3,h4,p,div,span,strong,em,.section-title');
    candidates.forEach(node => {
      const txt = (node.textContent || '').trim().toLowerCase();
      if (!txt) return;
      // match exact "published overlays" and ensure it's NOT inside our live section
      if (txt === 'published overlays' && !node.closest('#ra-live-overlays-sec')) {
        node.style.display = 'none';
      }
    });
  }

  // Create (or get) the live section and its grid
  function ensureLiveSection(){
    const right = findRightPanel();
    let section = document.getElementById('ra-live-overlays-sec');
    if (!section) {
      section = document.createElement('section');
      section.id = 'ra-live-overlays-sec';
      section.className = 'panel';
      section.style.border = '1px solid rgba(255,255,255,.12)';
      section.style.borderRadius = '10px';
      section.style.padding = '10px';
      section.style.margin = '12px 0';

      // insert under the main “Overlays” header if we can find it
      const overlaysHeader = [...document.querySelectorAll('h1,h2,h3,.section-title')]
        .find(h => /^\s*Overlays\b/i.test(h.textContent || ''));
      if (overlaysHeader?.parentElement) {
        overlaysHeader.parentElement.insertAdjacentElement('afterend', section);
      } else {
        right.appendChild(section);
      }

      const head = document.createElement('h3');
      head.textContent = 'Published Overlays (live)';
      head.style.margin = '0 0 6px';
      head.style.fontSize = '13px';
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.id = 'ra-live-grid';
      // —— compact 3‑column grid + internal scroll (like the regular shelf)
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)'; // 3 columns
      grid.style.gap = '8px';
      grid.style.maxHeight = '320px';
      grid.style.overflow = 'auto';
      grid.style.padding = '6px';
      grid.style.border = '1px solid rgba(255,255,255,.08)';
      grid.style.background = '#0e1218';
      grid.style.borderRadius = '8px';
      // make sure text inside tiles is readable even if a parent enforces dark text
      grid.style.color = '#cfd8ee';
      section.appendChild(grid);
    }
    return document.getElementById('ra-live-grid');
  }

/* === Overlay sizing/selection knobs (tweak these) === */
const RA_OV_CFG = {
  FIT: 0.40,        // 50% of canvas. Lower = smaller (e.g., 0.45).
  MAX_PX: 520,      // Optional hard pixel cap (null = ignore).
  TRIM_ALPHA: 10,   // 0..255: higher trims more faint transparency.
  TRIM_PAD: 1,      // pixels of margin to keep after trimming.
  CORNER_SIZE: 9    // selection dot size (handles).
};

/* ===== Centered + trimmed addToCanvas (tight selection box) ===== */
function addToCanvas(src, name = 'overlay') {
  const canv = window.canvas || window.c;
  if (!window.fabric || !canv) return;

  loadTrimmedCanvas(src).then(trimmedCanvas => {
    const img = new fabric.Image(trimmedCanvas, {
      originX: 'center', originY: 'center',
      left: canv.getWidth() / 2,
      top:  canv.getHeight() / 2,
      selectable: true,
      evented: true,
      perPixelTargetFind: true,
      objectCaching: false,
      cornerStyle: 'circle',
      transparentCorners: false,
      cornerSize: RA_OV_CFG.CORNER_SIZE
    });

    // Fit inside % of canvas, with optional hard pixel cap
    const fitW = canv.getWidth()  * RA_OV_CFG.FIT;
    const fitH = canv.getHeight() * RA_OV_CFG.FIT;
    const maxW = (RA_OV_CFG.MAX_PX ? Math.min(fitW, RA_OV_CFG.MAX_PX) : fitW);
    const maxH = (RA_OV_CFG.MAX_PX ? Math.min(fitH, RA_OV_CFG.MAX_PX) : fitH);

    const s = Math.min(maxW / img.width, maxH / img.height, 1);
    img.scale(s);

    canv.add(img);
    canv.setActiveObject(img);
    canv.requestRenderAll();
  }).catch(() => {
    // Fallback if trimming isn’t possible (e.g., CORS)
    fabric.Image.fromURL(src, (img) => {
      img.set({
        originX: 'center', originY: 'center',
        left: canv.getWidth()/2, top: canv.getHeight()/2,
        selectable: true, evented: true, perPixelTargetFind: true,
        objectCaching: false, cornerStyle: 'circle',
        transparentCorners: false, cornerSize: RA_OV_CFG.CORNER_SIZE
      });

      const fitW = canv.getWidth()  * RA_OV_CFG.FIT;
      const fitH = canv.getHeight() * RA_OV_CFG.FIT;
      const maxW = (RA_OV_CFG.MAX_PX ? Math.min(fitW, RA_OV_CFG.MAX_PX) : fitW);
      const maxH = (RA_OV_CFG.MAX_PX ? Math.min(fitH, RA_OV_CFG.MAX_PX) : fitH);

      const s = Math.min(maxW / img.width, maxH / img.height, 1);
      img.scale(s);

      canv.add(img);
      canv.setActiveObject(img);
      canv.requestRenderAll();
    }, { crossOrigin: 'anonymous' });
  });
}

/* --- Helper: load image and return a trimmed canvas (respects alpha) --- */
function loadTrimmedCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth  || img.width;
        const h = img.naturalHeight || img.height;

        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        const ctx = tmp.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const { data } = ctx.getImageData(0, 0, w, h);
        const TH = RA_OV_CFG.TRIM_ALPHA|0;

        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const a = data[(y*w + x) * 4 + 3];
            if (a > TH) { // treat faint pixels below threshold as transparent
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }

        // If fully transparent (or failed), just use original image element
        if (maxX < minX || maxY < minY) return resolve(img);

        // Apply padding and clamp
        const pad = Math.max(0, RA_OV_CFG.TRIM_PAD|0);
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(w - 1, maxX + pad);
        maxY = Math.min(h - 1, maxY + pad);

        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;

        const out = document.createElement('canvas');
        out.width = cw; out.height = ch;
        out.getContext('2d').drawImage(tmp, minX, minY, cw, ch, 0, 0, cw, ch);
        resolve(out);
      } catch {
        resolve(img); // graceful fallback
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

  function escHtml(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function escAttr(s){ return escHtml(s).replace(/"/g,'&quot;'); }

  // Render tiles into the grid
  function render(list){
    const grid = ensureLiveSection();
    hideLegacyPublishedLabel();  // <— hide the old label whenever we render

    if (!list.length) {
      grid.innerHTML = '<div class="muted">No live overlays published yet.</div>';
      return;
    }

    const isAdmin = /\badmin=1\b/i.test(location.search);
    grid.innerHTML = list.map(o => {
      const src  = o.url || o.dataURL;
      const name = o.name || 'overlay';
      const delBtn = (isAdmin && o.id)
        ? `<button class="ra-ov-del" data-id="${escAttr(o.id)}" title="Delete from live shelf"
                  style="position:absolute;top:2px;right:2px;width:18px;height:18px;line-height:14px;padding:0;font-size:11px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:#7f1d1d;color:#fff;cursor:pointer;z-index:2;">x</button>`
        : '';
      return `
        <div style="position:relative;">
          ${delBtn}
          <button class="ra-ov" title="${escAttr(name)}"
                  style="appearance:none;border:0;background:none;padding:0;margin:0;cursor:pointer;width:100%;">
            <img src="${escAttr(src)}" alt="${escAttr(name)}"
                 style="width:100%;aspect-ratio:1/1;object-fit:contain;background:#0a0f14;border-radius:8px;display:block">
            <div style="font-size:11px;margin-top:4px;opacity:.9;color:#cfd8ee;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escHtml(name)}
            </div>
          </button>
        </div>`;
    }).join('');

    // click -> add to canvas (centered & scaled)
    grid.querySelectorAll('.ra-ov img').forEach(img => {
      img.addEventListener('click', () => addToCanvas(img.src, img.alt));
    });

    // admin: delete from the server shelf (DELETE /api/overlays?id=...&admin=key)
    grid.querySelectorAll('.ra-ov-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!id || !confirm('Delete this overlay from the live shelf for everyone?')) return;
        let key = '';
        if (!(window.raSession && window.raSession.isAdmin)) {
          try { key = localStorage.getItem('ra2_admin_key') || ''; } catch(_){}
          if (!key) {
            key = prompt('Admin key (RA_ADMIN_KEY):') || '';
            if (!key) return;
            try { localStorage.setItem('ra2_admin_key', key); } catch(_){}
          }
        }
        try {
          const r = await fetch('/api/overlays?id=' + encodeURIComponent(id) + (key ? ('&admin=' + encodeURIComponent(key)) : ''), { method: 'DELETE' });
          if (r.status === 401) {
            try { localStorage.removeItem('ra2_admin_key'); } catch(_){}
            alert('Wrong admin key (cleared) - click x again.');
            return;
          }
          window.raReloadLiveOverlays && window.raReloadLiveOverlays();
        } catch(_){ alert('Delete failed (network).'); }
      });
    });
  }

  // Public hook so you can refresh after publishing from Admin
  window.raReloadLiveOverlays = async function(){
    const pack = await fetchLivePack();
    render(pack);
  };

  // Initial run
  const run = () => setTimeout(window.raReloadLiveOverlays, 150);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();