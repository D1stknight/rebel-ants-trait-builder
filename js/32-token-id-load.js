// ============================================================================
// 32-token-id-load.js
// Original app.js lines 6564-6840 (277 lines)
// ============================================================================


/* ========== RA_TOKEN_ID_LOAD_v5 — Load button (reuse your display) + keep Custom Text clean ========== */
(()=>{
  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once:true });
    else fn();
  }

  const STATE = { id:null, text:null, ui:null };
  const C = ()=> window.canvas || null;

  // --- find the Token ID Styles card by its heading
  function findCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /token id styles/i.test(el.textContent||''));
    if (h) return h.closest('.card') || h.parentElement;
    return Array.from(document.querySelectorAll('.card,section,div'))
      .find(el => /token id styles/i.test(el.textContent||'')) || null;
  }

  // --- the main Token ID input (in the Upload area)
  function mainTokenInput(){
    return document.getElementById('tokenId')
        || document.querySelector('input#token')
        || document.querySelector('input[name="token"]')
        || document.querySelector('input[placeholder*="Token"]');
  }
  function readMainToken(){
    const el = mainTokenInput(); if (!el) return null;
    const n = parseInt((el.value||'').trim(),10);
    return Number.isFinite(n) ? n : null;
  }

  // --- locate your existing small "#—" field; add only the Load button
  function ensureUI(card){
    if (!card) return null;

    // Reuse your existing small display if present (input or output)
    let readout =
      card.querySelector('#raTokenIdDisplay') ||
      Array.from(card.querySelectorAll('input[type="text"],input:not([type]),output')).find(el=>{
        const t = ((el.value ?? el.textContent ?? el.placeholder) || '').toString().trim();
        return t.startsWith('#') || (el.placeholder||'').toString().trim().startsWith('#');
      }) || null;

    // If it’s an input, make it read‑only and tag it
    if (readout && readout.tagName && readout.tagName.toLowerCase()==='input'){
      readout.readOnly = true;
      if (!readout.id) readout.id = 'raTokenIdDisplay';
    }

    // Remove any stray extra output we might have made before (prevents the second box)
    Array.from(card.querySelectorAll('output#raTokenIdDisplay')).forEach(o=>{
      if (o !== readout) o.remove();
    });

    // Ensure the Load button exists, placed right after the readout if possible
    let loadBtn = card.querySelector('#raLoadTokenIdBtn') ||
      Array.from(card.querySelectorAll('button')).find(b=>/load token id/i.test(b.textContent||''));
    if (!loadBtn){
      loadBtn = document.createElement('button');
      loadBtn.id = 'raLoadTokenIdBtn';
      loadBtn.className = 'btn danger';
      loadBtn.textContent = 'Load Token ID';
      if (readout && readout.parentElement){
        readout.parentElement.insertBefore(loadBtn, readout.nextSibling);
      } else {
        const row = document.createElement('div');
        row.className = 'row';
        row.style.gap = '10px';
        row.appendChild(loadBtn);
        card.insertBefore(row, card.firstElementChild?.nextSibling || card.firstChild);
      }
    }

    // Use the existing Delete button on the card (we never add a second one)
    const delBtn = Array.from(card.querySelectorAll('button'))
      .find(b => /delete token id/i.test(b.textContent||''));

    return { card, loadBtn, delBtn, readout };
  }

  // --- find the style controls already on this card
  function findStyleCtrls(card){
    const fmt = Array.from(card.querySelectorAll('select')).find(s=>{
      const txt = Array.from(s.options||[]).map(o => (o.textContent||'').toLowerCase()).join('|');
      return /roman|hex|binary|leading|standard/.test(txt);
    }) || null;

    let size = null;
    const sizeLabel = Array.from(card.querySelectorAll('label')).find(l=>/size/i.test(l.textContent||''));
    if (sizeLabel){
      const wrap = sizeLabel.parentElement;
      size = wrap && (wrap.querySelector('input[type="number"]') || wrap.querySelector('input'));
    }
    if (!size){
      const nums = Array.from(card.querySelectorAll('input[type="number"]'));
      size = nums[0] || null;
    }

    const colors = Array.from(card.querySelectorAll('input[type="color"]')); // [fill, stroke]
    const fill   = colors[0] || null;
    const stroke = colors[1] || null;

    const width  = card.querySelector('input[type="range"]') || null;

    return { fmt, size, fill, stroke, width };
  }

  // --- helpers to format the number
  function roman(n){
    if (!Number.isFinite(n) || n<=0) return String(n);
    const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let out='', x=Math.floor(n);
    for (const [v,s] of map){ while (x>=v){ out+=s; x-=v; } }
    return out;
  }
  const toBinary = n => (n>>>0).toString(2);
  const toHex    = n => '0x'+(n>>>0).toString(16).toUpperCase();
  const pad4     = n => String(Math.max(0,Math.floor(n))).padStart(4,'0');
  function formatId(n, sel){
    const f = (sel && sel.value || '').toLowerCase();
    if (f.includes('roman'))  return roman(n);
    if (f.includes('hex'))    return toHex(n);
    if (f.includes('binary')) return toBinary(n);
    if (f.includes('leading') || f.includes('zeros')) return pad4(n);
    return String(n); // Standard
  }

  // --- create a single token‑ID Fabric text (marked so other UI can ignore it)
  function ensureTokenText(){
    const c = C(); if (!c || typeof fabric==='undefined') return null;

    if (STATE.text && STATE.text.canvas) return STATE.text;

    // remove any stale token‑id texts made by older code
    (c.getObjects?.()||[]).forEach(o=>{
      if (o && o._raTokenId && o !== STATE.text){ try{ c.remove(o); }catch(_){} }
    });

    const t = new fabric.Text('#', {
      left:24, top:24, originX:'left', originY:'top',
      fontFamily:'Impact, system-ui, Arial, Helvetica, sans-serif',
      fontWeight:'bold', lineHeight:1, charSpacing:0, padding:0,
      fill:'#ffffff', stroke:'#000000', strokeWidth:2, strokeUniform:true,
      selectable:true, evented:true, hasControls:true,
      _raTokenId:true, _raSys:true
    });
    const ccv = C(); ccv.add(t); STATE.text=t;
    try{ ccv.bringToFront(t);}catch(_){}
    ccv.requestRenderAll();
    return t;
  }

  // --- find the “Custom Text → Type your message” box
  function findCustomTextInput(){
    const cardTitle = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el=>/custom text/i.test(el.textContent||''));
    const card = cardTitle ? (cardTitle.closest('.card') || cardTitle.parentElement) : null;
    if (!card) return null;
    // textarea or large input for message
    return card.querySelector('textarea, input[type="text"], input:not([type])');
  }

  // --- if that box shows our token string, blank it (so the token id never “moves into” Custom Text)
  function scrubCustomTextBox(tokenShown){
    const msg = findCustomTextInput(); if (!msg) return;
    const val = (msg.value||'').trim();
    // only clear when it matches the token id we just rendered
    if (val === tokenShown){
      msg.value = '';
      try{ msg.dispatchEvent(new Event('input', {bubbles:true})); }catch(_){}
      try{ msg.dispatchEvent(new Event('change', {bubbles:true})); }catch(_){}
    }
  }

  // --- apply styles + keep Custom Text clean
  function applyStyles(){
    if (STATE.id==null || !STATE.ui) return;
    const c = C(); const t = ensureTokenText(); if (!c || !t) return;

    const { fmt, size, fill, stroke, width, readout } = STATE.ui;

    const shown = '#'+formatId(STATE.id, fmt);
    t.set({ text: shown });

    const fs = parseInt(size && size.value, 10);
    if (Number.isFinite(fs) && fs>0) t.set('fontSize', fs);

    if (fill   && fill.value)   t.set('fill',   fill.value);   // inside color
    if (stroke && stroke.value) t.set('stroke', stroke.value); // outline color

    const w = parseFloat(width && width.value);
    if (Number.isFinite(w)) t.set('strokeWidth', w);

    // make the selection box “hug” the glyphs
    t.set({ padding:0, lineHeight:1, dirty:true, noScaleCache:true });
    t.setCoords(); c.requestRenderAll();

    if (readout){
      if (readout.tagName && readout.tagName.toLowerCase()==='input'){ readout.value = shown; }
      else { readout.textContent = shown; }
    }

    // keep the Custom Text message box empty if it picked up our token text
    scrubCustomTextBox(shown);
    setTimeout(()=> scrubCustomTextBox(shown), 30); // run again after app’s own sync
  }

  // --- wire everything
  function wire(){
    const card = findCard(); if (!card) return false;

    const base = ensureUI(card); if (!base) return false;
    const styles = findStyleCtrls(base.card);
    STATE.ui = { ...base, ...styles };

    // Load Token ID
    base.loadBtn.addEventListener('click', (e)=>{
      try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
      const n = readMainToken();
      if (n==null){ alert('Type a number in the main “Token ID” field (e.g., 1111), then click “Load Token ID”.'); return; }
      STATE.id = n;
      applyStyles();
    }, true);

    // Hook your existing Delete Token ID button
    base.delBtn && base.delBtn.addEventListener('click', ()=>{
      const c = C();
      if (STATE.text && STATE.text.canvas){ try{ STATE.text.canvas.remove(STATE.text); }catch(_){} }
      STATE.text = null;
      if (STATE.ui && STATE.ui.readout){
        if (STATE.ui.readout.tagName && STATE.ui.readout.tagName.toLowerCase()==='input') STATE.ui.readout.value = '#—';
        else STATE.ui.readout.textContent = '#—';
      }
      c?.requestRenderAll();
    }, true);

    // Live style updates — only affect the token‑ID text
    [styles.fmt, styles.size, styles.fill, styles.stroke, styles.width].forEach(el=>{
      if (!el) return;
      el.addEventListener('input',  ()=>{ if (STATE.text) applyStyles(); });
      el.addEventListener('change', ()=>{ if (STATE.text) applyStyles(); });
    });

    // If you change the number later, click Load again to refresh it
    const main = mainTokenInput();
    main && main.addEventListener('change', ()=>{
      if (!STATE.text) return;
      const n = readMainToken();
      if (n!=null){ STATE.id = n; applyStyles(); }
    });

    // If selection switches to the token‑ID object, keep the Custom Text box clean
    const c = C();
    const scrubIfToken = ()=> {
      if (!STATE.text) return;
      const a = c?.getActiveObject?.();
      const uiText = '#'+formatId(STATE.id, styles.fmt);
      if (a && a._raTokenId) { scrubCustomTextBox(uiText); }
    };
    c?.on?.('selection:created', scrubIfToken);
    c?.on?.('selection:updated', scrubIfToken);

    return true;
  }

  function boot(){
    if (!wire()){
      // if the card appears late, try briefly
      let tries = 0;
      const iv = setInterval(()=>{ if (wire() || (++tries>40)) clearInterval(iv); }, 200);
    }
  }

 onReady(boot);
})();