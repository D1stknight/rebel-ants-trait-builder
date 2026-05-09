// ============================================================================
// 10-font-picker.js
// Original app.js lines 2520-2750 (231 lines)
// ============================================================================


/* ==============================================================
   RA_FONT_PICKER_UNIFIED_V1
   - Base curated font list + Google web fonts (optgroup)
   - Live preview box under each picker (#fontFamily, #idFontFamily)
   - Persists last chosen font (localStorage key: ra_last_font_stack)
   - Immediate application to active customText & token ID label
   - Safe against repeated DOM mutations (idempotent)
   ============================================================= */
(function RA_FONT_PICKER_UNIFIED_V1(){
  if (window.__RA_FONT_PICKER_UNIFIED_V1__) return;
  window.__RA_FONT_PICKER_UNIFIED_V1__ = true;

  const PICKER_IDS = ['fontFamily','idFontFamily'];
  const LS_KEY     = 'ra_last_font_stack';
  const PREVIEW_SAMPLE = window.__RA_FONT_PREVIEW_SAMPLE || 'AaBbCc 1234  #RebelAnts';

  // Base (system / bundled) fonts
  const BASE_FONTS = [
    { name:'Impact',              stack:"Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
    { name:'Arial Black',         stack:"'Arial Black', Gadget, sans-serif" },
    { name:'Arial',               stack:"Arial, Helvetica, sans-serif" },
    { name:'Helvetica Neue',      stack:"'Helvetica Neue', Helvetica, Arial, sans-serif" },
    { name:'Verdana',             stack:"Verdana, Geneva, sans-serif" },
    { name:'Tahoma',              stack:"Tahoma, Geneva, sans-serif" },
    { name:'Trebuchet MS',        stack:"'Trebuchet MS', Helvetica, sans-serif" },
    { name:'Segoe UI',            stack:"'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
    { name:'Calibri',             stack:"Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif" },
    { name:'Optima',              stack:"Optima, Segoe, 'Segoe UI', Candara, Calibri, Arial, sans-serif" },
    { name:'Avenir',              stack:"Avenir, 'Avenir Next', 'Segoe UI', sans-serif" },
    { name:'Futura',              stack:"Futura, 'Century Gothic', 'Gill Sans', Arial, sans-serif" },
    { name:'Gill Sans',           stack:"'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
    { name:'Century Gothic',      stack:"'Century Gothic', AppleGothic, sans-serif" },

    { name:'Georgia',             stack:"Georgia, 'Times New Roman', serif" },
    { name:'Times New Roman',     stack:"'Times New Roman', Times, serif" },
    { name:'Baskerville',         stack:"Baskerville, 'Baskerville Old Face', Garamond, 'Times New Roman', serif" },
    { name:'Garamond',            stack:"Garamond, Baskerville, 'Baskerville Old Face', 'Times New Roman', serif" },
    { name:'Palatino',            stack:"Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
    { name:'Didot',               stack:"Didot, 'Bodoni 72', 'Bodoni MT', 'Times New Roman', serif" },
    { name:'Rockwell',            stack:"Rockwell, 'Courier New', Georgia, serif" },

    { name:'Courier New',         stack:"'Courier New', Courier, monospace" },
    { name:'Menlo',               stack:"Menlo, Monaco, Consolas, 'Courier New', monospace" },
    { name:'Consolas',            stack:"Consolas, 'Lucida Console', Monaco, monospace" },
    { name:'Lucida Console',      stack:"'Lucida Console', Monaco, monospace" },

    { name:'Copperplate',         stack:"Copperplate, 'Copperplate Gothic Light', fantasy" },
    { name:'Papyrus',             stack:"Papyrus, fantasy" },
    { name:'Brush Script MT',     stack:"'Brush Script MT', cursive" },
    { name:'Comic Sans MS',       stack:"'Comic Sans MS', 'Comic Sans', Chalkboard, cursive" },

    { name:'System UI',           stack:"system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" }
  ];

  // Web fonts (Google). Each has a 'kind' to refine fallback stack.
  const WEB_FONTS = [
    { name:'Inter',             google:'Inter:wght@400;600;700',          kind:'sans' },
    { name:'Roboto',            google:'Roboto:wght@400;500;700',         kind:'sans' },
    { name:'Poppins',           google:'Poppins:wght@400;600;700',        kind:'sans' },
    { name:'Montserrat',        google:'Montserrat:wght@400;600;700',     kind:'sans' },
    { name:'Lato',              google:'Lato:wght@400;700',               kind:'sans' },
    { name:'Raleway',           google:'Raleway:wght@400;600;700',        kind:'sans' },
    { name:'Oswald',            google:'Oswald:wght@400;600;700',         kind:'sans' },
    { name:'Nunito',            google:'Nunito:wght@400;600;800',         kind:'sans' },
    { name:'Source Sans 3',     google:'Source+Sans+3:wght@400;600;700',  kind:'sans' },
    { name:'Merriweather',      google:'Merriweather:wght@400;700',       kind:'serif' },
    { name:'Playfair Display',  google:'Playfair+Display:wght@400;700',   kind:'serif' },
    { name:'Abril Fatface',     google:'Abril+Fatface',                   kind:'serif' },
    { name:'Bebas Neue',        google:'Bebas+Neue',                      kind:'display' },
    { name:'Dancing Script',    google:'Dancing+Script:wght@400;600',     kind:'script' },
    { name:'Pacifico',          google:'Pacifico',                        kind:'script' },
    { name:'Inconsolata',       google:'Inconsolata:wght@400;700',        kind:'mono' },
    { name:'Fira Code',         google:'Fira+Code:wght@400;600',          kind:'mono' },
    { name:'JetBrains Mono',    google:'JetBrains+Mono:wght@400;700',     kind:'mono' }
  ];

  function fallbackStack(kind){
    switch(kind){
      case 'serif': return 'Georgia, "Times New Roman", serif';
      case 'mono':  return 'ui-monospace, SFMono-Regular, "Courier New", monospace';
      case 'script':return '"Brush Script MT", cursive';
      case 'display':return 'Impact, Arial, sans-serif';
      default:      return 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    }
  }
  function stackForWeb(f){ return `"${f.name}", ${fallbackStack(f.kind)}`; }

  function injectGoogleOnce(){
    if (document.getElementById('raUnifiedWebFontsCSS')) return;
    const fam = WEB_FONTS.map(f=>'family='+f.google).join('&');
    const href = 'https://fonts.googleapis.com/css2?'+fam+'&display=swap';
    ['https://fonts.gstatic.com','https://fonts.googleapis.com'].forEach(u=>{
      if (!document.querySelector(`link[rel="preconnect"][href="${u}"]`)){
        const lk=document.createElement('link');
        lk.rel='preconnect'; lk.href=u;
        if (u.includes('gstatic')) lk.crossOrigin='anonymous';
        document.head.appendChild(lk);
      }
    });
    const link=document.createElement('link');
    link.id='raUnifiedWebFontsCSS';
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
    if (document.fonts && document.fonts.ready){
      document.fonts.ready.then(()=>{ try { window.canvas?.requestRenderAll(); } catch(_){} });
    }
  }

  function ensurePreview(picker, id){
    const pid='raPreview_'+id;
    let box=document.getElementById(pid);
    if(!box){
      box=document.createElement('div');
      box.id=pid;
      box.style.cssText=[
        'margin-top:6px','padding:8px 10px','border:1px solid #2a2a2e',
        'border-radius:8px','background:#111319','color:#e7e7ea',
        'font-size:15px','line-height:1.35','letter-spacing:.1px'
      ].join(';');
      const label=document.createElement('div');
      label.textContent='Preview';
      label.style.cssText='font-size:11px;opacity:.65;margin-bottom:4px';
      const txt=document.createElement('div');
      txt.className='raPreviewText';
      txt.textContent=PREVIEW_SAMPLE;
      box.appendChild(label); box.appendChild(txt);
      picker.parentNode.insertBefore(box, picker.nextSibling);
    }
    return box.querySelector('.raPreviewText');
  }

  function applySelectionToCanvas(stack, pickerId){
    const c=window.canvas;
    if (!c) return;
    const active=c.getActiveObject && c.getActiveObject();
    if (active && active._kind==='customText'){
      active.set('fontFamily', stack);
    }
    if (pickerId==='idFontFamily' && window.idLabel){
      window.idLabel.set('fontFamily', stack);
    }
    try { c.requestRenderAll(); } catch(_) {}
  }

  async function handleChange(select, pickerId, previewEl){
    const stack=select.value;
    try { localStorage.setItem(LS_KEY, stack); } catch(_){}
    previewEl.style.fontFamily = stack;
    // Try font load (probe one weight); timeout fails safe
    const fam = stack.split(',')[0].replace(/["']/g,'').trim();
    if (document.fonts && fam){
      try {
        await Promise.race([
          document.fonts.load(`48px "${fam}"`),
          new Promise(res=>setTimeout(res,1200))
        ]);
      } catch(_) {}
    }
    applySelectionToCanvas(stack, pickerId);
  }

  function rebuildSelect(el, pickerId){
    const stored = localStorage.getItem(LS_KEY)||'';
    const current = el.value;
    el.innerHTML='';

    // Base group (no label, just flat)
    BASE_FONTS.forEach(f=>{
      const opt=document.createElement('option');
      opt.value=f.stack;
      opt.textContent=f.name;
      opt.style.fontFamily=f.stack;
      opt.style.fontSize='14px';
      el.appendChild(opt);
    });

    // Web fonts group
    const og=document.createElement('optgroup');
    og.label='Web fonts';
    WEB_FONTS.forEach(f=>{
      const opt=document.createElement('option');
      opt.value=stackForWeb(f);
      opt.textContent=f.name;
      opt.style.fontFamily=opt.value;
      opt.style.fontSize='14px';
      og.appendChild(opt);
    });
    el.appendChild(og);

    const allStacks=[...BASE_FONTS.map(f=>f.stack), ...WEB_FONTS.map(f=>stackForWeb(f))];
    const target = allStacks.includes(stored) ? stored
                 : allStacks.includes(current) ? current
                 : allStacks[0];
    el.value = target;

    const previewEl = ensurePreview(el, pickerId);

    const onChange = ()=>handleChange(el, pickerId, previewEl);
    if (!el.__raUnifiedFontBound){
      el.addEventListener('change', onChange);
      el.addEventListener('input', onChange);
      el.__raUnifiedFontBound = true;
    }

    // Initial apply
    previewEl.style.fontFamily = el.value;
    applySelectionToCanvas(el.value, pickerId);
  }

  function apply(){
    injectGoogleOnce();
    PICKER_IDS.forEach(id=>{
      const el=document.getElementById(id);
      if (!el) return;
      // If some earlier script already tagged it, ignore (or remove that script)
      if (el.__raUnifiedFontPicker) return;
      if (el.tagName.toLowerCase()!=='select') return;
      el.__raUnifiedFontPicker = true;
      rebuildSelect(el, id);
    });
  }

  if (document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  } else {
    apply();
  }
  new MutationObserver(apply).observe(document.documentElement,{childList:true, subtree:true});
})();