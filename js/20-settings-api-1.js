// ============================================================================
// 20-settings-api-1.js
// Original app.js lines 4522-4645 (124 lines)
// ============================================================================



(() => {
  const GET_URL  = '/api/ra-settings';  // your endpoint (GET returns {ok, settings:{...}})
  const POST_URL = '/api/ra-settings';  // same endpoint for saving

  const isAdmin = /\badmin=1\b/i.test(location.search);

  function canvas() {
    return (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  }

  function applyToCanvas(settings) {
    if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch(_) {} }

    const c = canvas(); if (!c) return false;
    const wm = (c.getObjects() || []).find(o => o && false);
    if (!wm) return false;

    const opacity = Math.max(0, Math.min(1, Number(settings?.opacity ?? 0.18)));
    const sizePct = Math.max(0.05, Math.min(1, Number(settings?.sizePct ?? 0.88)));

    const targetW = Math.round(c.getWidth() * sizePct);
    const baseW   = wm.width || (wm._element?.naturalWidth) || 512;
    const s = targetW / baseW;

    wm.opacity = opacity;
    wm.scaleX = s; wm.scaleY = s;
    wm.left = c.getWidth() / 2; wm.top = c.getHeight() / 2;
    wm.setCoords();
    c.bringToFront(wm);
    c.requestRenderAll();
    return true;
  }

  // Everyone: load the latest settings on open
  async function loadFromServerAndApply() {
    try {
      const url = GET_URL + (GET_URL.includes('?') ? '&' : '?') + 'v=' + Date.now(); // avoid cache
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      let s = j.settings ?? j.data ?? j;
      if (typeof s === 'string') { try { s = JSON.parse(s); } catch(_) {} }

      let tries = 0;
      const tick = () => {
        if (applyToCanvas(s)) return;
        if (++tries < 30) setTimeout(tick, 150);
      };
      tick();
    } catch (_) {}
  }

  // Read the current admin slider values
  function currentAdminValues() {
    const on  = document.getElementById('raWmCEnabled');
    const tok = document.getElementById('raWmCOnTok');
    const up  = document.getElementById('raWmCOnUp');
    const op  = document.getElementById('raWmCOpacity');
    const sz  = document.getElementById('raWmCSize');
    return {
      enabled: !!(on && on.checked),
      showOnTokens:  !!(tok && tok.checked),
      showOnUploads: !!(up && up.checked),
      opacity: op ? Number(op.value) : 0.18,
      sizePct: sz ? Number(sz.value) : 0.88
    };
  }

  // Save to the server (your /api/ra-settings has no auth, so this is simple)
  async function saveToServer(body) {
    try {
      await fetch(POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch(_) {}
  }

  // When admin sliders appear, send changes to server (debounced) and apply locally
  function wireAdminSaveOnce() {
    if (!isAdmin) return;

    const op = document.getElementById('raWmCOpacity');
    const sz = document.getElementById('raWmCSize');
    const on = document.getElementById('raWmCEnabled');
    const tok = document.getElementById('raWmCOnTok');
    const up = document.getElementById('raWmCOnUp');

    if (!op || op.__wmSyncBound) return;

    const debounced = (() => {
      let t; return () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const body = currentAdminValues();
          saveToServer(body);   // push to server for everyone
          applyToCanvas(body);  // reflect immediately in this tab
        }, 250);
      };
    })();

    [op, sz].forEach(el => el && el.addEventListener('input', debounced));
    [on, tok, up].forEach(el => el && el.addEventListener('change', debounced));

    op.__wmSyncBound = sz && (sz.__wmSyncBound = true);
    if (on)  on.__wmSyncBound  = true;
    if (tok) tok.__wmSyncBound = true;
    if (up)  up.__wmSyncBound  = true;
  }

  // Keep waiting for the admin controls to appear, then wire them once
  const mo = new MutationObserver(wireAdminSaveOnce);
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Load settings for everyone on page open
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFromServerAndApply, { once: true });
  } else {
    loadFromServerAndApply();
  }
})();