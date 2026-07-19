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
        ? { name: j.name, displayName: j.displayName || j.name, balance: j.balance, costPerGen: j.costPerGen, billing: !!j.billing, playerId: j.playerId, isAdmin: !!j.isAdmin }
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
      renderShop(el);
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
  // ---------- Buy $REBEL with APE ----------
  async function renderShop(card){
    let info = null;
    try { info = await fetch('/api/shop/packages', { cache:'no-store' }).then(r => r.json()); } catch(_){}
    if (!info || !info.ok || !info.enabled || !window.raSession) return;
    const box = document.createElement('div');
    box.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1);';
    box.innerHTML = '<div style="font-weight:600;margin-bottom:6px;">Buy $REBEL with APE</div>' +
      info.packages.map(p =>
        '<button class="btn raApePkg" data-id="' + p.id + '" style="width:100%;margin-bottom:6px;text-align:left;">' +
        escapeHtml(p.name) + ' - ' + escapeHtml(p.ape) + ' APE -> ' + Number(p.rebel).toLocaleString() + ' $REBEL</button>'
      ).join('') +
      '<div id="raApeStatus" style="font-size:12px;opacity:.75;min-height:16px;"></div>';
    card.appendChild(box);
    const status = box.querySelector('#raApeStatus');
    box.querySelectorAll('.raApePkg').forEach(btn => {
      btn.onclick = () => buyPackage(info, info.packages.find(p => p.id === btn.getAttribute('data-id')), status);
    });
  }

  async function buyPackage(info, pkg, status){
    const eth = window.ethereum;
    if (!eth) { status.textContent = 'No wallet found. Install MetaMask.'; return; }
    try {
      status.textContent = 'Connecting wallet...';
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      const from = accounts && accounts[0];
      if (!from) { status.textContent = 'No account.'; return; }
      // Ensure ApeChain
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: info.chainId }] });
      } catch (e) {
        if (e && (e.code === 4902 || /unrecognized|not added/i.test(String(e.message)))) {
          await eth.request({ method: 'wallet_addEthereumChain', params: [{
            chainId: info.chainId, chainName: info.chainName,
            rpcUrls: [info.rpcUrl], nativeCurrency: info.currency
          }]});
        } else throw e;
      }
      status.textContent = 'Confirm the ' + pkg.ape + ' APE payment in your wallet...';
      const txHash = await eth.request({ method: 'eth_sendTransaction', params: [{
        from, to: info.treasury, value: '0x' + BigInt(pkg.apeWei).toString(16)
      }]});
      status.textContent = 'Payment sent. Waiting for confirmation...';
      // Poll redeem until confirmed (up to ~2 min)
      for (let i = 0; i < 24; i++){
        await new Promise(r => setTimeout(r, 5000));
        let j = null;
        try {
          j = await fetch('/api/shop/redeem-ape', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txHash, packageId: pkg.id })
          }).then(r => r.json());
        } catch(_){}
        if (j && j.ok) {
          status.textContent = 'Credited ' + Number(j.credited).toLocaleString() + ' $REBEL!';
          refreshMe();
          return;
        }
        if (j && !j.pending && j.error && j.error !== 'tx_not_found_yet' && j.error !== 'awaiting_confirmation') {
          status.textContent = 'Redeem failed: ' + j.error + ' (tx ' + txHash.slice(0, 10) + '...)';
          return;
        }
        status.textContent = 'Waiting for confirmation... (' + (i + 1) + ')';
      }
      status.textContent = 'Still pending. Your tx: ' + txHash + ' - reload later; credit is automatic once confirmed and redeemed.';
    } catch (e) {
      status.textContent = (e && e.code === 4001) ? 'Cancelled.' : ('Payment failed: ' + (e && e.message || e).toString().slice(0, 80));
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
