// ============================================================================
// 24-emoji-text-row.js
// Original app.js lines 4986-5260 (275 lines)
// ============================================================================


/* ==========================================================
   RA_TEXT_ACTION_BAR_V2 + RA_EMOJI_PICKER_V2
   - Rebuilds the Custom Text action row so the 5 buttons sit neatly:
       [ Add Text ] [ 🙂 Emoji ] [ ✨ Inspire me ] [ Delete Selected ] [ Delete All ]
   - Larger emoji picker (with Recents).
   - Ensures color-emoji fonts render + export correctly.
   ========================================================== */
(() => {
  if (window.__RA_TEXT_ROW_EMOJI_V2__) return; window.__RA_TEXT_ROW_EMOJI_V2__ = true;

  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const  $ = (s,r=document)=>r.querySelector(s);
  const  C = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  /* ---------- 0) Font fallback so emojis export in color ---------- */
  const EMOJI_FALLBACK = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji'";
  function withEmojiFallback(stack){
    const s = String(stack||'system-ui');
    return /emoji/i.test(s) ? s : `${s}, ${EMOJI_FALLBACK}`;
  }
  function patchTextFonts(){
    const c=C(); if (!c) return;
    (c.getObjects()||[]).forEach(o=>{
      if (o && (o.type==='textbox'||o.type==='text')){
        o.set('fontFamily', withEmojiFallback(o.fontFamily||'system-ui'));
      }
    });
    c.requestRenderAll();
  }
  function wireFontPatch(){
    const c=C(); if (!c || c.__raEmojiFontPatched) return;
    c.__raEmojiFontPatched = true;
    c.on('object:added', e=>{
      const o = e?.target;
      if (o && (o.type==='textbox'||o.type==='text')){
        o.set('fontFamily', withEmojiFallback(o.fontFamily||'system-ui'));
        o.setCoords(); c.requestRenderAll();
      }
    });
    ['fontFamily','idFontFamily'].forEach(id=>{
      const el = $('#'+id); if (!el || el.__raEmojiFontBound) return;
      el.__raEmojiFontBound = true;
      const fix = ()=>{ el.value = withEmojiFallback(el.value||'system-ui'); patchTextFonts(); };
      el.addEventListener('change', fix);
      el.addEventListener('input',  fix);
      fix();
    });
  }

  /* ---------- 1) Build / fix the action row ---------- */
  function customTextCard(){
    const h = $$('h3,h2').find(x => /custom\s*text/i.test((x.textContent||'').trim()));
    return h ? (h.parentElement || h) : null;
  }

  function ensureActionRow(){
    const card = customTextCard(); if (!card) return null;
    let row = $('#raTextActionRow', card);
    if (!row){
      row = document.createElement('div');
      row.id = 'raTextActionRow';
      row.style.cssText = [
        'margin:8px 0 6px 0',
        'display:flex',
        'flex-wrap:wrap',
        'gap:8px',
        'align-items:center'
      ].join(';');
      // Insert the row just before any "Curved" controls if they exist, else at end
      const curve = $('#raCurveRow', card);
      if (curve) card.insertBefore(row, curve);
      else card.appendChild(row);
    }
    return row;
  }

  function moveIntoRow(row, id, labelFallback){
    const btn = $('#'+id);
    if (btn){ if (btn.parentNode !== row) row.appendChild(btn); return btn; }
    // optional: create fallback if missing
    if (!labelFallback) return null;
    const b = document.createElement('button');
    b.id = id; b.className = 'btn small'; b.textContent = labelFallback;
    row.appendChild(b);
    return b;
  }

  /* ---------- 2) Emoji picker ---------- */
  const REC_KEY='ra_emoji_recents_v1';
  function getRec(){ try{ return JSON.parse(localStorage.getItem(REC_KEY)||'[]'); }catch(_){ return []; } }
  function pushRec(e){
    const r = getRec(); const out=[e, ...r.filter(x=>x!==e)];
    out.length = Math.min(out.length, 24);
    try{ localStorage.setItem(REC_KEY, JSON.stringify(out)); }catch(_){}
  }

  // Larger, useful set (faces, hearts, symbols, gaming, arrows, ants, etc.)
  const EMOJI_ALL = [
    // Faces
    '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','🙂','🙃','😇','😍','😘','😗','😙','😚',
    '😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟',
    '😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵',
    '🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😮',
    '😯','😦','😧','😲','🥱','😴','🤤','😪','😵','😵‍💫','🤐','🥴','🤢','🤮','🤧','🤒','🤕','🤑',
    // Hearts & sparkle
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💖','💘','💝','💗','💓','💞','💕','💟','💔','❤️‍🔥','❤️‍🩹','✨','⭐️','🌟','⚡️','🔥','💥','💫',
    // Hands / reactions
    '👍','👎','👏','🙏','🤝','✌️','🤞','🤟','🤘','👌','🤌','👊','🙌','🫶',
    // Rebel Ant vibe
    '🐜','🐝','🦋','🧪','🧠','💎','🎯','🏆','🚀','🛸','🛡️','⚔️','🗡️','🪓','🔮','🎲','🎮','🕹️',
    // Music / fun
    '🎧','🎤','🎹','🎷','🥁','🪩',
    // Arrows / status
    '⬆️','⬇️','⬅️','➡️','↗️','↘️','↖️','↙️','✅','❌','⚠️'
  ];

  function buildEmojiUI(row){
    // Button
    let emojiBtn = $('#raEmojiBtn');
    if (!emojiBtn){
      emojiBtn = document.createElement('button');
      emojiBtn.id = 'raEmojiBtn';
      emojiBtn.className = 'btn small';
      emojiBtn.textContent = '🙂 Emoji';
      emojiBtn.style.cursor = 'pointer';
    }
    row.appendChild(emojiBtn);

    // Popover
    let pop = $('#raEmojiPop');
    if (!pop){
      pop = document.createElement('div');
      pop.id = 'raEmojiPop';
      Object.assign(pop.style,{
        position:'fixed', zIndex:'10000', display:'none',
        padding:'10px', border:'1px solid #2a2a2e', borderRadius:'10px',
        background:'#0f1116', color:'#e7e7ea', boxShadow:'0 12px 28px rgba(0,0,0,.55)',
        maxWidth:'520px'
      });

      // Recents header
      const recWrap = document.createElement('div');
      recWrap.id = 'raEmojiRec';
      recWrap.style.cssText = 'margin-bottom:8px;display:none';
      pop.appendChild(recWrap);

      const sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:#222;margin:6px 0 10px 0';
      pop.appendChild(sep);

      const grid = document.createElement('div');
      grid.id = 'raEmojiGrid';
      Object.assign(grid.style, {
        display:'grid',
        gridTemplateColumns:'repeat(12, 1fr)',
        gap:'6px',
        maxHeight:'240px',
        overflow:'auto',
        fontSize:'20px'
      });
      // Fill grid
      EMOJI_ALL.forEach(e=>{
        const cell=document.createElement('button');
        cell.textContent=e;
        Object.assign(cell.style,{
          width:'34px',height:'34px',lineHeight:'34px',
          textAlign:'center',border:'0',borderRadius:'6px',
          background:'#161821',color:'#fff',cursor:'pointer'
        });
        cell.addEventListener('click', ()=>{ insertEmoji(e); pop.style.display='none'; });
        grid.appendChild(cell);
      });
      pop.appendChild(grid);
      document.body.appendChild(pop);
    }

    // Open/close behavior
    emojiBtn.onclick = ()=>{
      if (pop.style.display==='block'){ pop.style.display='none'; return; }
      // Position under the button
      const r = emojiBtn.getBoundingClientRect();
      pop.style.left = Math.round(Math.min(r.left, window.innerWidth - 540)) + 'px';
      pop.style.top  = Math.round(r.bottom + 8) + 'px';
      // Rebuild recents section
      const rec = getRec(); const host = $('#raEmojiRec'); host.innerHTML='';
      if (rec.length){
        host.style.display = 'block';
        const label = document.createElement('div');
        label.textContent = 'Recent';
        label.style.cssText = 'font-size:11px;opacity:.65;margin:0 0 6px 2px';
        host.appendChild(label);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
        rec.forEach(e=>{
          const b=document.createElement('button');
          b.textContent=e;
          Object.assign(b.style,{
            width:'30px',height:'30px',lineHeight:'30px',
            textAlign:'center',border:'0',borderRadius:'6px',
            background:'#1b1d26',color:'#fff',cursor:'pointer'
          });
          b.onclick = ()=>{ insertEmoji(e); pop.style.display='none'; };
          row.appendChild(b);
        });
        host.appendChild(row);
      } else {
        host.style.display = 'none';
      }
      pop.style.display='block';
    };
    // Click-away
    document.addEventListener('click', (e)=>{
      if (e.target===emojiBtn || (pop.contains(e.target))) return;
      pop.style.display='none';
    });
  }

  function insertAtCaret(input, str){
    const start = input.selectionStart ?? input.value.length;
    const end   = input.selectionEnd   ?? start;
    const before = input.value.slice(0,start);
    const after  = input.value.slice(end);
    input.value = before + str + after;
    const pos = start + str.length;
    input.focus();
    try{ input.setSelectionRange(pos,pos); }catch(_){}
    // Let any listeners update the canvas
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function insertEmoji(e){
    const inp = $('#customText'); if (!inp) return;
    insertAtCaret(inp, e);
    pushRec(e);
    // If a text layer is selected, reflect immediately
    const c=C(); if (c){
      const o=c.getActiveObject();
      if (o && (o.type==='textbox'||o.type==='text')){
        o.text = inp.value.replace(/\r?\n/g,' ');
        o.set('fontFamily', withEmojiFallback(o.fontFamily||'system-ui'));
        o.setCoords(); c.requestRenderAll();
      }
    }
  }

  /* ---------- 3) Put everything together ---------- */
  function install(){
    wireFontPatch();

    const row = ensureActionRow(); if (!row) return;

    // Move existing buttons (keeps their click handlers)
    moveIntoRow(row, 'addCustomText');
    buildEmojiUI(row);                                  // adds [🙂 Emoji]
    // If Inspire button exists, move it in; otherwise leave as-is
    const aiBtn = $('#raAiQuoteBtn'); if (aiBtn) row.appendChild(aiBtn);
    moveIntoRow(row, 'delSelectedText');
    moveIntoRow(row, 'delAllText');

    // Tidy spacing if any button lacks "small"
    ['addCustomText','raEmojiBtn','raAiQuoteBtn','delSelectedText','delAllText'].forEach(id=>{
      const b=$('#'+id); if (!b) return;
      if (!b.classList.contains('small')) b.classList.add('small');
      b.style.margin = '0';   // prevent drifting out of the card
    });
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();