// ============================================================================
// 29-collections-admin.js
// Original app.js lines 5678-5857 (180 lines)
// ============================================================================


/* ========== RA_COLLECTIONS_ADMIN_v1.2 — adds Chain (hex) + RPC URL columns ========== */
(()=> {
  if (!/\badmin=1\b/i.test(location.search)) return;

  // Build panel
  const card = document.createElement('section');
  card.id = 'raCollPanel';
  card.style.cssText = 'margin:12px 0;padding:10px;border:1px solid #23242a;border-radius:12px;background:#0f1116;color:#e7e7ea';
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <strong>Collections (wallet holder check)</strong>
      <div>
        <button id="raCollReload" class="btn small">Reload</button>
        <button id="raCollSave" class="btn small">Save to server</button>
      </div>
    </div>
    <div style="opacity:.7;font-size:12px;margin-top:6px">
      Use <b>hex</b> Chain IDs (e.g., 0x1 Ethereum, 0x8173 ApeChain). RPC URL is optional (helps custom chains).
    </div>
    <div style="overflow:auto;margin-top:8px">
      <table id="raCollTable" style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="text-align:left;border-bottom:1px solid #23242a">
            <th style="padding:6px 4px;min-width:140px">Name</th>
            <th style="padding:6px 4px;min-width:360px">Contract address</th>
            <th style="padding:6px 4px;min-width:90px">Chain (hex)</th>
            <th style="padding:6px 4px;min-width:90px">Tag</th>
            <th style="padding:6px 4px;min-width:280px">RPC URL (optional)</th>
            <th style="padding:6px 4px;min-width:40px"></th>
          </tr>
        </thead>
        <tbody id="raCollBody"></tbody>
      </table>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button id="raCollAdd" class="btn small">+ Add row</button>
      <button id="raCollSeed" class="btn small">Quick add sample rows</button>
      <span id="raCollMsg" style="font-size:12px;opacity:.75"></span>
    </div>
  `;
  // Try to place near other admin boxes
  const leftCol = document.querySelector('#left, .left, .sidebar, .panels, .controls, .col-left');
  (leftCol || document.body).appendChild(card);

  const body = card.querySelector('#raCollBody');
  const msg  = card.querySelector('#raCollMsg');

  let rows = [];

  function setMsg(t){ msg.textContent = t||''; if (t) setTimeout(()=>{ if (msg.textContent===t) msg.textContent=''; }, 2000); }

  function mkInput(val, placeholder, width){
    const i = document.createElement('input');
    i.type = 'text';
    i.value = val || '';
    i.placeholder = placeholder || '';
    i.style.cssText = `width:${width||'100%'};box-sizing:border-box;background:#12151c;border:1px solid #2a2e37;border-radius:6px;color:#e7e7ea;padding:6px`;
    return i;
  }
  function mkSelect(val){
    const s = document.createElement('select');
    s.innerHTML = `<option value="rebel">rebel</option><option value="friend">friend</option>`;
    s.value = (val==='rebel' ? 'rebel' : 'friend');
    s.style.cssText = 'background:#12151c;border:1px solid #2a2e37;border-radius:6px;color:#e7e7ea;padding:6px';
    return s;
  }
  function render(){
    body.innerHTML = '';
    rows.forEach((r, idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px"></td>
        <td style="padding:6px 4px;text-align:right"></td>
      `;
      const td = tr.querySelectorAll('td');

      const inName = mkInput(r.name, 'Chumpz (ApeChain)', '100%');
      const inAddr = mkInput(r.address, '0x…40 hex', '100%');
      const inChain= mkInput(r.chainId || '0x1', '0x1 / 0x2105 / 0x8173', '110px');
      const selTag = mkSelect(r.tag);
      const inRpc  = mkInput(r.rpcUrl || '', 'https://...', '100%');

      td[0].appendChild(inName);
      td[1].appendChild(inAddr);
      td[2].appendChild(inChain);
      td[3].appendChild(selTag);
      td[4].appendChild(inRpc);

      const del = document.createElement('button');
      del.textContent = '×';
      del.className = 'btn small';
      del.style.cssText = 'padding:4px 8px';
      del.onclick = ()=>{ rows.splice(idx,1); render(); };
      td[5].appendChild(del);

      // Keep rows in sync
      [inName,inAddr,inChain,selTag,inRpc].forEach(el=>{
        el.addEventListener('input', ()=>{
          r.name    = inName.value.trim();
          r.address = inAddr.value.trim();
          r.chainId = inChain.value.trim();
          r.tag     = selTag.value;
          r.rpcUrl  = inRpc.value.trim();
        });
      });

      body.appendChild(tr);
    });
  }

  async function load(){
    setMsg('Loading…');
    try{
      const r = await fetch('/api/ra-collections');
      const j = await r.json();
      rows = Array.isArray(j.collections) ? j.collections.slice() : [];
      // If any row lacks chainId (old saves), default to 0x1 so it’s visible/editable.
      rows.forEach(r => { if (!r.chainId) r.chainId = '0x1'; });
      render();
      setMsg('Loaded');
    }catch(_){ setMsg('Load failed'); }
  }

  async function save(){
    setMsg('Saving…');

    // quick validate
    const okAddr = x => /^0x[a-fA-F0-9]{40}$/.test(x||'');
    const okHex  = x => /^0x[0-9a-fA-F]+$/.test(x||'');
    const okUrl  = x => !x || /^https?:\/\/\S+$/i.test(x);

    const cleaned = rows
      .map(r => ({
        name: (r.name||'').trim().slice(0,80),
        address: (r.address||'').trim(),
        chainId: (r.chainId||'').trim().toLowerCase(),
        tag: (r.tag==='rebel'?'rebel':'friend'),
        rpcUrl: (r.rpcUrl||'').trim()
      }))
      .filter(r => r.name && okAddr(r.address) && okHex(r.chainId) && okUrl(r.rpcUrl));

    try{
      const r = await fetch('/api/ra-collections', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ collections: cleaned })
      });
      if (!r.ok) throw new Error('bad');
      setMsg('Saved');
    }catch(_){ setMsg('Save failed'); }
  }

  function addRow(){
    rows.push({ name:'', address:'', chainId:'0x1', tag:'friend', rpcUrl:'' });
    render();
  }
  function seed(){
    rows = [
      { name:'Rebel Ants',        address:'0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221', chainId:'0x1',    tag:'rebel'  },
      { name:'Saints of LA',      address:'0xbEd2470deD2519c13EaaF3Bd970015ef404d3D20', chainId:'0x1',    tag:'friend' },
      { name:'Chumpz (ApeChain)', address:'0xa9a1d086623475595a02991664742e4a1cbafcb8', chainId:'0x8173', tag:'friend',
        rpcUrl:'https://apechain.calderachain.xyz/http' }
    ];
    render();
    setMsg('Sample rows added — edit then Save to server.');
  }

  card.querySelector('#raCollReload').onclick = load;
  card.querySelector('#raCollSave').onclick   = save;
  card.querySelector('#raCollAdd').onclick    = addRow;
  card.querySelector('#raCollSeed').onclick   = seed;

  // First load
  load();
})();