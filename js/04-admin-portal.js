// ============================================================================
// 04-admin-portal.js
// Original app.js lines 1432-1530 (99 lines)
// ============================================================================

// --- HOISTED FORWARD-REF: renderPublishedShelf ---
// Originally defined later in app.js but used by this file's IIFE at script-load time.
// Duplicated here so it's available before this file's IIFE runs. The original
// definition still exists in its original file and will harmlessly overwrite this
// one when that file loads (function declarations don't error on redeclaration).
function renderPublishedShelf(){
  // Legacy localStorage shelf, superseded by the server-backed
  // "Published Overlays (live)" grid (js/52). Rendering it caused published
  // items to appear twice. One-time cleanup of the old storage, then no-op.
  try { localStorage.removeItem('ra2_published'); } catch(_){}
  return;

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
      const tile = document.createElement('div');
      tile.style.cssText = 'position:relative;border:1px solid #333;border-radius:8px;padding:6px;background:#111;text-align:center;cursor:pointer;';

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
      tile.addEventListener('click', ()=> addToCanvas(item.dataURL));
      grid.appendChild(tile);
    });
  }
  draw();
}
// --- END HOISTED FORWARD-REF ---


/* -------- ADMIN PORTAL (toggle with ?admin=1) -------- */
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

  // Publish to the SERVER shelf (api/overlays -> Redis) so everyone sees it.
  // Requires the RA_ADMIN_KEY; prompted once and cached in localStorage.
  async function publishToServer(item){
    let key = '';
    try { key = localStorage.getItem('ra2_admin_key') || ''; } catch(_){}
    if (!key) {
      key = prompt('Admin key (RA_ADMIN_KEY) to publish to the live shelf:') || '';
      if (!key) return { ok:false, error:'no key' };
      try { localStorage.setItem('ra2_admin_key', key); } catch(_){}
    }
    try {
      const r = await fetch('/api/overlays?mode=append&admin=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ overlays: [{ name: item.name, dataURL: item.dataURL }] })
      });
      if (r.status === 401) {
        try { localStorage.removeItem('ra2_admin_key'); } catch(_){}
        return { ok:false, error:'wrong admin key (cleared - click Publish again)' };
      }
      const j = await r.json().catch(() => null);
      return (r.ok && j && j.ok) ? { ok:true } : { ok:false, error:(j && j.error) || ('HTTP ' + r.status) };
    } catch (e) {
      return { ok:false, error:(e && e.message) || 'network' };
    }
  }

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
        setMsg('Publishing...');
        publishToServer(item).then(rr => {
          if (rr.ok) {
            setMsg(`Published: ${item.name}`);
            try { window.raReloadLiveOverlays && window.raReloadLiveOverlays(); } catch(_){}
          } else {
            setMsg('Publish failed: ' + rr.error);
          }
          setTimeout(()=>setMsg(''), 2500);
        });
      }
      if (act==="add"){ addOverlayToCanvas(item.dataURL,false); setMsg(`Added: ${item.name}`); setTimeout(()=>setMsg(''), 800); }
    });
    grid.appendChild(tile);
  }

  renderPublishedShelf();
})();