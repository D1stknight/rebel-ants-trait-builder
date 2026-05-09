// ============================================================================
// 15-admin-overlays-live.js
// Original app.js lines 3760-3882 (123 lines)
// ============================================================================


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

const frame = document.createElement('div');
frame.style.cssText = 'height:80px;display:flex;align-items:center;justify-content:center;';
const img = document.createElement('img');
img.src = item.dataURL;
img.alt = item.name || '';
img.style.cssText = 'max-width:100%;max-height:80px;';
frame.appendChild(img);

const cap = document.createElement('div');
cap.style.cssText = 'font-size:11px;opacity:.85;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
cap.textContent = item.name || '';

tile.appendChild(frame);
tile.appendChild(cap);

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