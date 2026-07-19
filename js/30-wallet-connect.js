// ============================================================================
// 30-wallet-connect.js
// Original app.js lines 5858-6130 (273 lines)
// ============================================================================


/* ========== RA_WALLET_CONNECT_MINI_v1 — connect + refresh + disconnect + robust check ========== */
(()=>{
  const qs  = (s,r=document)=>r.querySelector(s);

  // --- UI ---
  const box = document.createElement('div');
  box.id = 'ra-wallet-mini';
  box.innerHTML = `
    <div class="panel" style="margin:12px 0;padding:10px;border-radius:8px;background:#121317;border:1px solid rgba(255,255,255,.08);color:#e6e6e6;font-size:12px;line-height:1.4;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <strong style="font-size:13px;cursor:pointer;user-select:none;" id="raW_title" title="Click to collapse/expand">Wallet <span id="raW_caret" style="opacity:.6;font-size:11px;">&#9662;</span></strong>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="raW_refresh"   class="btn" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:#1c1f26;border-radius:6px;color:#fff;cursor:pointer;display:none;">Refresh</button>
          <button id="raW_disconnect"class="btn" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:#1c1f26;border-radius:6px;color:#fff;cursor:pointer;display:none;">Disconnect</button>
          <button id="raW_connect"   class="btn" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:#1c1f26;border-radius:6px;color:#fff;cursor:pointer;">Connect</button>
        </div>
      </div>

      <div id="raW_row1" style="margin-top:8px; display:none;">
        <div><span style="opacity:.65;">Address:</span> <span id="raW_addr" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;"></span></div>
        <div><span style="opacity:.65;">Network:</span> <span id="raW_chain"></span></div>
      </div>

      <div id="raW_actions" style="margin-top:10px; display:none;">
        <button id="raW_check" class="btn" style="padding:6px 10px;border:1px solid rgba(255,255,255,.12);background:#1c1f26;border-radius:6px;color:#fff;cursor:pointer;">Check holdings</button>
        <span id="raW_hint" style="margin-left:8px;opacity:.65;font-size:11px;"></span>
      </div>

      <div id="raW_out" style="margin-top:10px; white-space:pre-wrap;"></div>
    </div>
  `;
  const leftCol = qs('#left, .left, .sidebar, .panels, .controls, .col-left');
  // Insert BELOW the brand header so "Rebel Ants Builder 2.0" stays on top.
  const brandEl = leftCol && leftCol.querySelector('.brand');
  if (brandEl && brandEl.parentNode === leftCol) {
    leftCol.insertBefore(box, brandEl.nextSibling);
  } else if (leftCol && leftCol.firstChild) {
    leftCol.insertBefore(box, leftCol.firstChild);
  } else {
    document.body.insertBefore(box, document.body.firstChild);
  }

  // --- Els
  const btnConnect = qs('#raW_connect',    box);
  const btnRefresh = qs('#raW_refresh',    box);
  const btnDisc    = qs('#raW_disconnect', box);
  const btnCheck   = qs('#raW_check',      box);
  const row1       = qs('#raW_row1',       box);
  const actions    = qs('#raW_actions',    box);
  const out        = qs('#raW_out',        box);
  const addrEl     = qs('#raW_addr',       box);
  const chainEl    = qs('#raW_chain',      box);
  const hintEl     = qs('#raW_hint',       box);

  // Collapsible: click the Wallet title to hide/show the card body.
  // Remembers the choice; header buttons stay usable while collapsed.
  const COLLAPSE_KEY = 'ra_wallet_collapsed';
  function applyCollapsed(collapsed){
    ['#raW_row1', '#raW_actions', '#raW_out'].forEach(sel => {
      const el = qs(sel, box);
      if (el) el.dataset.raKeepHidden = collapsed ? '1' : '';
    });
    box.classList.toggle('ra-wallet-collapsed', collapsed);
    const caret = qs('#raW_caret', box);
    if (caret) caret.innerHTML = collapsed ? '&#9656;' : '&#9662;';
    // Hide only what is currently visible; connect/refresh logic re-shows
    // sections later, so a CSS rule does the persistent hiding.
  }
  if (!document.getElementById('raWalletCollapseCss')) {
    const st = document.createElement('style');
    st.id = 'raWalletCollapseCss';
    st.textContent = '#ra-wallet-mini.ra-wallet-collapsed #raW_row1,#ra-wallet-mini.ra-wallet-collapsed #raW_actions,#ra-wallet-mini.ra-wallet-collapsed #raW_out{display:none !important;}';
    document.head.appendChild(st);
  }
  let walletCollapsed = false;
  try { walletCollapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch(_){}
  applyCollapsed(walletCollapsed);
  qs('#raW_title', box).addEventListener('click', () => {
    walletCollapsed = !walletCollapsed;
    try { localStorage.setItem(COLLAPSE_KEY, walletCollapsed ? '1' : '0'); } catch(_){}
    applyCollapsed(walletCollapsed);
  });

  // --- State
  window.RA_WALLET_STATE = { connected:false, address:null, chainId:null, provider:null };
  window.RA_HOLDER_STATE = { checked:false, hasRebel:false, hasFriend:false, matches:[] };

  // --- Chain names (includes ApeChain + Base)
  function netNameFromChainId(cidHex){
    const map = {
      '0x1':      'Ethereum',
      '0xaa36a7': 'Sepolia',
      '0x2105':   'Base',
      '0x14a33':  'Base Sepolia',
      '0xa4b1':   'Arbitrum One',
      '0x89':     'Polygon',
      '0x8173':   'ApeChain'     // <— added
    };
    const k = (cidHex||'').toLowerCase();
    return map[k] || cidHex;
  }
  const short = a => !a ? '' : (a.slice(0,6)+'…'+a.slice(-4));

  // --- Collections API
  async function getCollectionsFor(chainIdHex){
    try{
      const r = await fetch('/api/ra-collections');
      if (r.ok){
        const j = await r.json();
        return (j.collections||[]).filter(c => (c.chainId||'').toLowerCase() === (chainIdHex||'').toLowerCase());
      }
    }catch(_){}
    return [];
  }

  // --- ERC-721 balanceOf via wallet provider
  async function balanceOf(provider, contract, owner){
    const data = '0x70a08231' + owner.replace(/^0x/,'').padStart(64,'0');
    const hex = await provider.request({ method:'eth_call', params:[{ to:contract, data }, 'latest'] });
    try { return (BigInt(hex) > 0n); } catch { return false; }
  }

  // --- ERC-721 balanceOf via raw RPC (fallback for custom networks)
  async function balanceOfRpc(rpcUrl, contract, owner){
    if (!rpcUrl) return false;
    const data = '0x70a08231' + owner.replace(/^0x/,'').padStart(64,'0');
    try{
      const r = await fetch(rpcUrl, {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ id:1, jsonrpc:'2.0', method:'eth_call', params:[ { to:contract, data }, 'latest' ] })
      });
      const j = await r.json();
      const hex = j && j.result;
      if (!hex) return false;
      return (BigInt(hex) > 0n);
    }catch(_){ return false; }
  }

  // --- Connect / Refresh / Disconnect

  // Implementation F: Wallet connect reentrancy guard
  let CONNECTING = false;

  async function connect(){
    const eth = window.ethereum;
    if (!eth){ out.textContent='No wallet detected (MetaMask/Coinbase).'; return; }
    
// Reentrancy guard (supports legacy and new flags)
if (window.__walletConnecting || (typeof CONNECTING !== 'undefined' && CONNECTING)) {
  if (out) out.textContent = 'Connection in progress...';
  return;
}
window.__walletConnecting = true;
if (typeof CONNECTING !== 'undefined') CONNECTING = true;
    try{
      out.textContent = 'Connecting...';
      const accounts = await eth.request({ method:'eth_requestAccounts' });
      const chainId  = await eth.request({ method:'eth_chainId' });
      const address  = accounts?.[0] || null;
      setConnected(!!address, address, chainId, eth, 'Connected. Click “Check holdings”.');
} catch (err) {
  // Handle user cancellation (error code 4001) more gracefully
  if (err && err.code === 4001) {
    if (out) out.textContent = 'Request cancelled';
    // Clear the message after a short delay for next attempt
    setTimeout(() => {
      if (out && out.textContent === 'Request cancelled') out.textContent = '';
    }, 2000);
  } else {
    console.error('Wallet connect error:', err);
    if (out) out.textContent = 'Connection failed. Please try again.';
    // Clear error message after delay
    setTimeout(() => {
      if (out && (out.textContent === 'Connection failed' || out.textContent === 'Connection failed. Please try again.')) {
        out.textContent = '';
      }
    }, 3000);
  }
} finally {
  // Clear both reentrancy flags
  window.__walletConnecting = false;
  if (typeof CONNECTING !== 'undefined') CONNECTING = false;
}
  }
  
  async function refresh(){
    const eth = window.ethereum;
    if (!eth){ out.textContent='No wallet detected.'; return; }
    try{
      const accounts = await eth.request({ method:'eth_accounts' }); // no popup
      const chainId  = await eth.request({ method:'eth_chainId' });
      const address  = accounts?.[0] || null;
      if (!address){
        setDisconnected('No active account. Click Connect.');
      } else {
        setConnected(true, address, chainId, eth, 'Refreshed. Click “Check holdings”.');
      }
    }catch(_){ out.textContent='Refresh failed.'; }
  }
  async function disconnect(){
    // Real disconnect where supported: revoke the site's eth_accounts
    // permission (MetaMask supports wallet_revokePermissions). Falls back to
    // a soft app-side disconnect on wallets that don't support it.
    let revoked = false;
    try {
      if (window.ethereum && window.ethereum.request) {
        await window.ethereum.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
        revoked = true;
      }
    } catch(_){ /* wallet does not support revoke - soft disconnect below */ }

    window.RA_HOLDER_STATE = { checked: false, hasRebel: false, hasFriend: false, matches: [] };
    window.__raWMForce = null; // Remove any holder-based overlay override

    setDisconnected(revoked
      ? 'Disconnected. This site\'s wallet permission was revoked.'
      : 'Disconnected in app. (Your wallet doesn\'t support site revoke - use the wallet menu for a full disconnect.)');

    try { 
      document.dispatchEvent(new CustomEvent('ra-holder-update', { detail: window.RA_HOLDER_STATE })); 
    } catch(_) {}
  }

  function setConnected(ok, address, chainId, provider, msg){
    window.RA_WALLET_STATE = { connected: ok, address, chainId, provider };
    qs('#raW_connect', box).style.display  = ok ? 'none' : '';
    btnRefresh.style.display = ok ? '' : 'none';
    btnDisc.style.display    = ok ? '' : 'none';
    row1.style.display       = ok ? '' : 'none';
    actions.style.display    = ok ? '' : 'none';
    addrEl.textContent       = short(address||'');
    chainEl.textContent      = netNameFromChainId(chainId||'');
    hintEl.textContent       = ok ? 'Switch accounts/networks? Click Refresh.' : '';
    out.textContent          = msg || '';
  }
  function setDisconnected(msg){
    window.RA_WALLET_STATE = { connected:false, address:null, chainId:null, provider:null };
    
    // Reset holder state when disconnected
    window.RA_HOLDER_STATE = { checked: false, hasRebel: false, hasFriend: false, matches: [] };
    window.__raWMForce = null; // Remove any holder-based overlay override
    
    qs('#raW_connect', box).style.display  = '';
    btnRefresh.style.display = 'none';
    btnDisc.style.display    = 'none';
    row1.style.display       = 'none';
    actions.style.display    = 'none';
    out.textContent          = msg || '';

    try { 
      document.dispatchEvent(new CustomEvent('ra-holder-update', { detail: window.RA_HOLDER_STATE })); 
    } catch(_) {}
  }

  // --- Holdings
  async function checkHoldings(){
    const { provider, address, chainId } = window.RA_WALLET_STATE || {};
    if (!provider || !address || !chainId){ out.textContent='Connect your wallet first.'; return; }
    out.textContent = 'Checking…';

    const cols = await getCollectionsFor(chainId);
    if (!cols.length){
      out.textContent = `No collections configured for ${netNameFromChainId(chainId)}.`;
      window.RA_HOLDER_STATE = { checked:true, hasRebel:false, hasFriend:false, matches:[] };
      document.dispatchEvent(new CustomEvent('ra-holder-update', { detail: window.RA_HOLDER_STATE }));
      return;
    }

    const matches = [];
    for (const c of cols){
      let ok = false;
      // try wallet provider first
      try { ok = await balanceOf(provider, c.address, address); } catch(_){}
      // fallback to RPC if provided (helps custom networks like ApeChain)
      if (!ok && c.rpcUrl) {
        try { ok = await balanceOfRpc(c.rpcUrl, c.address, address); } catch(_){}
      }
      matches.push({ ...c, holds: ok });
    }

    const hasRebel  = matches.some(m => m.holds && m.tag==='rebel');
    const hasFriend = matches.some(m => m.holds && m.tag!=='rebel');

    window.RA_HOLDER_STATE = { checked:true, hasRebel, hasFriend, matches };
    document.dispatchEvent(new CustomEvent('ra-holder-update', { detail: window.RA_HOLDER_STATE }));

    const lines = [
      `Chain: ${netNameFromChainId(chainId)}`,
      `Address: ${short(address)}`,
      '',
      ...matches.map(r => `• ${r.name||r.address} — ${r.holds ? '✅ holds' : '—'}`),
      '',
      `Summary: ${hasRebel ? 'Rebel holder' : 'No Rebel'}${hasFriend ? ' + Friend collection' : ''}`
    ];
    out.textContent = lines.join('\n');
  }

  // --- Wire
  qs('#raW_connect', box).addEventListener('click', connect);
  btnRefresh.addEventListener('click', refresh);
  btnDisc.addEventListener('click', disconnect);
  btnCheck  .addEventListener('click', checkHoldings);

  // update on wallet events
  if (window.ethereum){
    ethereum.on?.('accountsChanged', ()=>{ 
      out.textContent = ''; // Clear status on account change
      hintEl.textContent='Account changed — click Refresh.'; 
    });
    ethereum.on?.('chainChanged',   cid=>{ 
      out.textContent = ''; // Clear status on chain change
      chainEl.textContent = netNameFromChainId(cid); hintEl.textContent='Network changed — click Refresh.'; 
    });
  }

  // optional: try a silent refresh on load
  (async ()=>{ try{ await refresh(); }catch(_){} })();
})();