// ============================================================================
// 61-signon.js — Commander Sign-in (Phase 4b)
// ============================================================================
// Same Commander Name + PIN accounts as the Playground. Session is an
// HttpOnly signed cookie issued by /api/auth/sign-in. Exposes
// window.raSession (null | {name, displayName, balance, costPerGen, billing,
// playerId, isAdmin, via:'name'|'discord', userId}). "Sign in with Discord"
// uses the shared Rebel sign-in (economy.rebelants.io, poker_session cookie).
// and fires 'ra-auth-change' on document when it changes.
// ============================================================================
;(() => {
  if (window.__RA_SIGNON_V1__) return;
  window.__RA_SIGNON_V1__ = true;
  window.raSession = null;

  const emit = () => { try { document.dispatchEvent(new CustomEvent('ra-auth-change', { detail: window.raSession })); } catch(_){} };

  async function refreshMe(){
    try {
      const j = await fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.json());
      if (j && j.economyUrl) window.__raEconomyUrl = String(j.economyUrl).replace(/\/+$/, '');
      window.raSession = (j && j.ok && j.signedIn)
        ? { name: j.name, displayName: j.displayName || j.name, balance: j.balance, costPerGen: j.costPerGen, billing: !!j.billing, playerId: j.playerId, isAdmin: !!j.isAdmin, via: j.via || 'name', userId: j.userId || null }
        : null;
      if (j && j.ok && !j.signedIn) window.__raSignonAvailable = true;
    } catch(_) { window.raSession = null; }
    emit();
    render();
  }
  window.raRefreshSession = refreshMe;

  // ---------- Shared Rebel sign-in (Discord, via the economy) ----------
  // The economy's Discord login comes back here with ?auth=ok (or
  // ?auth=cancelled|misconfigured|state|...). Show a short note and tidy the
  // param out of the address bar.
  let authNote = '';
  try {
    const u = new URL(location.href);
    const a = u.searchParams.get('auth');
    if (a) {
      authNote = (a === 'ok') ? '' : ({
        cancelled: 'Discord sign-in was cancelled.',
        misconfigured: 'Discord sign-in is not switched on yet.'
      })[a] || 'Discord sign-in did not finish - please try again.';
      u.searchParams.delete('auth');
      history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
    }
  } catch(_){}
  function discordLogin(){
    const eco = window.__raEconomyUrl || 'https://economy.rebelants.io';
    let back = location.href;
    try { const u = new URL(location.href); u.searchParams.delete('auth'); back = u.toString(); } catch(_){}
    location.href = eco + '/api/auth/discord/login?next=' + encodeURIComponent(back);
  }
  window.raDiscordLogin = discordLogin;

  // Self-styled card (matches the Wallet card look) with its own
  // collapsible header. Returns the BODY element that render() fills.
  function card(){
    let body = document.getElementById('raSignonBody');
    if (body) return body;
    let anchor = document.getElementById('ra-wallet-mini');
    if (!anchor) {
      const hs = Array.from(document.querySelectorAll('h2,h3,h4,strong,b'));
      const w = hs.find(x => /^\s*wallet\b/i.test(x.textContent || ''));
      anchor = w ? (w.closest('section') || w.closest('.card') || w.parentElement) : null;
    }
    const wrap = document.createElement('div');
    wrap.id = 'raSignonCard';
    wrap.innerHTML = [
      '<div class="panel" style="margin:12px 0;padding:10px;border-radius:8px;background:#121317;border:1px solid rgba(255,255,255,.08);color:#e6e6e6;font-size:12px;line-height:1.4;">',
      '<div style="display:flex;align-items:center;justify-content:space-between;">',
      '<strong id="raSignonTitle" style="font-size:13px;cursor:pointer;user-select:none;" title="Click to collapse/expand">Commander <span id="raSignonCaret" style="opacity:.6;font-size:11px;">&#9662;</span></strong>',
      '</div>',
      '<div id="raSignonBody" style="margin-top:8px;"></div>',
      '</div>'
    ].join('');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    else document.body.appendChild(wrap);

    const bodyEl = wrap.querySelector('#raSignonBody');
    const caret = wrap.querySelector('#raSignonCaret');
    const KEY = 'ra_signon_collapsed';
    const apply = (c) => { bodyEl.style.display = c ? 'none' : ''; caret.innerHTML = c ? '&#9656;' : '&#9662;'; };
    let collapsed = false;
    try { collapsed = localStorage.getItem(KEY) === '1'; } catch(_){}
    apply(collapsed);
    wrap.querySelector('#raSignonTitle').addEventListener('click', () => {
      collapsed = !collapsed;
      try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch(_){}
      apply(collapsed);
    });
    return bodyEl;
  }

  function render(){
    const el = card();
    const s = window.raSession;
    if (s) {
      const bal = (s.balance == null) ? '' :
        '<div style="opacity:.85;margin-top:4px;">Balance: <b>' + Number(s.balance).toLocaleString() + '</b> $REBEL</div>';
      el.innerHTML = [
        '<div>Signed in as <b>' + escapeHtml(s.displayName || s.name) + '</b>' + (s.via === 'discord' ? ' <span style="opacity:.6;">(Discord)</span>' : '') + '</div>',
        bal,
        '<button id="raSignOut" class="btn" style="margin-top:8px;">Sign out</button>'
      ].join('');
      el.querySelector('#raSignOut').onclick = async () => {
        try { await fetch('/api/auth/sign-out', { method: 'POST' }); } catch(_){}
        window.raSession = null; emit(); render();
      };
      renderShop(el);
    } else {
      el.innerHTML = [
        '<button id="raSiDiscord" class="btn" style="width:100%;margin-bottom:8px;">Sign in with Discord</button>',
        authNote ? '<div style="margin:0 0 8px;font-size:12px;color:#fca5a5;">' + escapeHtml(authNote) + '</div>' : '',
        '<div style="opacity:.6;font-size:12px;margin:0 0 8px;">Or sign in with the same Commander name + PIN as the Playground.</div>',
        '<input id="raSiName" type="text" placeholder="Commander name" autocomplete="username" ',
        ' style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px;margin-bottom:6px;" />',
        '<input id="raSiPin" type="password" placeholder="PIN" autocomplete="current-password" ',
        ' style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px;margin-bottom:8px;" />',
        '<button id="raSiBtn" class="btn" style="width:100%;">Sign in</button>',
        '<div id="raSiStatus" style="margin-top:6px;font-size:12px;opacity:.75;"></div>'
      ].join('');
      const status = el.querySelector('#raSiStatus');
      const doSignIn = async () => {
        const name = el.querySelector('#raSiName').value.trim();
        const pin = el.querySelector('#raSiPin').value.trim();
        if (!name || !pin) { status.textContent = 'Enter name and PIN.'; return; }
        status.textContent = 'Signing in...';
        try {
          const r = await fetch('/api/auth/sign-in', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, pin })
          });
          const j = await r.json().catch(() => null);
          if (r.ok && j && j.ok) { status.textContent = ''; refreshMe(); }
          else status.textContent = ({
            commander_not_found: 'Commander name not found.',
            incorrect_pin: 'Incorrect PIN.',
            no_pin_set: 'No PIN set for this name.',
            signon_not_configured: 'Sign-on not configured yet (server env).',
            kv_not_configured: 'Server storage not configured.'
          })[j && j.error] || ('Failed: ' + ((j && j.error) || r.status));
        } catch (e) { status.textContent = 'Network error.'; }
      };
      el.querySelector('#raSiBtn').onclick = doSignIn;
      el.querySelector('#raSiDiscord').onclick = discordLogin;
      el.querySelector('#raSiPin').addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
    }
  }
  // ---------- Buy Rebel Points: the one Rebel shop (same as every Rebel app) ----------
  // Packs by card, in APE or in ETH, in the Rebel points shop, opened in a new tab signed in as this
  // player (/api/shop/open). Coming back to this tab reads the balance again.
  let shopOpened = false;
  document.addEventListener('visibilitychange', () => {
    if (shopOpened && document.visibilityState === 'visible') { shopOpened = false; refreshMe(); }
  });
  function renderShop(card){
    if (!window.raSession) return;
    const box = document.createElement('div');
    box.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);';
    const back = location.pathname + location.search;
    box.innerHTML = '<div style="font-weight:600;margin-bottom:4px;">Buy Rebel Points</div>' +
      '<div style="font-size:12px;opacity:.75;margin-bottom:8px;">Packs by card, in APE or in ETH, in the Rebel Ants shop (the same one as the Playground and The Underground).</div>' +
      '<a class="btn primary" id="raShopOpen" target="_blank" rel="opener" href="/api/shop/open?return=' + encodeURIComponent(back) + '" style="display:block;text-align:center;text-decoration:none;">Open the points shop</a>' +
      '<div id="raShopStatus" style="font-size:12px;opacity:.75;min-height:16px;margin-top:6px;"></div>';
    card.appendChild(box);
    box.querySelector('#raShopOpen').addEventListener('click', () => {
      shopOpened = true;
      box.querySelector('#raShopStatus').textContent = 'The shop opened in a new tab. Your balance updates when you come back.';
    });
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (document.getElementById('raSignonCard') || card()) { clearInterval(t); refreshMe(); }
    if (tries > 60) clearInterval(t);
  }, 300);
})();
