// ============================================================================
// 09-inspire-quotes.js
// Original app.js lines 2372-2519 (148 lines)
// ============================================================================


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

  // ============================================================================
  // Phase 2: AI Inspire Me — async fetch from /api/inspire
  // ============================================================================
  // Calls our serverless endpoint backed by Claude Haiku 4.5. Returns a string
  // on success or null on any failure (caller falls back to template generator).
  // Snapshot of the loaded NFT base (downscaled) so quotes can riff on the
  // actual artwork on the board. Null when no base / canvas tainted.
  function baseSnapshot(){
    const c = window.canvas; if (!c) return null;
    const base = (c.getObjects && c.getObjects() || []).find(o => o && o._isBase && !o._isBgRect);
    if (!base) return null;
    const el = base._originalElement || (base.getElement && base.getElement());
    if (!el) return null;
    try {
      const S = 512;
      const t = document.createElement('canvas'); t.width = S; t.height = S;
      t.getContext('2d').drawImage(el, 0, 0, S, S);
      return t.toDataURL('image/jpeg', 0.8);
    } catch(_) { return null; }
  }

  async function fetchAiQuote() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const recent = (typeof getRecent === 'function') ? getRecent() : [];
      const image = baseSnapshot();
      const r = await fetch('/api/inspire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recent: recent.slice(-10), ...(image ? { image } : {}) }),
        signal: ctrl.signal
      });
      if (!r.ok) return null;
      const j = await r.json();
      const q = (j && typeof j.quote === 'string') ? j.quote.trim() : null;
      if (!q || q.length < 3 || q.length > 140) return null;
      return q;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // (Template quote generator removed: quotes are AI-generated only.)

  // ——— Drop (or replace) quote on Fabric canvas ———
  async function addOrReplaceQuote(){
    const c = window.canvas;
    if (!c || !window.fabric) { alert('Canvas not ready'); return; }

    // Phase 2: try AI-generated quote first; fall back to template generator on any failure.
    let quote = null;
    try { quote = await fetchAiQuote(); } catch (_) { /* handled below */ }
    if (!quote) { alert('Inspire is unavailable right now - try again in a moment.'); return; }
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

    // Phase 2: wrap with loading state so the user sees feedback during the API call.
    btn.addEventListener('click', async () => {
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = '…';
      try { await addOrReplaceQuote(); }
      finally { btn.disabled = false; btn.textContent = prev; }
    });
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