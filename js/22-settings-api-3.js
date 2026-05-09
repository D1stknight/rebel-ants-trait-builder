// ============================================================================
// 22-settings-api-3.js
// Original app.js lines 4701-4846 (146 lines)
// ============================================================================


  // 3) Follow canvas changes: apply whenever something is added/modified
  function wire(){
    const c = C(); if (!c || c.__raWmFollow) { if (!c) setTimeout(wire, 150); return; }
    c.__raWmFollow = true;
    c.on('object:added',    ()=> applyToCanvas(latest));
    c.on('object:modified', ()=> applyToCanvas(latest));
  }
  wire();
})();


(() => {
  const API = '/api/ra-settings';

  // --- Fabric helpers ---
  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;
  const $ = (id) => document.getElementById(id);

  function baseIsToken(){
    const c = C(); if (!c) return null;
    const base = (c.getObjects()||[]).find(o => o && o._isBase && !o._isBgRect);
    if (!base) return null;
    // in your app: token base = plain Image; uploads = Group
    return base.type === 'image';
  }

  function findWM(){
    const c = C(); if (!c) return null;
    return (c.getObjects()||[]).find(o => o && false) || null;
  }

  // --- server I/O ---
  async function getServer(){
    const r = await fetch(API + (API.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache:'no-store' });
    if (!r.ok) throw new Error('GET failed');
    const j = await r.json();
    return j.settings ?? j.data ?? j;
  }
  async function postServer(body){
    await fetch(API, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
  }

  // --- current UI values (when admin panel is visible) ---
  function readAdminUI(){
    return {
      enabled:       !!($('raWmCEnabled')?.checked),
      showOnTokens:  !!($('raWmCOnTok')?.checked),
      showOnUploads: !!($('raWmCOnUp')?.checked),
      opacity:  Number($('raWmCOpacity')?.value ?? 0.18),
      sizePct:  Number($('raWmCSize')?.value ?? 0.88)
    };
  }

  function applyToWM(s){
    const c = C(); const wm = findWM();
    if (!c || !wm || !s) return;

    // 1) visibility: obey Enabled + token/upload switches
    const isTok = baseIsToken();
    const show  = !!s.enabled && ((isTok && !!s.showOnTokens) || (!isTok && !!s.showOnUploads));
    wm.visible  = show;

    // 2) size + opacity from server
    const sizePct = Math.max(0.05, Math.min(1.4, Number(s.sizePct ?? 0.88)));
    const op      = Math.max(0, Math.min(1,   Number(s.opacity ?? 0.18)));

    const baseW = wm.width || (wm._element?.naturalWidth) || 512;
    const targetW = Math.round(c.getWidth() * sizePct);
    const sc = targetW / baseW;

    wm.scaleX = sc; wm.scaleY = sc;
    wm.opacity = op;
    wm.left = c.getWidth()/2; wm.top = c.getHeight()/2;
    wm.setCoords();

    // keep it on top but invisible if show==false
    try { c.bringToFront(wm); } catch(_){}
    c.requestRenderAll();
  }

  function wireCanvasFollows(stateRef){
    const c = C(); if (!c || c.__raWmServerMaster) { if (!c) setTimeout(()=>wireCanvasFollows(stateRef), 150); return; }
    c.__raWmServerMaster = true;
    const reapply = ()=> applyToWM(stateRef.val);
    c.on('object:added',    reapply);
    c.on('object:removed',  reapply);
    c.on('object:modified', reapply);
    // first pass
    setTimeout(reapply, 0);
  }

  // --- admin wiring: make every control "save + apply" ---
  function wireAdmin(stateRef){
    const ids = {
      en:  'raWmCEnabled',
      tok: 'raWmCOnTok',
      up:  'raWmCOnUp',
      op:  'raWmCOpacity',
      sz:  'raWmCSize',
      rf:  'raWmCRefresh'
    };
    const en  = $(ids.en), tok = $(ids.tok), up = $(ids.up),
          op  = $(ids.op), sz  = $(ids.sz),  rf = $(ids.rf);

    if (!op || op.__raWmServerMasterUI) return;   // not visible yet or already wired
    op.__raWmServerMasterUI = sz && (sz.__raWmServerMasterUI = true);
    if (en)  en.__raWmServerMasterUI  = true;
    if (tok) tok.__raWmServerMasterUI = true;
    if (up)  up.__raWmServerMasterUI  = true;
    if (rf)  rf.__raWmServerMasterUI  = true;

    const saveAndApply = async () => {
      const body = readAdminUI();
      stateRef.val = body;            // remember latest
      try { await postServer(body); } catch(_){}
      applyToWM(body);                // instant visual feedback
    };

    [op, sz].forEach(el => el && el.addEventListener('input',  saveAndApply));
    [en, tok, up].forEach(el => el && el.addEventListener('change', saveAndApply));

    // Make "Refresh" behave like "Save for everyone"
    if (rf){
      rf.addEventListener('click', (e)=>{
        e.preventDefault();
        saveAndApply();
      });
    }
  }

  // --- boot: load server once, enforce everywhere, then wire admin if present ---
  const STATE = { val: null };

  async function boot(){
    try { STATE.val = await getServer(); } catch(_){ STATE.val = readAdminUI(); }

    (function waitWm(tries=0){
      const wm = findWM();
      if (wm) { applyToWM(STATE.val); return; }
      if (tries < 60) setTimeout(()=>waitWm(tries+1), 250);
    })();