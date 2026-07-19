// ============================================================================
// 61-signon.js — Commander Sign-in (Phase 4b)
// ============================================================================
// Same Commander Name + PIN accounts as the Playground. Session is an
// HttpOnly signed cookie issued by /api/auth/sign-in. Exposes
// window.raSession (null | {name, displayName, balance, costPerGen, billing})
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
      window.raSession = (j && j.ok && j.signedIn)
        ? { name: j.name, displayName: j.displayName || j.name, balance: j.balance, costPerGen: j.costPerGen, billing: !!j.billing, playerId: j.playerId }
        : null;
      if (j && j.ok && !j.signedIn) window.__raSignonAvailable = true;
    } catch(_) { window.raSession = null; }
    emit();
    render();
  }
  window.raRefreshSession = refreshMe;

  function card(){
    let el = document.getElementById('raSignonCard');
    if (el) return el;
    // Place after the Wallet card in the left column
    const hs = Array.from(document.querySelectorAll('h2,h3,h4,strong,b'));
    const w = hs.find(x => /^\s*wallet\s*$/i.test(x.textContent || ''));
    const anchor = w ? (w.closest('section') || w.closest('.card') || w.parentElement) : null;
    el = document.createElement(anchor ? anchor.tagName : 'section');
    if (anchor && anchor.className) el.className = anchor.className;
    el.id = 'raSignonCard';
    el.style.marginTop = '14px';
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
    else document.body.appendChild(el);
    return el;
  }

  function render(){
    const el = card();
    const s = window.raSession;
    if (s) {
      const bal = (s.balance == null) ? '' :
        '<div style="opacity:.85;margin-top:4px;">Balance: <b>' + Number(s.balance).toLocaleString() + '</b> $REBEL</div>';
      el.innerHTML = [
        '<div style="font-weight:700;font-size:15px;">Commander</div>',
        '<div style="margin-top:6px;">Signed in as <b>' + escapeHtml(s.displayName || s.name) + '</b></div>',
        bal,
        '<button id="raSignOut" class="btn" style="margin-top:8px;">Sign out</button>'
      ].join('');
      el.querySelector('#raSignOut').onclick = async () => {
        try { await fetch('/api/auth/sign-out', { method: 'POST' }); } catch(_){}
        window.raSession = null; emit(); render();
      };
    } else {
      el.innerHTML = [
        '<div style="font-weight:700;font-size:15px;">Commander Sign-in</div>',
        '<div style="opacity:.6;font-size:12px;margin:4px 0 8px;">Same name + PIN as the Playground.</div>',
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
      el.querySelector('#raSiPin').addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
    }
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (document.getElementById('raSignonCard') || card()) { clearInterval(t); refreshMe(); }
    if (tries > 60) clearInterval(t);
  }, 300);
})();
