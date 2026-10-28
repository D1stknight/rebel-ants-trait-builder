// ============================================================================
// 63-badges.js — Rebel badges in the Builder (and the contest page)
// ============================================================================
// - "Badges" button in the .brand row (builder) / #raBadgesLink (contest page)
//   opens the Builder's badge list from /api/badges/me (families, earned
//   bright, locked dim with how to earn + progress, "See every badge" link).
// - A small toast "New badge: <name> · <tier>" whenever one of our own API
//   calls answers with `awarded` (the server decides; nothing is trusted from
//   here). Badges are Rebel Ants collectibles: not points, not transferable.
// ============================================================================
;(() => {
  'use strict';
  if (window.__RA_BADGES_V1__) return;
  window.__RA_BADGES_V1__ = true;

  const TIERS = {
    common:    { label: 'Bronze',   color: '#c98a4b' },
    rare:      { label: 'Silver',   color: '#cfd8e3' },
    epic:      { label: 'Neon',     color: '#b77bff' },
    legendary: { label: 'Gold',     color: '#f5d061' },
    mythic:    { label: 'Mythic',   color: '#ff3b6b' },
    secret:    { label: 'Obsidian', color: '#8ff0b8' }
  };
  const tierOf = (t) => TIERS[t] || TIERS.common;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const navy = !!document.querySelector('.c-head'); // contest pages use the navy look
  const C = navy
    ? { card: '#131822', line: 'rgba(255,255,255,.10)', text: '#e8eefc', muted: 'rgba(255,255,255,.7)', chip: '#0e1523', accent: '#8fb3ff' }
    : { card: '#11131a', line: 'rgba(255,255,255,.08)', text: '#e5e7eb', muted: '#9ca3af', chip: '#141827', accent: '#22d3ee' };

  // ---------- styles (scoped, raBdg-*) ----------
  const css = document.createElement('style');
  css.textContent = [
    '.raBdg-toasts{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px) + var(--ra-dock-h,0px));z-index:100001;display:flex;flex-direction:column;gap:8px;align-items:center;width:min(420px,calc(100vw - 32px));pointer-events:none}',
    '.raBdg-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;background:' + C.card + ';color:' + C.text + ';border:1px solid ' + C.line + ';border-left:4px solid var(--t);border-radius:12px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial;animation:raBdgIn .22s ease;touch-action:pan-y}',
    '.raBdg-toast b{color:var(--t)} .raBdg-toast .raBdg-x{margin-left:auto;background:none;border:0;color:' + C.muted + ';font-size:18px;line-height:1;cursor:pointer;padding:2px 4px}',
    '@keyframes raBdgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '.raBdg-back{position:fixed;inset:0;z-index:100000;background:rgba(5,6,10,.66);display:flex;align-items:center;justify-content:center;padding:12px}',
    '.raBdg-panel{width:min(600px,100%);max-height:min(86vh,900px);overflow:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box;background:' + C.card + ';color:' + C.text + ';border:1px solid ' + C.line + ';border-radius:14px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial}',
    '.raBdg-head{display:flex;align-items:center;gap:10px;margin-bottom:6px} .raBdg-head h3{margin:0;font-size:17px;font-weight:800}',
    '.raBdg-close{margin-left:auto;background:none;border:1px solid ' + C.line + ';color:' + C.text + ';border-radius:10px;padding:4px 10px;cursor:pointer;font-size:16px}',
    '.raBdg-sub{color:' + C.muted + ';font-size:12px;margin-bottom:10px}',
    '.raBdg-fam{margin:14px 0 6px;font-weight:700;font-size:13px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap} .raBdg-fam span{color:' + C.muted + ';font-weight:400;font-size:12px}',
    '.raBdg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}',
    '.raBdg-b{display:flex;gap:8px;align-items:flex-start;background:' + C.chip + ';border:1px solid ' + C.line + ';border-radius:10px;padding:8px;min-width:0}',
    '.raBdg-b.lock{opacity:.5} .raBdg-b.lock .raBdg-art{filter:grayscale(.85)}',
    '.raBdg-art{flex:0 0 40px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#0b0c10;background:var(--t);box-shadow:inset 0 0 0 3px rgba(0,0,0,.25);overflow:hidden}',
    '.raBdg-art{position:relative} .raBdg-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}',
    '.raBdg-b .n{font-weight:700;font-size:12.5px;overflow-wrap:anywhere} .raBdg-b .r{color:' + C.muted + ';font-size:11.5px;overflow-wrap:anywhere} .raBdg-b .t{font-size:11px;color:var(--t)}',
    '.raBdg-bar{height:4px;border-radius:4px;background:rgba(255,255,255,.08);margin-top:4px;overflow:hidden} .raBdg-bar i{display:block;height:100%;background:var(--t)}',
    '.raBdg-cta{margin:8px 0 2px;padding:10px;border:1px dashed ' + C.line + ';border-radius:10px;font-size:13px}',
    '.raBdg-foot{margin-top:14px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;color:' + C.muted + '}',
    '.raBdg-foot a{color:' + C.accent + ';text-decoration:none;font-weight:600}',
    '#raBadgesBtn{margin-left:auto}'
  ].join('\n');
  document.head.appendChild(css);

  // ---------- toast ----------
  function toastBox(){
    let box = document.querySelector('.raBdg-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'raBdg-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    return box;
  }
  const shown = new Set();
  function toast(b){
    if (!b || !b.name) return;
    const k = (b.id || b.name) + '';
    if (shown.has(k)) return; // the same badge is announced once per page
    shown.add(k);
    const t = tierOf(b.tier);
    const el = document.createElement('div');
    el.className = 'raBdg-toast';
    el.style.setProperty('--t', t.color);
    el.setAttribute('role', 'status');
    el.innerHTML = '<span aria-hidden="true">\u{1F3C5}</span><span>New badge: <b>' + esc(b.name) + '</b> · ' + esc(b.tierLabel || t.label) + '</span><button class="raBdg-x" aria-label="Dismiss">×</button>';
    const close = () => { if (el.parentNode) el.parentNode.removeChild(el); };
    el.addEventListener('click', close);
    let x0 = null;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => { if (x0 != null && Math.abs(e.changedTouches[0].clientX - x0) > 40) close(); x0 = null; });
    toastBox().appendChild(el);
    setTimeout(close, 4200);
  }
  function toastAll(list){ (Array.isArray(list) ? list : []).slice(0, 6).forEach((b, i) => setTimeout(() => toast(b), i * 350)); }
  window.raBadgeToast = toastAll;

  // Our own endpoints that may answer with `awarded` (server-decided).
  const AWARDING = /^\/api\/(generate-overlay|share-discord|anthony|token-media|auth\/me|auth\/sign-in|contest\/entry)(\?|$)/;
  const pathOf = (input) => {
    try {
      const u = new URL(typeof input === 'string' ? input : (input && input.url) || '', location.href);
      return u.origin === location.origin ? u.pathname + u.search : '';
    } catch (_) { return ''; }
  };
  if (typeof window.fetch === 'function') {
    const prevFetch = window.fetch;
    window.fetch = function(input, init){
      const p = prevFetch.apply(window, arguments);
      let path = '';
      try { path = pathOf(input); } catch (_) {}
      if (path && AWARDING.test(path)) {
        p.then((r) => {
          try {
            if (!r || !/json/i.test(r.headers.get('content-type') || '')) return;
            r.clone().json().then((j) => { if (j && Array.isArray(j.awarded) && j.awarded.length) { toastAll(j.awarded); if (panelOpen) loadPanel(); } }).catch(() => {});
          } catch (_) {}
        }).catch(() => {});
      }
      return p;
    };
  }

  // ---------- panel ----------
  let panelOpen = false;
  function closePanel(){ const b = document.querySelector('.raBdg-back'); if (b) b.remove(); panelOpen = false; document.removeEventListener('keydown', onKey); }
  function onKey(e){ if (e.key === 'Escape') closePanel(); }
  function openPanel(){
    closePanel();
    panelOpen = true;
    const back = document.createElement('div');
    back.className = 'raBdg-back';
    back.innerHTML = '<div class="raBdg-panel" role="dialog" aria-modal="true" aria-label="Builder badges">' +
      '<div class="raBdg-head"><span aria-hidden="true" style="font-size:20px;">\u{1F3C5}</span><h3>Builder Badges</h3><button class="raBdg-close" aria-label="Close">×</button></div>' +
      '<div class="raBdg-sub">Collectible Rebel Ants badges for what you make here. Not points, not transferable.</div>' +
      '<div id="raBdgBody" style="color:' + C.muted + ';">Loading…</div></div>';
    back.addEventListener('click', (e) => { if (e.target === back) closePanel(); });
    back.querySelector('.raBdg-close').addEventListener('click', closePanel);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    loadPanel();
  }
  window.raOpenBadges = openPanel;

  // Badge art lives on the economy site; while it is still being drawn (404)
  // the tier-coloured disc with the first letter shows through.
  function art(b, base){
    const t = tierOf(b.tier);
    const letter = esc(String((b.hidden ? '?' : b.name) || '?').trim().charAt(0).toUpperCase() || '?');
    const img = (b.art && base) ? '<img alt="" loading="lazy" src="' + esc(base + b.art) + '" onerror="this.remove()">' : '';
    return '<div class="raBdg-art" style="--t:' + t.color + '"><span>' + letter + '</span>' + img + '</div>';
  }

  async function loadPanel(){
    const body = document.getElementById('raBdgBody');
    if (!body) return;
    let j = null;
    try { j = await fetch('/api/badges/me', { cache: 'no-store', credentials: 'same-origin' }).then(r => r.json()); } catch (_) {}
    if (!document.getElementById('raBdgBody')) return;
    if (!j || !j.ok) { body.textContent = (j && j.enabled === false) ? 'Badges are coming soon to the Builder.' : 'Badges are taking a nap - try again in a moment.'; return; }
    if (j.enabled === false) { body.textContent = 'Badges are coming soon to the Builder.'; return; }
    const base = String(j.artBase || '').replace(/\/+$/, '');
    const earned = new Map((j.badges || []).filter(b => b && b.app === 'builder').map(b => [b.id, b]));
    const toGo = j.toGo || {};
    const fams = [];
    const byFam = {};
    (j.catalog || []).forEach(b => {
      const k = b.family || 'other';
      if (!byFam[k]) { byFam[k] = { name: b.familyName || k, items: [] }; fams.push(k); }
      byFam[k].items.push(b);
    });
    const total = (j.catalog || []).length;
    let html = '';
    if (!j.signedIn) {
      html += '<div class="raBdg-cta"><b>Sign in to collect badges.</b> ' + (navy
          ? 'Sign in in the <a href="/" style="color:' + C.accent + ';">Builder</a> (Discord or Commander name + PIN).'
          : 'Use the Commander card in the left panel (Discord or Commander name + PIN).') +
        (window.raDiscordLogin ? ' <button id="raBdgDiscord" class="btn" style="margin-left:4px;padding:6px 10px;font-size:12px;">Sign in with Discord</button>' : '') + '</div>';
    } else {
      html += '<div class="raBdg-sub" style="margin:0 0 4px;color:' + C.text + ';">' + esc(j.displayName || 'You') + ' · <b>' + earned.size + '</b> / ' + total + ' Builder badges</div>';
    }
    fams.forEach(k => {
      const f = byFam[k];
      html += '<div class="raBdg-fam">' + esc(f.name) + '</div><div class="raBdg-grid">';
      f.items.forEach(b => {
        const got = earned.get(b.id);
        const show = got ? Object.assign({}, b, { name: got.name || b.name, rule: got.rule || b.rule, art: got.art || b.art, hidden: false }) : b;
        const t = tierOf(show.tier);
        const prog = (!got && toGo[b.id]) ? toGo[b.id] : null;
        const bar = prog ? '<div class="r">' + Number(prog[0]).toLocaleString() + ' / ' + Number(prog[1]).toLocaleString() + '</div><div class="raBdg-bar"><i style="width:' + Math.max(3, Math.min(100, Math.round(100 * prog[0] / Math.max(1, prog[1])))) + '%"></i></div>' : '';
        html += '<div class="raBdg-b' + (got ? '' : ' lock') + '" style="--t:' + t.color + '" title="' + esc(show.rule || '') + '">' + art(show, base) +
          '<div style="min-width:0;flex:1"><div class="n">' + esc(show.name) + '</div><div class="t">' + esc(t.label) + (got ? ' · earned' : '') + '</div>' +
          '<div class="r">' + esc(show.rule || '') + '</div>' + bar + '</div></div>';
      });
      html += '</div>';
    });
    if (!total) html += '<div style="margin-top:8px;">No Builder badges listed yet.</div>';
    html += '<div class="raBdg-foot"><span>Secret badges stay hidden until earned.</span>' +
      (j.wallUrl ? '<a href="' + esc(j.wallUrl) + '" target="_blank" rel="noopener">See every badge ↗</a>' : '') + '</div>';
    body.style.color = '';
    body.innerHTML = html;
    const d = document.getElementById('raBdgDiscord');
    if (d) d.addEventListener('click', () => window.raDiscordLogin && window.raDiscordLogin());
  }

  // ---------- entry points ----------
  function mountButton(){
    const link = document.getElementById('raBadgesLink');
    if (link && !link.__raBdg) { link.__raBdg = true; link.addEventListener('click', (e) => { e.preventDefault(); openPanel(); }); }
    const brand = document.querySelector('.panel.left .brand') || document.querySelector('.brand');
    if (brand && !document.getElementById('raBadgesBtn')) {
      const b = document.createElement('button');
      b.id = 'raBadgesBtn'; b.type = 'button';
      b.className = 'ra-btn ra-ghost';
      b.innerHTML = '<span aria-hidden="true">\u{1F3C5}</span>&nbsp;Badges';
      b.addEventListener('click', openPanel);
      brand.appendChild(b);
    }
  }
  mountButton();
  document.addEventListener('DOMContentLoaded', mountButton);
  document.addEventListener('ra-auth-change', () => { if (panelOpen) loadPanel(); });
  // ?badges=1 (e.g. from the contest page) opens the list straight away
  try { if (/[?&]badges=1\b/.test(location.search)) setTimeout(openPanel, 600); } catch (_) {}
})();
