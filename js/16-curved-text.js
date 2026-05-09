// ============================================================================
// 16-curved-text.js
// Original app.js lines 3883-4147 (265 lines)
// ============================================================================


/* ==========================================================
   RA_CURVED_TEXT_V1
   - Curved text for Fabric: toggle on/off + live controls.
   - Integrates with your existing Custom Text controls.
   - Tagged as _kind:'customText' so Animate includes it.
   - Desktop/mobile safe; no layout changes.
   ========================================================== */
(() => {
  if (window.__RA_CURVED_TEXT_V1__) return; window.__RA_CURVED_TEXT_V1__ = true;

  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const C  = ()=> (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function styleFromUI(){
    return {
      fontFamily: ($('#fontFamily')||{}).value || "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
      fontSize:   parseInt(($('#fontSize')||{}).value||'48',10),
      fill:       ($('#fontColor')||{}).value || '#ffffff',
      stroke:     ($('#strokeColor')||{}).value || 'transparent',
      strokeWidth:parseInt(($('#strokeWidth')||{}).value||'0',10)
    };
  }

  function isCurved(o){ return !!(o && (o._raCurved || o?.data?.raType==='curvedText')); }
  function plainText(o){
    if (!o) return '';
    if (o.type==='textbox' || o.type==='text') return String(o.text||'');
    if (isCurved(o)) return (o._objects||[]).map(g=>g.text||'').join('');
    return '';
  }

  // Build a curved text group (center-origin)
  function buildCurved(text, opts){
    const c=C(); const cw=c?c.getWidth():700, ch=c?c.getHeight():700, side=Math.min(cw,ch);
    const radius  = Math.round((opts?.radius ?? side*0.35));
    const arc     = (opts?.arc    ?? 180);
    const start   = (opts?.start  ?? 0);
    const spacing = (opts?.spacing?? 0);         // px-ish fudge
    const inward  = !!(opts?.inward);
    const st      = opts?.style || styleFromUI();

    const chars = Array.from(String(text||''));
    const N     = Math.max(chars.length, 1);
    const step  = (N>1 ? arc/(N-1) : 0) + (spacing/Math.max(radius,1))*(180/Math.PI);
    const startDeg = start - arc/2;

    const kids=[];
    for (let i=0;i<N;i++){
      const ch = new fabric.Text(chars[i] || ' ', {
        originX:'center', originY:'center',
        fontFamily: st.fontFamily, fontSize: st.fontSize,
        fill: st.fill, stroke: st.stroke, strokeWidth: st.strokeWidth,
        selectable:false, evented:false
      });
      const ang = (startDeg + i*step) * Math.PI/180;
      ch.left  = radius * Math.cos(ang);
      ch.top   = radius * Math.sin(ang);
      ch.angle = (startDeg + i*step) + (inward ? -90 : 90);
      ch.data  = Object.assign({}, ch.data, { raGlyph:true });
      kids.push(ch);
    }

    const g = new fabric.Group(kids, { originX:'center', originY:'center' });
    g._kind = 'customText';
    g._raCurved = true;
    g.raCurve = { text:String(text||''), radius, arc, start, spacing, inward };
    g.data = Object.assign({}, g.data, { raType:'curvedText', raCurve:g.raCurve });
    return g;
  }

  function replaceObject(newObj, oldObj){
    const c=C(); if(!c) return;
    const ctr = oldObj.getCenterPoint ? oldObj.getCenterPoint() : new fabric.Point(oldObj.left||0, oldObj.top||0);
    newObj.set({ left: ctr.x, top: ctr.y });
    newObj.setCoords();
    c.remove(oldObj); c.add(newObj); c.setActiveObject(newObj); c.requestRenderAll();
  }

  function toCurved(o){
    const st = {
      fontFamily: o.fontFamily || styleFromUI().fontFamily,
      fontSize:   o.fontSize   || styleFromUI().fontSize,
      fill:       o.fill       || styleFromUI().fill,
      stroke:     o.stroke     || styleFromUI().stroke,
      strokeWidth:o.strokeWidth|| styleFromUI().strokeWidth
    };
    const vals = readUI();
    const g = buildCurved(plainText(o), { radius: vals.radius, arc: vals.arc, start: vals.start, spacing: vals.spacing, inward: vals.flip, style: st });
    replaceObject(g, o); reflectUI(g);
  }

  function toLinear(g){
    const c=C(); const s=styleFromUI();
    const tb = new fabric.Textbox(plainText(g), {
      originX:'center', originY:'center',
      width: Math.floor(c.getWidth()*0.8), textAlign:'left',
      fontFamily:s.fontFamily, fontSize:s.fontSize, fill:s.fill, stroke:s.stroke, strokeWidth:s.strokeWidth,
      editable:true
    });
    tb._kind='customText';
    replaceObject(tb, g); reflectUI(tb);
  }

  function updateCurved(g, nextPart){
    if (!isCurved(g)) return g;
    const keep = Object.assign({}, g.raCurve);
    const next = Object.assign(keep, nextPart||{});
    g.raCurve = next; g.data = Object.assign({}, g.data, { raCurve: next });

    const ctr = g.getCenterPoint ? g.getCenterPoint() : new fabric.Point(g.left||0, g.top||0);
    const ang = g.angle||0, sx=g.scaleX||1, sy=g.scaleY||1;
    const st  = styleFromUI();

    const fresh = buildCurved(next.text, {
      radius: next.radius, arc: next.arc, start: next.start, spacing: next.spacing, inward: next.inward,
      style: { fontFamily:st.fontFamily, fontSize:st.fontSize, fill:st.fill, stroke:st.stroke, strokeWidth:st.strokeWidth }
    });
    fresh.set({ left:ctr.x, top:ctr.y, angle:ang, scaleX:sx, scaleY:sy }); fresh.setCoords();

    const c=C(); c.remove(g); c.add(fresh); c.setActiveObject(fresh); c.requestRenderAll();
    return fresh;
  }

  function readUI(){
    const num = (id, d)=>{ const el=$(id); const v=parseFloat(el?.value||''); return Number.isFinite(v)?v:d; };
    const c=C(); const side=c?Math.min(c.getWidth(), c.getHeight()):700;
    return {
      enabled: !!$('#raCurveEnable')?.checked,
      radius:  num('#raCurveRadius', Math.round(side*0.35)),
      arc:     num('#raCurveArc', 180),
      start:   num('#raCurveStart', 0),
      spacing: num('#raCurveSpacing', 0),
      flip:    !!$('#raCurveFlip')?.checked
    };
  }
  function updateLabels(){
    const get=(id,d)=>{ const el=$(id); const v=parseFloat(el?.value||''); return Number.isFinite(v)?v:d; };
    const put=(id,v,s='')=>{ const el=$(id); if(el) el.textContent=String(v)+(s||''); };
    put('#raCurveRadiusVal', Math.round(get('#raCurveRadius',0)));
    put('#raCurveArcVal',    Math.round(get('#raCurveArc',0)), '°');
    put('#raCurveStartVal',  Math.round(get('#raCurveStart',0)), '°');
    put('#raCurveSpacingVal',Math.round(get('#raCurveSpacing',0)));
  }
  function reflectUI(obj){
    const vals = isCurved(obj) ? obj.raCurve : null;
    const set = (id,v)=>{ const el=$(id); if(!el) return; if (typeof v==='boolean') el.checked=v; else el.value=String(v); };
    set('#raCurveEnable', !!vals);
    set('#raCurveRadius', vals ? Math.round(vals.radius) : '');
    set('#raCurveArc',    vals ? Math.round(vals.arc)    : 180);
    set('#raCurveStart',  vals ? Math.round(vals.start)  : 0);
    set('#raCurveSpacing',vals ? Math.round(vals.spacing): 0);
    set('#raCurveFlip',   vals ? !!vals.inward : false);
    updateLabels();
    const txt=$('#customText'); if (txt) txt.value = obj ? plainText(obj) : '';
  }

  function ensureUI(){
    if ($('#raCurveRow')) return;

    const h3 = $$('h3').find(h => /custom\s*text/i.test((h.textContent||'').trim()));
    const card = h3 ? h3.parentNode : null;
    if (!card) return setTimeout(ensureUI, 200);

    const row = document.createElement('div');
    row.id='raCurveRow';
    row.style.cssText='margin-top:8px;padding:8px;border:1px dashed #2a2a2e;border-radius:8px;background:#0d0f14';
    row.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label style="display:flex;gap:6px;align-items:center"><input id="raCurveEnable" type="checkbox"> Curved</label>
        <label style="display:flex;gap:6px;align-items:center">Radius
          <input id="raCurveRadius" type="range" min="40" max="1200" value="240" style="width:150px">
          <span id="raCurveRadiusVal" style="opacity:.7;font-size:12px">240</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center">Arc
          <input id="raCurveArc" type="range" min="20" max="360" value="180" style="width:140px">
          <span id="raCurveArcVal" style="opacity:.7;font-size:12px">180°</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center">Start
          <input id="raCurveStart" type="range" min="-180" max="180" value="0" style="width:140px">
          <span id="raCurveStartVal" style="opacity:.7;font-size:12px">0°</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center">Spacing
          <input id="raCurveSpacing" type="range" min="-50" max="200" value="0" style="width:140px">
          <span id="raCurveSpacingVal" style="opacity:.7;font-size:12px">0</span>
        </label>
        <label style="display:flex;gap:6px;align-items:center"><input id="raCurveFlip" type="checkbox"> Inside</label>
      </div>
    `;
    card.appendChild(row);

    // Change handlers
    const onAny = ()=>{
      updateLabels();
      const c=C(); if(!c) return;
      const o=c.getActiveObject();
      const vals=readUI();

      if (!o){
        // No selection: if Curved enabled and there is text in input, create a new curved text
        if (vals.enabled){
          const t=($('#customText')||{}).value?.trim(); if (!t) return;
          const g = buildCurved(t, { radius:vals.radius, arc:vals.arc, start:vals.start, spacing:vals.spacing, inward:vals.flip, style:styleFromUI() });
          g.set({ left:c.getWidth()/2, top:c.getHeight()/2 }); g.setCoords();
          c.add(g).setActiveObject(g); c.requestRenderAll();
        }
        return;
      }

      if (!isCurved(o)){
        if (vals.enabled && o._kind==='customText'){ toCurved(o); }
        return;
      }

      if (!vals.enabled){ toLinear(o); }
      else {
        updateCurved(o, {
          radius: vals.radius, arc: vals.arc, start: vals.start, spacing: vals.spacing, inward: vals.flip,
          text: plainText(o)
        });
      }
    };

    ['change','input'].forEach(ev=>{
      ['#raCurveEnable','#raCurveRadius','#raCurveArc','#raCurveStart','#raCurveSpacing','#raCurveFlip']
      .forEach(id=>{ const el=$(id); if(el) el.addEventListener(ev, onAny); });
    });

    // Sync UI on selection changes
    const c=C();
    if (c && !c.__raCurveSelBound){
      c.__raCurveSelBound=true;
      c.on('selection:created', e=> reflectUI(e?.selected?.[0]));
      c.on('selection:updated', e=> reflectUI(e?.selected?.[0]||c.getActiveObject()));
      c.on('selection:cleared', ()=> reflectUI(null));
    }

    // Rebuild when text or font controls change
    const bindTextControls = ()=>{
      const txt=$('#customText');
      if (txt && !txt.__raCurveBound){
        const h=()=>{
          const c=C(), o=c?.getActiveObject();
          if (o && isCurved(o)){
            const v=(txt.value||'').replace(/\r?\n/g,' ');
            const fresh = updateCurved(o,{ text:v });
            c.setActiveObject(fresh||o);
          }
        };
        txt.__raCurveBound=true; txt.addEventListener('change',h); txt.addEventListener('input',h);
      }
      [['#fontFamily'],['#fontSize'],['#fontColor'],['#strokeColor'],['#strokeWidth']].forEach(([id])=>{
        const el=$(id); if (!el || el.__raCurveBound) return;
        const h=()=>{ const c=C(), o=c?.getActiveObject(); if (o && isCurved(o)) updateCurved(o, {}); };
        el.__raCurveBound=true; el.addEventListener('change',h); el.addEventListener('input',h);
      });
    };
    bindTextControls();
    new MutationObserver(bindTextControls).observe(document.documentElement, { childList:true, subtree:true });
  }

  function boot(){ if (!C()) return setTimeout(boot,200); ensureUI(); }
  if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', boot, {once:true}); } else { boot(); }
})();