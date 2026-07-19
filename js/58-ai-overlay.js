// ============================================================================
// 58-ai-overlay.js — Phase 4a: AI Overlay (MVP, admin-gated)
// ============================================================================
// Standalone "AI Overlay" card inserted AFTER the Overlays card (v1 appended
// inside it, which squished the admin publish shelf). Includes a saved-
// generations shelf backed by /api/ai-overlays (Vercel Blob + KV) so paid
// generations persist until deleted.
// ============================================================================
;(() => {
  if (window.__RA_AI_OVERLAY_V2__) return;
  window.__RA_AI_OVERLAY_V2__ = true;

  const isAdmin = /\badmin=1\b/i.test(location.search);
  // Visible to admins always; to everyone else once signed in as a Commander.
  // (Server enforces sign-in + billing regardless of what the UI shows.)

  const getCanvas = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function findOverlaysSection(){
    const hs = Array.from(document.querySelectorAll('h2,h3,h4,strong'));
    const h = hs.find(x => /^\s*overlays\s*$/i.test(x.textContent || ''));
    return h ? (h.closest('section') || h.closest('.card') || h.parentElement) : null;
  }

  function baseToDataURL(){
    const c = getCanvas(); if (!c) return null;
    const base = (c.getObjects() || []).find(o => o && o._isBase && !o._isBgRect);
    if (!base) return null;
    const el = base._originalElement || (base.getElement && base.getElement());
    if (!el) return null;
    try {
      // Cap the snapshot: full-resolution PNG of large partner art exceeds
      // Vercel's ~4.5MB request cap (HTTP 413 before the function runs).
      // 1024px is plenty for the model's reference.
      const natW = el.naturalWidth || el.width || 1024;
      const natH = el.naturalHeight || el.height || 1024;
      const MAX = 1024;
      const sc = Math.min(1, MAX / Math.max(natW, natH));
      const t = document.createElement('canvas');
      t.width = Math.max(1, Math.round(natW * sc));
      t.height = Math.max(1, Math.round(natH * sc));
      t.getContext('2d').drawImage(el, 0, 0, t.width, t.height);
      let out = t.toDataURL('image/png');
      if (out.length > 3500000) out = t.toDataURL('image/jpeg', 0.85);
      return out;
    } catch (e) {
      return 'TAINTED';
    }
  }

  function addOverlayFromURL(src){
    const c = getCanvas(); if (!c || !window.fabric) return;
    const opts = src.startsWith('data:') ? {} : { crossOrigin: 'anonymous' };
    fabric.Image.fromURL(src, (img) => {
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
    }, opts);
  }

  async function refreshShelf(){
    const shelf = document.getElementById('raAiShelf');
    if (!shelf) return;
    let items = [];
    try {
      const j = await fetch('/api/ai-overlays', { cache: 'no-store' }).then(r => r.json());
      items = (j && j.items) || [];
    } catch(_){}
    if (!items.length) { shelf.innerHTML = '<div style="opacity:.5;font-size:12px;">No saved generations yet.</div>'; return; }
    shelf.innerHTML = '';
    for (const it of items) {
      const cell = document.createElement('div');
      cell.style.cssText = 'position:relative;width:56px;height:56px;flex:0 0 auto;';
      cell.title = it.prompt || '';
      const img = document.createElement('img');
      img.src = it.url;
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;border:1px solid rgba(255,255,255,.15);border-radius:8px;cursor:pointer;background:rgba(255,255,255,.04);';
      img.addEventListener('click', () => addOverlayFromURL(it.url));
      const x = document.createElement('button');
      x.textContent = 'x';
      x.style.cssText = 'position:absolute;top:-6px;right:-6px;width:18px;height:18px;line-height:14px;padding:0;font-size:11px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:#7f1d1d;color:#fff;cursor:pointer;';
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this saved generation?')) return;
        try { await fetch('/api/ai-overlays?id=' + encodeURIComponent(it.id), { method: 'DELETE' }); } catch(_){}
        refreshShelf();
      });
      cell.appendChild(img); cell.appendChild(x);
      shelf.appendChild(cell);
    }
  }

  function injectUI(){
    const sec = findOverlaysSection();
    if (!sec || document.getElementById('raAiOverlayBox')) return;

    // Standalone sibling card so we never disturb the Overlays card's layout.
    const box = document.createElement(sec.tagName || 'section');
    box.id = 'raAiOverlayBox';
    if (sec.className) box.className = sec.className;
    box.style.marginTop = '14px';
    box.innerHTML = [
      '<div style="font-weight:700;font-size:16px;margin-bottom:8px;">\ud83d\udc1c Ant-thony\u2019s Workshop <span style="opacity:.55;font-weight:400;font-size:12px;">(admin preview)</span></div>',
      '<input id="raAiOverlayPrompt" type="text" placeholder="e.g. gm coffee mug held in the ant\'s own hands" ',
      ' style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px;margin-bottom:8px;" />',
      '<button id="raAiOverlayBtn" class="btn" style="width:100%;">Generate AI Overlay</button>',
      '<div style="display:flex;gap:6px;margin-top:8px;">',
      '<button id="raAnthonyIdea" class="btn" style="flex:1;font-size:12px;">\ud83d\udca1 Gimme an idea</button>',
      '<button id="raAnthonyRoast" class="btn" style="flex:1;font-size:12px;">\ud83d\udd25 Roast it</button>',
      '<button id="raAnthonyShare" class="btn" style="flex:1;font-size:12px;">\ud83d\udce4 Post to Discord</button>',
      '</div>',
      '<div id="raAnthonySpeech" style="display:none;margin-top:8px;padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.04);font-size:13px;line-height:1.35;"><span style="opacity:.6;">Ant-thony:</span> <span id="raAnthonySpeechText"></span></div>',
      '<div id="raAiOverlayStatus" style="margin-top:6px;font-size:12px;opacity:.7;"></div>',
      (isAdmin && window.raSession && window.raSession.isAdmin) ? [
        '<div style="font-weight:600;margin:10px 0 4px;font-size:13px;">AI Pricing <span style="opacity:.5;font-weight:400;font-size:11px;">(admin)</span></div>',
        '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">',
        '<input id="raAiCostInput" type="number" min="0" max="100000" style="width:90px;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:6px;" />',
        '<span style="font-size:12px;opacity:.7;">$REBEL per generation</span>',
        '<button id="raAiCostSave" class="btn" style="padding:6px 10px;">Save</button>',
        '</div>',
        '<div id="raAiCostStatus" style="font-size:11px;opacity:.7;margin-bottom:6px;"></div>'
      ].join('') : '',
      '<div style="font-weight:600;margin:10px 0 6px;font-size:13px;">Saved generations</div>',
      '<div id="raAiShelf" style="display:flex;gap:8px;flex-wrap:wrap;max-height:140px;overflow:auto;"></div>'
    ].join('');
    sec.parentNode.insertBefore(box, sec.nextSibling);
    box.style.flex = '0 0 auto';

    // Layout guard: the right column is a scrolling flex container, and the
    // Published Overlays section is its only child with overflow:auto, so
    // flexbox collapses it to ~22px once total content exceeds the viewport.
    // Pin its flex-shrink so it keeps natural height (column scrolls instead).
    const pinPublished = () => {
      const p = document.getElementById('ra-live-overlays-sec');
      if (p && p.style.flex !== '0 0 auto') p.style.flex = '0 0 auto';
      return !!p;
    };
    if (!pinPublished()) {
      let n = 0;
      const pt = setInterval(() => { if (pinPublished() || ++n > 60) clearInterval(pt); }, 500);
    }

    const btn = document.getElementById('raAiOverlayBtn');
    const status = document.getElementById('raAiOverlayStatus');

    // ---- Ant-thony ----
    function anthonySay(t){
      const box2 = document.getElementById('raAnthonySpeech');
      const txt = document.getElementById('raAnthonySpeechText');
      if (box2 && txt) { txt.textContent = t; box2.style.display = ''; }
    }
    function canvasSnapshot(){
      const c = getCanvas(); if (!c) return null;
      try {
        const side = Math.max(c.getWidth(), c.getHeight()) || 700;
        const mult = Math.min(1, 1024 / side);
        let out = c.toDataURL({ format: 'png', multiplier: mult });
        if (out.length > 3500000) out = c.toDataURL({ format: 'jpeg', quality: 0.85, multiplier: mult });
        return out;
      } catch (_) { return null; }
    }
    async function anthonyCall(payload){
      const r = await fetch('/api/anthony', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      return await r.json().catch(() => null);
    }
    const ideaBtn = document.getElementById('raAnthonyIdea');
    if (ideaBtn) ideaBtn.addEventListener('click', async () => {
      ideaBtn.disabled = true; anthonySay('...thinking with all six legs...');
      try {
        const img = baseToDataURL();
        const j = await anthonyCall({ mode: 'idea', image: (img && img !== 'TAINTED') ? img : undefined });
        if (j && j.ok) {
          anthonySay(j.say || 'Try this one.');
          if (j.prompt) {
            const pi = document.getElementById('raAiOverlayPrompt');
            if (pi) pi.value = j.prompt;
          }
        } else anthonySay('My antennae are jammed - try me again in a sec.');
      } finally { ideaBtn.disabled = false; }
    });
    const roastBtn = document.getElementById('raAnthonyRoast');
    if (roastBtn) roastBtn.addEventListener('click', async () => {
      roastBtn.disabled = true; anthonySay('...oh, you want the SMOKE? One sec...');
      try {
        const snap = canvasSnapshot();
        const j = await anthonyCall({ mode: 'roast', image: snap || undefined });
        anthonySay(j && j.ok ? j.text : 'Roast machine broke. You got lucky.');
      } finally { roastBtn.disabled = false; }
    });
    const shareBtn = document.getElementById('raAnthonyShare');
    if (shareBtn) shareBtn.addEventListener('click', async () => {
      shareBtn.disabled = true; const prevT = shareBtn.textContent; shareBtn.textContent = 'Posting...';
      try {
        const snap = canvasSnapshot();
        if (!snap) { anthonySay('Nothing on the canvas to show off yet.'); return; }
        const r = await fetch('/api/share-discord', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: snap }) });
        const j = await r.json().catch(() => null);
        if (j && j.ok) anthonySay('Posted to the colony. Go collect your flowers. \ud83d\udc1c');
        else if (j && j.error === 'not_configured') anthonySay('Discord sharing is not wired up yet - tell the boss to add the webhook.');
        else if (j && j.error === 'sign_in_required') anthonySay('Sign in as a commander first, then we post.');
        else anthonySay('Discord is not answering the door: ' + ((j && j.error) || 'unknown'));
      } finally { shareBtn.disabled = false; shareBtn.textContent = prevT; }
    });

    btn.addEventListener('click', async () => {
      const src = baseToDataURL();
      if (!src) { status.textContent = 'Load an NFT or upload a base image first.'; return; }
      if (src === 'TAINTED') { status.textContent = 'This base image blocks export (CORS). Reload the token and try again.'; return; }
      const prompt = (document.getElementById('raAiOverlayPrompt').value || '').trim();
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = 'Ant-thony is cooking (up to a minute)...';
      status.textContent = '';
      try {
        const r = await fetch('/api/generate-overlay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: src, prompt })
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j && j.ok && j.imageB64) {
          addOverlayFromURL('data:image/png;base64,' + j.imageB64);
          status.textContent = 'Hot off the mandibles - saved to your shelf.' + (j.charged ? (' Charged ' + j.charged + ' $REBEL.') : '');
          refreshShelf();
          try { window.raRefreshSession && window.raRefreshSession(); } catch(_){}
        } else if (j && j.error === 'sign_in_required') {
          status.textContent = 'Sign in as a Commander first (left panel).';
        } else if (j && j.error === 'insufficient_points') {
          status.textContent = 'Not enough $REBEL: need ' + j.cost + ', you have ' + j.balance + '.';
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

    refreshShelf();

    // Admin pricing editor wiring (present only for admins)
    const costInput = document.getElementById('raAiCostInput');
    const costSave = document.getElementById('raAiCostSave');
    const costStatus = document.getElementById('raAiCostStatus');
    if (costInput && costSave) {
      fetch('/api/ai-settings', { cache: 'no-store' }).then(r => r.json()).then(j => {
        if (j && j.ok) { costInput.value = j.costPerGen; costStatus.textContent = 'Current: ' + j.costPerGen + ' (' + j.source + ')'; }
      }).catch(() => {});
      costSave.addEventListener('click', async () => {
        const n = parseInt(costInput.value, 10);
        if (!Number.isFinite(n) || n < 0) { costStatus.textContent = 'Enter a valid number.'; return; }
        costSave.disabled = true;
        try {
          const r = await fetch('/api/ai-settings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ costPerGen: n })
          });
          const j = await r.json().catch(() => null);
          costStatus.textContent = (r.ok && j && j.ok) ? ('Saved: ' + j.costPerGen + ' $REBEL - live immediately.') : ('Failed: ' + ((j && j.error) || r.status));
          if (r.ok && j && j.ok) { try { window.raRefreshSession && window.raRefreshSession(); } catch(_){} }
        } catch (e) { costStatus.textContent = 'Failed: network'; }
        costSave.disabled = false;
      });
    }
  }

  function allowed(){ return isAdmin || !!window.raSession; }
  function updateCostLabel(){
    const el = document.getElementById('raAiCost');
    const btn = document.getElementById('raAiOverlayBtn');
    const s = window.raSession;
    const billed = s && s.billing && s.costPerGen > 0;
    if (el) {
      if (billed) el.textContent = s.costPerGen + ' $REBEL per generation';
      else if (isAdmin) el.textContent = '(admin preview)';
      else el.textContent = '';
    }
    if (btn && !btn.disabled) {
      btn.textContent = billed ? ('Generate AI Overlay (' + s.costPerGen + ' $REBEL)') : 'Generate AI Overlay';
    }
  }
  function syncVisibility(){
    const box = document.getElementById('raAiOverlayBox');
    if (allowed()) {
      if (!box) injectUI();
      else {
        box.style.display = '';
        refreshShelf();
        // On ?admin=1 the card injects before the session arrives, so the
        // session-gated pricing editor was skipped. Rebuild once we know
        // this is an admin commander.
        if (isAdmin && window.raSession && window.raSession.isAdmin && !document.getElementById('raAiCostInput')) {
          box.remove();
          injectUI();
        }
      }
      updateCostLabel();
    }
    else if (box) box.style.display = 'none';
  }
  document.addEventListener('ra-auth-change', syncVisibility);
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (allowed()) injectUI();
    updateCostLabel();
    if (document.getElementById('raAiOverlayBox') || tries > 60) clearInterval(t);
  }, 250);
})();
