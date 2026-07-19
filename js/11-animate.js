// ============================================================================
// 11-animate.js
// Original app.js lines 2751-3354 (604 lines)
// ============================================================================


/* (REMOVED) RA_MAKE_VIDEO_TOKEN_ONLY_V1
   The entire token-only video panel and export logic is obsolete and removed.
   If you ever want to reintroduce token-only video, add it as a mode in your unified animation/export pipeline.
   Last removed on 2025-09-27.
*/


(() => {
  if (window.raAnimateUnifiedV2 && window.raAnimateUnifiedV2.version === '2.0.2') return;

  const VERSION = '2.0.2';
  const CONFIG = {
    fps: 30,
    maxDurationSec: 30,
    defaultReturnMode: 'soft',
    defaultWmMode: 'inherit',
    softFraction: 0.18,
    softMinMs: 140,
    reverseFraction: 0.35,
    holdFraction: 0.25,
    snapFrames: 10,
    tailFlushFrames: 5,
    respectViewport: true,
    cameraMaxZoom: 2.0,
    wmSnapshotMultiplier: 1.0,
    wmOpacityFloor: 0.02,
    exportHeaderPattern: /export/i,
    autoDownloadOnExport: true // NEW: auto-trigger download after export finishes
  };

  /* -------------------- EASING -------------------- */
  const EASE = {
    linear: t=>t,
    ioQuad: t=>t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2,
    ioSine: t=>-(Math.cos(Math.PI*t)-1)/2,
    ioCubic: t=>t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,
    ioBack: t=>{
      const c1=1.70158,c2=c1*1.525;
      return t<0.5?
        (Math.pow(2*t,2)*((c2+1)*2*t-c2))/2:
        (Math.pow(2*t-2,2)*((c2+1)*(2*t-2)+c2)+2)/2;
    },
    ioExpo: t=>t===0?0:t===1?1:(t<0.5?Math.pow(2,20*t-10)/2:(2-Math.pow(2,-20*t+10))/2)
  };

  /* -------------------- PRESETS (unchanged) -------------------- */
  const PRESETS = [
    // Arrow convention: the arrow is the direction the IMAGE visibly drifts
    // (same as the Pan presets). Positive x shifts content right, positive y
    // shifts content down. Previous values used camera-motion semantics, so
    // 'KB in ↗' visibly drifted ↙ - names and motion now agree.
    { id:'cam_kb_in_ur', name:'KB in ↗', kind:'camera', ease:'ioSine', from:{z:1,x:0,y:0}, to:{z:1.18,x:+0.06,y:-0.06}},
    { id:'cam_kb_in_dl', name:'KB in ↙', kind:'camera', ease:'ioSine', from:{z:1,x:0,y:0}, to:{z:1.18,x:-0.06,y:+0.06}},
    { id:'cam_kb_in_ul', name:'KB in ↖', kind:'camera', ease:'ioSine', from:{z:1,x:0,y:0}, to:{z:1.18,x:-0.06,y:-0.06}},
    { id:'cam_kb_in_dr', name:'KB in ↘', kind:'camera', ease:'ioSine', from:{z:1,x:0,y:0}, to:{z:1.18,x:+0.06,y:+0.06}},
    { id:'cam_kb_out',   name:'KB out',   kind:'camera', ease:'ioSine', from:{z:1.15,x:0,y:0}, to:{z:1.00,x:0,y:0}},
    { id:'cam_pan_up',   name:'Pan up',   kind:'camera', ease:'ioQuad', from:{z:1,x:0,y:0.06}, to:{z:1,x:0,y:-0.06}},
    { id:'cam_pan_down', name:'Pan down', kind:'camera', ease:'ioQuad', from:{z:1,x:0,y:-0.06},to:{z:1,x:0,y:0.06}},
    { id:'cam_pan_left', name:'Pan left', kind:'camera', ease:'ioQuad', from:{z:1,x:0.06,y:0}, to:{z:1,x:-0.06,y:0}},
    { id:'cam_pan_right',name:'Pan right',kind:'camera', ease:'ioQuad', from:{z:1,x:-0.06,y:0},to:{z:1,x:0.06,y:0}},
    { id:'cam_zoom_in',  name:'Zoom in',  kind:'camera', ease:'ioCubic',from:{z:1,x:0,y:0},   to:{z:1.15,x:0,y:0}},
    { id:'cam_zoom_out', name:'Zoom out', kind:'camera', ease:'ioCubic',from:{z:1.12,x:0,y:0}, to:{z:1.00,x:0,y:0}},
    { id:'base_nudge',    name:'Base nudge in', kind:'base', ease:'ioSine', from:{s:1.00}, to:{s:1.06}},
    { id:'base_pulse',    name:'Base pulse',    kind:'base', ease:'ioSine', from:{s:0.97}, to:{s:1.00}},
    { id:'base_zoom_in',  name:'Base zoom in',  kind:'base', ease:'ioCubic',from:{s:1.00}, to:{s:1.12}},
    { id:'base_zoom_out', name:'Base zoom out', kind:'base', ease:'ioCubic',from:{s:1.08}, to:{s:1.00}},
    { id:'base_slide_r',  name:'Base slide →',  kind:'base', ease:'ioSine', from:{dxN:-0.06}, to:{dxN:0}},
    { id:'base_slide_l',  name:'Base slide ←',  kind:'base', ease:'ioSine', from:{dxN:0.06},  to:{dxN:0}},
    { id:'base_tilt',     name:'Base tiny tilt',kind:'base', ease:'ioSine', from:{rot:-3},    to:{rot:0}},
    { id:'base_drift',    name:'Base drift diag',kind:'base',ease:'ioSine', from:{dxN:0.04,dyN:-0.04}, to:{dxN:0,dyN:0}},
    { id:'ov_pop',       name:'Overlay/Text pop',        kind:'overlay', ease:'ioBack',  from:{s:0.90},   to:{s:1.00}},
    { id:'ov_pop_big',   name:'Overlay/Text pop big',    kind:'overlay', ease:'ioBack',  from:{s:0.85},   to:{s:1.00}},
    { id:'ov_fade',      name:'Overlay/Text fade in',    kind:'overlay', ease:'ioCubic', from:{alpha:0},  to:{alpha:1}},
    { id:'ov_slide_up',  name:'Overlay/Text slide ↑',    kind:'overlay', ease:'ioSine',  from:{dyN:0.14}, to:{dyN:0}},
    { id:'ov_slide_dn',  name:'Overlay/Text slide ↓',    kind:'overlay', ease:'ioSine',  from:{dyN:-0.14},to:{dyN:0}},
    { id:'ov_slide_l',   name:'Overlay/Text slide ←',    kind:'overlay', ease:'ioSine',  from:{dxN:-0.18},to:{dxN:0}},
    { id:'ov_slide_r',   name:'Overlay/Text slide →',    kind:'overlay', ease:'ioSine',  from:{dxN:0.18}, to:{dxN:0}},
    { id:'ov_wiggle',    name:'Overlay/Text wiggle',     kind:'overlay', ease:'ioSine',  from:{rot:-5},   to:{rot:0}},
    { id:'ov_scale_in',  name:'Overlay/Text scale in',   kind:'overlay', ease:'ioCubic', from:{s:0.8},    to:{s:1.0}},
    { id:'ov_attention', name:'Overlay/Text attention',  kind:'overlay', ease:'ioSine',  from:{s:1.0},    to:{s:1.07}}
  ];

  /* -------------------- DOM HELPERS -------------------- */
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  function anchorPanel(){
    return $$('h3').find(h=> CONFIG.exportHeaderPattern.test((h.textContent||'').trim()))?.parentNode || document.body;
  }

  function buildPanel(){
    let panel=$('#raAnimUnifiedV2Panel');
    if(panel) return panel;
    panel=document.createElement('div');
    panel.id='raAnimUnifiedV2Panel';
    panel.style.cssText='margin:16px 0;padding:14px;border:1px solid #23262c;border-radius:12px;background:#0f1116;color:#e9eaed;font:12px system-ui;position:relative';
    panel.innerHTML=`
      <style>
        #raAnimUnifiedV2Panel button.btn{
          background:#1d2229;
          color:#e9eaed;
          border:1px solid #2c3138;
          padding:8px 18px;
          border-radius:9px;
          cursor:pointer;
          font:12px system-ui;
          font-weight:500;
          letter-spacing:.2px;
          min-height:36px;
        }
        #raAnimUnifiedV2Panel button.btn:hover{background:#272d35}
        #raAnimUnifiedV2Panel select,
        #raAnimUnifiedV2Panel input[type=number]{
          background:#161a21;
          color:#e9eaed;
          border:1px solid #2c3138;
          border-radius:8px;
          padding:7px 10px;
          min-height:36px;
          font:12px system-ui;
        }
        #raAnimUnifiedV2Panel label{display:flex;gap:6px;align-items:center}
        #raAnimUnifiedV2Panel strong{font-size:13px}
        #raAnimUnifiedV2Panel #uaPreviewCanvas,
        #raAnimUnifiedV2Panel #uaVideoOut{box-shadow:0 0 0 1px #1d2025}
        #raAnimUnifiedV2Panel #uaDL a{
          display:inline-block;
          margin-top:8px;
          background:#1d2229;
          padding:8px 14px;
          border-radius:8px;
          border:1px solid #2c3138;
          text-decoration:none;
          color:#d5d8dc;
          font:12px system-ui;
        }
        #raAnimUnifiedV2Panel #uaDL a:hover{background:#272d35}
      </style>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <strong>Unified Animate</strong>
        <span style="opacity:.55">v${VERSION}</span>
        <label>Scope:
          <select id="uaScope">
            <option value="camera">Camera</option>
            <option value="base">Base only</option>
            <option value="overlay">Overlays only</option>
            <option value="text">Text only</option>
          </select>
        </label>
        <label>Preset:
          <select id="uaPreset"></select>
        </label>
        <label>Ease:
          <select id="uaEase">
            <option value="ioSine">ioSine</option>
            <option value="ioQuad">ioQuad</option>
            <option value="ioCubic">ioCubic</option>
            <option value="ioBack">ioBack</option>
            <option value="ioExpo">ioExpo</option>
            <option value="linear">linear</option>
          </select>
        </label>
        <label>Dur:
          <input id="uaDur" type="number" min="2" max="${CONFIG.maxDurationSec}" value="6" step="0.1" style="width:60px">
          s
        </label>
        <label>Return:
          <select id="uaReturn">
            <option value="soft">soft</option>
            <option value="reverse">reverse</option>
            <option value="snap">snap</option>
            <option value="hold">hold</option>
            <option value="none">none</option>
          </select>
        </label>
        <label>WM:
          <select id="uaWMMode">
            <option value="inherit">inherit</option>
            <option value="lock">lock</option>
          </select>
        </label>
        <button id="uaPreview" class="btn">Preview</button>
        <button id="uaExport" class="btn">Export</button>
        <span id="uaMsg" style="opacity:.7"></span>
      </div>
      <canvas id="uaPreviewCanvas" style="display:none;margin-top:10px;max-width:100%;border-radius:8px;background:#000"></canvas>
      <video id="uaVideoOut" style="display:none;margin-top:10px;max-width:100%;border-radius:8px" controls></video>
      <div id="uaDL"></div>
    `;
    anchorPanel().appendChild(panel);

    const presetSel=$('#uaPreset');
    PRESETS.forEach(p=>{
      const o=document.createElement('option');
      o.value=p.id; o.textContent=p.name;
      presetSel.appendChild(o);
    });

    $('#uaReturn').value=CONFIG.defaultReturnMode;
    $('#uaWMMode').value=CONFIG.defaultWmMode;

    $('#uaScope').addEventListener('change', ()=>{
      const sc=$('#uaScope').value;
      const first = PRESETS.find(p=>{
        if (sc==='camera') return p.kind==='camera';
        if (sc==='base') return p.kind==='base';
        if (sc==='overlay') return p.kind==='overlay';
        if (sc==='text') return p.kind==='overlay';
      });
      if (first) $('#uaPreset').value=first.id;
    });

    $('#uaPreview').onclick=()=>API.preview();
    $('#uaExport').onclick=()=>API.export();

    return panel;
  }

  function showMsg(t){
    const m=$('#uaMsg'); if(!m) return;
    m.textContent=t||'';
    if (t) setTimeout(()=>{ if(m.textContent===t) m.textContent=''; },2500);
  }

  
  const WM = {
    is(o){ return !!(o && (false||false||false||o._rabrandbar)); },
    collect(){
      const c=window.canvas; if(!c) return [];
      return (c.getObjects()||[]).filter(WM.is);
    },
    snapshot:null,
    prepare(mode){
      const wmObjs=WM.collect();
      if (mode==='inherit' || !wmObjs.length)
        return { wmObjs, restores:[] };
      const c=window.canvas;
      const restores=wmObjs.map(o=>({
        o, vis:o.visible, excl:o.excludeFromExport, op:o.opacity
      }));
      wmObjs.forEach(o=>{
        if (o.excludeFromExport) o.excludeFromExport=false;
        if (!o.visible) o.visible=true;
        if (o.opacity===0) o.opacity=CONFIG.wmOpacityFloor;
      });
      const data=c.toDataURL({format:'png', enableRetinaScaling:true, multiplier:CONFIG.wmSnapshotMultiplier});
      const img=new Image(); img.src=data;
      WM.snapshot=img;
      wmObjs.forEach(o=> o.visible=false);
      c.requestRenderAll();
      return { wmObjs, restores };
    },
    restore(restores, mode){
      if (mode==='lock'){
        restores.forEach(r=>{
          r.o.visible=r.vis;
          r.o.excludeFromExport=r.excl;
            r.o.opacity=r.op;
        });
      }
      WM.snapshot=null;
    },
    drawLocked(ctx,W,H){
      if (!WM.snapshot) return;
      ctx.save();
      ctx.globalAlpha=1;
      ctx.drawImage(WM.snapshot,0,0,W,H);
      ctx.restore();
    }
  };

  /* -------------------- Classifiers -------------------- */
  const isBg=o=>!!o?._isBgRect;
  const isBase=o=>!!(o?._isBase && !o._isBgRect);
  const isText=o=>{
    if(!o) return false;
    const k=(o._kind||'').toLowerCase(), t=(o.type||'').toLowerCase();
    return k==='customtext'||k==='tokenid'||t==='textbox'||t==='i-text'||t==='text';
  };
  const isOverlay=o=>{
    if(!o) return false;
    if (o._raSys || WM.is(o) || o._isBgRect || o._isBase || o._raTokenId) return false;
    const k=(o._kind||'').toLowerCase();
    if (k==='overlay'||k==='sticker'||k==='icon') return true;
    if (o.type==='group'){
      const kids=(o.getObjects?.()||o._objects||[]);
      return kids.some(ch=>{
        const ck=(ch._kind||'').toLowerCase();
        return ck==='overlay'||ck==='sticker'||ck==='icon';
      });
    }
    if (o.type==='image' && !o._isBase) return true;
    return false;
  };
  function pickTargets(scope){
    const c=window.canvas; if(!c) return [];
    const objs=(c.getObjects()||[]).filter(o=>!isBg(o));
    if (scope==='base') return objs.filter(isBase);
    if (scope==='overlay') return objs.filter(isOverlay);
    if (scope==='text') return objs.filter(isText);
    return [];
  }

  /* -------------------- Return Plan -------------------- */
  function planReturn(mode,durMs){
    if (mode==='none') return {mode,reverse:0,snap:0,hold:0,soft:0};
    if (mode==='reverse') return {mode,reverse:Math.round(durMs*CONFIG.reverseFraction),snap:0,hold:0,soft:0};
    if (mode==='snap') return {mode,reverse:0,snap:CONFIG.snapFrames,hold:0,soft:0};
    if (mode==='hold') return {mode,reverse:0,snap:CONFIG.snapFrames,hold:Math.round(durMs*CONFIG.holdFraction),soft:0};
    if (mode==='soft'){
      const soft=Math.max(CONFIG.softMinMs, Math.round(durMs*CONFIG.softFraction));
      return {mode,reverse:soft,snap:0,hold:0,soft};
    }
    return {mode:'none',reverse:0,snap:0,hold:0,soft:0};
  }

  /* -------------------- Animation Core -------------------- */
  let running=false, cancelFlag=false;

  function animate({scope,preset,easingFn,durationMs,record,returnMode,wmMode}){
    const c=window.canvas;
    const W=c.getWidth(), H=c.getHeight();
    const previewCanvas=$('#uaPreviewCanvas');
    const videoOut=$('#uaVideoOut');
    const dl=$('#uaDL');

    if (!record){
      previewCanvas.style.display='block';
      videoOut.style.display='none';
      dl.innerHTML='';
    } else {
      previewCanvas.style.display='none';
      videoOut.style.display='none';
      dl.innerHTML='';
    }

    const surface = record? document.createElement('canvas') : previewCanvas;
    surface.width=W; surface.height=H;
    const ctx=surface.getContext('2d');
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';

    const wmState=WM.prepare(wmMode);

    const vt0=(c.viewportTransform||[1,0,0,1,0,0]).slice();
    const baseScale0=vt0[0]; const baseE0=vt0[4]; const baseF0=vt0[5];

    const targets = scope==='camera'?[]:pickTargets(scope);
    if (scope!=='camera' && targets.length===0){
      showMsg('No targets');
      WM.restore(wmState.restores, wmMode);
      return;
    }

    const baselines=new Map();
    targets.forEach(o=>{
      baselines.set(o,{
        left:o.left, top:o.top,
        scaleX:o.scaleX, scaleY:o.scaleY,
        angle:o.angle||0, opacity:o.opacity==null?1:o.opacity
      });
    });

    const ret=planReturn(returnMode,durationMs);

    let rec=null,chunks=[];
    if (record){
      try{
        const stream=surface.captureStream(CONFIG.fps);
        const mime=pickMimeType();
        rec=new MediaRecorder(stream,{mimeType:mime});
        rec.ondataavailable=e=>{ if(e.data&&e.data.size) chunks.push(e.data); };
        rec.start();
      }catch(_){}
    }

    const start=performance.now();
    running=true; cancelFlag=false;
    showMsg(record?'Recording…':'Animating…');

    function phase(now){
      const elapsed=now-start;
      if (elapsed<=durationMs) return {ph:'forward',p:elapsed/durationMs};
      let t=elapsed-durationMs;
      if (ret.soft){
        if (t<=ret.soft) return {ph:'reverse',p:t/ret.soft};
        t-=ret.soft;
      } else if (ret.reverse){
        if (t<=ret.reverse) return {ph:'reverse',p:t/ret.reverse};
        t-=ret.reverse;
      }
      if (ret.snap){
        const span=ret.snap*(1000/CONFIG.fps);
        if (t<=span) return {ph:'snap',p:0};
        t-=span;
      }
      if (ret.hold){
        if (t<=ret.hold) return {ph:'hold',p:0};
        t-=ret.hold;
      }
      const tailSpan=CONFIG.tailFlushFrames*(1000/CONFIG.fps);
      if (t<=tailSpan) return {ph:'tail',p:1};
      return {ph:'done',p:1};
    }

    function applyCamera(tFrac, reverse){
      const f=preset.from,to=preset.to;
      const t=easingFn(tFrac);
      const z=clamp( lerp(f.z,to.z, reverse?1-t:t), 0.01, CONFIG.cameraMaxZoom);
      const xn=lerp(f.x,to.x, reverse?1-t:t);
      const yn=lerp(f.y,to.y, reverse?1-t:t);
      if (CONFIG.respectViewport){
        const eCam=(1 - z)*(W/2) + xn*W;
        const fCam=(1 - z)*(H/2) + yn*H;
        const finalScale=baseScale0*z;
        const finalE=baseE0 + eCam*baseScale0;
        const finalF=baseF0 + fCam*baseScale0;
        c.setViewportTransform([finalScale,0,0,finalScale,finalE,finalF]);
      } else {
        const e=(1 - z)*(W/2) + xn*W;
        const f2=(1 - z)*(H/2) + yn*H;
        c.setViewportTransform([z,0,0,z,e,f2]);
      }
    }

    function applyObjects(tFrac, reverse){
      const p=preset;
      const has=k=>p.from[k]!=null && p.to[k]!=null;
      const fwd=k=>lerp(p.from[k],p.to[k],tFrac);
      const rev=k=>lerp(p.to[k],p.from[k],tFrac);
      const val=k=>has(k)?(reverse?rev(k):fwd(k)):(k==='s'?1:0);

      const s=val('s');
      const rot=val('rot');
      const alpha=has('alpha')?val('alpha'):null;
      const dxN=val('dxN'), dyN=val('dyN');
      const dx=val('dx'), dy=val('dy');
      const dpx= dx + dxN*W;
      const dpy= dy + dyN*H;

      targets.forEach(o=>{
        const b=baselines.get(o); if(!b) return;
        const cw=o.getScaledWidth(), ch=o.getScaledHeight();
        const cx=b.left+cw/2, cy=b.top+ch/2;
        o.scaleX=b.scaleX*s;
        o.scaleY=b.scaleY*s;
        const nw=o.getScaledWidth(), nh=o.getScaledHeight();
        o.left=cx - nw/2 + dpx;
        o.top =cy - nh/2 + dpy;
        if (has('rot')) o.angle=b.angle+rot;
        if (alpha!=null) o.opacity=alpha*b.opacity;
        o.setCoords?.();
      });
    }

    function restoreAll(){
      if (scope==='camera') c.setViewportTransform(vt0.slice());
      else targets.forEach(o=>{
        const b=baselines.get(o); if(!b) return;
        o.left=b.left; o.top=b.top;
        o.scaleX=b.scaleX; o.scaleY=b.scaleY;
        o.angle=b.angle; o.opacity=b.opacity;
        o.setCoords?.();
      });
      c.requestRenderAll();
    }

    function drawFrame(){
      c.requestRenderAll();
      ctx.clearRect(0,0,W,H);
      ctx.drawImage(c.lowerCanvasEl || c.upperCanvasEl,0,0,W,H);
      if (wmMode==='lock') WM.drawLocked(ctx,W,H);
    }

    function step(){
      if (cancelFlag){ finalize(true); return; }
      const now=performance.now();
      const ph=phase(now);
      if (ph.ph==='forward'){
        const e=easingFn(ph.p);
        scope==='camera'?applyCamera(e,false):applyObjects(e,false);
        drawFrame();
      } else if (ph.ph==='reverse'){
        const e=easingFn(ph.p);
        scope==='camera'?applyCamera(e,true):applyObjects(e,true);
        drawFrame();
      } else if (['snap','hold','tail'].includes(ph.ph)){
        restoreAll();
        drawFrame();
      } else {
        restoreAll();
        drawFrame();
        finalize(false);
        return;
      }
      requestAnimationFrame(step);
    }

    function finalize(aborted){
      restoreAll();
      WM.restore(wmState.restores, wmMode);
      if (rec){
        try{
          rec.onstop=()=>{
            const mime=rec.mimeType||'video/webm';
            if(!aborted){
              const blob=new Blob(chunks,{type:mime});
              const url=URL.createObjectURL(blob);
              const ext=mime.includes('mp4')?'mp4':'webm';

              // Always show video + link (original behavior)
              const videoOut=$('#uaVideoOut');
              videoOut.style.display='block';
              videoOut.src=url;
              videoOut.play?.().catch(()=>{});

              const dl=$('#uaDL');
              dl.innerHTML='';
              const a=document.createElement('a');
              a.href=url;
              a.download=`anim_${Date.now()}.${ext}`;
              a.textContent='Download animation';
              dl.appendChild(a);

              // Auto-download if enabled
              if (CONFIG.autoDownloadOnExport){
                try{
                  const auto=document.createElement('a');
                  auto.href=url;
                  auto.download=`anim_${Date.now()}.${ext}`;
                  document.body.appendChild(auto);
                  auto.click();
                  setTimeout(()=>auto.remove(),0);
                }catch(_){}
              }
            }
            running=false; cancelFlag=false;
            showMsg(aborted?'Canceled':'Done');
          };
          rec.stop();
        }catch(_){
          running=false; cancelFlag=false;
          showMsg(aborted?'Canceled':'Done');
        }
      } else {
        running=false; cancelFlag=false;
        showMsg(aborted?'Canceled':'Done');
      }
    }

    step();
  }

 /* -------------------- Utilities -------------------- */
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function pickMimeType(){
  const pref=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
  if (typeof MediaRecorder==='undefined' || !MediaRecorder.isTypeSupported) return pref[2];
  for (const p of pref){ if (MediaRecorder.isTypeSupported(p)) return p; }
  return pref[2];
}

function gather(){
  buildPanel();
  const scope=$('#uaScope').value;
  const presetId=$('#uaPreset').value;
  const preset=PRESETS.find(p=>p.id===presetId) ||
    PRESETS.find(p=> (scope==='camera'?p.kind==='camera': scope==='base'?p.kind==='base':'overlay')) ||
    PRESETS[0];
  const easeSel=$('#uaEase').value;
  const easingFn=EASE[easeSel] || EASE[preset.ease] || EASE.ioSine;
  let dur=parseFloat($('#uaDur').value||'6');
  if(!Number.isFinite(dur)) dur=6;
  dur=clamp(dur,2,CONFIG.maxDurationSec);
  const durationMs=Math.round(dur*1000);
  const returnMode=$('#uaReturn').value;
  const wmMode=$('#uaWMMode').value;
  return { scope, preset, easingFn, durationMs, returnMode, wmMode };
}

function preview(){
  if (running){ showMsg('Busy'); return; }
  animate({ ...gather(), record:false });
}
function exportAnim(){
  if (running){ showMsg('Busy'); return; }
  animate({ ...gather(), record:true });
}
function stop(){
  if (!running) return;
  cancelFlag=true;
}

const API = {
  preview,
  export: exportAnim,
  stop,
  config: CONFIG,
  version: VERSION
};
window.raAnimateUnifiedV2 = API;

function init(){ buildPanel(); }
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init,{once:true});
else init();

})();