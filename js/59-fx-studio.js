// ============================================================================
// 59-fx-studio.js — FX Studio v1 (WebGL2 shader effects + video export)
// ============================================================================
// Modern replacement candidate for Unified Animate (js/11, kept until FX
// Studio is approved). Renders the live Fabric canvas through a WebGL2
// uber-shader each frame: glitch, RGB split, VHS/scanlines, CRT, shake,
// glow pulse, embers, smoke, rain, heat shimmer, hologram, neon edges,
// pixelate, wave, zoom drift, spin, vignette. Preset combos, loop/ping-pong
// preview, and video export (WebCodecs MP4 with automatic WebM fallback).
// ============================================================================
;(() => {
  if (window.__RA_FX_STUDIO_V1__) return;
  window.__RA_FX_STUDIO_V1__ = true;

  const getCanvas = () => (window.canvas && window.canvas.lowerCanvasEl) ? window.canvas : null;

  // ---------------- Presets: [effect]: strength 0..1 ----------------
  const FX_KEYS = ['glitch','rgb','scan','crt','shake','glow','embers','smoke','rain','shimmer','holo','neon','pixel','wave','zoom','spin','vig','duo','kaleido','fish','grain','poster','strobe'];
  const PRESETS = [
    { id:'cyber_glitch', name:'Cyber Glitch',   fx:{ glitch:.8, rgb:.6, shake:.25, scan:.3 } },
    { id:'retro_vhs',    name:'Retro VHS',      fx:{ scan:.85, crt:.55, rgb:.3, shake:.08 } },
    { id:'hologram',     name:'Hologram',       fx:{ holo:.9, scan:.45, rgb:.25 } },
    { id:'neon_pulse',   name:'Neon Pulse',     fx:{ neon:.85, glow:.6, vig:.3 } },
    { id:'ember_storm',  name:'Ember Storm',    fx:{ embers:.9, glow:.35, smoke:.25, vig:.3 } },
    { id:'rainy_night',  name:'Rainy Night',    fx:{ rain:.8, smoke:.3, vig:.45 } },
    { id:'heatwave',     name:'Heatwave',       fx:{ shimmer:.8, glow:.25 } },
    { id:'vaporwave',    name:'Vaporwave',      fx:{ rgb:.5, wave:.45, scan:.3, vig:.25 } },
    { id:'earthquake',   name:'Earthquake',     fx:{ shake:.9, glitch:.3 } },
    { id:'dreamy',       name:'Dreamy Drift',   fx:{ zoom:.55, smoke:.3, glow:.4 } },
    { id:'pixel_riot',   name:'Pixel Riot',     fx:{ pixel:.7, glitch:.45 } },
    { id:'slow_flex',    name:'Slow Flex',      fx:{ zoom:.6, spin:.2, vig:.3 } },
    { id:'matrix',       name:'Matrix Rain',    fx:{ duo:.85, rain:.7, scan:.4 },              duo:[[0.05,0.9,0.25],[0.0,0.08,0.02]] },
    { id:'bloodmoon',    name:'Bloodmoon',      fx:{ duo:.8, vig:.5, smoke:.3 },               duo:[[1.0,0.25,0.15],[0.08,0.0,0.02]] },
    { id:'arctic',       name:'Arctic Ice',     fx:{ duo:.6, shimmer:.4, glow:.35 },           duo:[[0.75,0.95,1.0],[0.05,0.15,0.3]] },
    { id:'sepia_film',   name:'Sepia Film',     fx:{ duo:.75, grain:.6, vig:.45, crt:.2 },     duo:[[0.95,0.82,0.6],[0.15,0.09,0.04]] },
    { id:'golden_hour',  name:'Golden Hour',    fx:{ duo:.5, glow:.5, vig:.25 },               duo:[[1.0,0.85,0.55],[0.25,0.1,0.05]] },
    { id:'toxic',        name:'Toxic Ooze',     fx:{ duo:.7, wave:.4, smoke:.35 },             duo:[[0.6,1.0,0.2],[0.2,0.0,0.35]] },
    { id:'film_noir',    name:'Film Noir',      fx:{ duo:.9, grain:.5, vig:.55, rain:.25 },    duo:[[0.95,0.95,0.95],[0.03,0.03,0.05]] },
    { id:'kaleido_trip', name:'Kaleido Trip',   fx:{ kaleido:.85, spin:.3, rgb:.35 } },
    { id:'fisheye',      name:'Fisheye Bounce', fx:{ fish:.7, zoom:.3 } },
    { id:'strobe_rave',  name:'Strobe Rave',    fx:{ strobe:.6, rgb:.5, shake:.3 } },
    { id:'poster_pop',   name:'Posterized Pop', fx:{ poster:.7, neon:.5 } },
    { id:'arcade_8bit',  name:'8-Bit Arcade',   fx:{ pixel:.6, poster:.6, scan:.35 } },
    { id:'cursed_vhs',   name:'Cursed VHS',     fx:{ crt:.5, scan:.7, glitch:.5, grain:.5, duo:.3 }, duo:[[0.8,0.9,0.85],[0.05,0.02,0.08]] },
    { id:'ghost_signal', name:'Ghost Signal',   fx:{ holo:.7, smoke:.4, strobe:.2, rgb:.2 } },
    { id:'magma',        name:'Magma Core',     fx:{ embers:.8, duo:.45, shimmer:.4 },         duo:[[1.0,0.5,0.1],[0.15,0.0,0.0]] },
    { id:'starfield',    name:'Deep Space',     fx:{ embers:.7, duo:.6, vig:.5 },              duo:[[0.7,0.85,1.0],[0.0,0.02,0.08]] }
  ];

  // ---------------- Shaders ----------------
  const VERT = `#version 300 es
  in vec2 aPos; out vec2 vUv;
  void main(){ vUv = aPos*0.5+0.5; vUv.y = 1.0-vUv.y; gl_Position = vec4(aPos,0.,1.); }`;

  const FRAG = `#version 300 es
  precision highp float;
  uniform sampler2D uTex;
  uniform float uT;         // seconds * speed
  uniform vec2  uRes;
  uniform float uFx[23];    // strengths, order = FX_KEYS
  uniform vec3 uDuoA; uniform vec3 uDuoB;
  in vec2 vUv; out vec4 outC;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
  }
  float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }

  void main(){
    float gGlitch=uFx[0], gRgb=uFx[1], gScan=uFx[2], gCrt=uFx[3], gShake=uFx[4],
          gGlow=uFx[5], gEmb=uFx[6], gSmoke=uFx[7], gRain=uFx[8], gShim=uFx[9],
          gHolo=uFx[10], gNeon=uFx[11], gPix=uFx[12], gWave=uFx[13], gZoom=uFx[14],
          gSpin=uFx[15], gVig=uFx[16], gDuo=uFx[17], gKal=uFx[18], gFish=uFx[19],
          gGrain=uFx[20], gPoster=uFx[21], gStrobe=uFx[22];
    vec2 uv = vUv;
    float t = uT;

    // --- camera: slow zoom drift (loops via sine) + spin ---
    if (gZoom > 0.){
      float z = 1.0 + 0.10*gZoom*(0.5+0.5*sin(t*0.6));
      vec2 drift = 0.02*gZoom*vec2(sin(t*0.35), cos(t*0.27));
      uv = (uv - 0.5)/z + 0.5 + drift;
    }
    if (gSpin > 0.){
      float a = 0.06*gSpin*sin(t*0.5);
      vec2 p = uv-0.5; float ca=cos(a), sa=sin(a);
      uv = vec2(ca*p.x - sa*p.y, sa*p.x + ca*p.y)+0.5;
    }
    // --- kaleidoscope ---
    if (gKal > 0.){
      vec2 p = uv - 0.5;
      float seg = 6.2831853/6.0;
      float a = atan(p.y, p.x);
      float r = length(p);
      a = mod(a, seg); a = abs(a - seg*0.5);
      vec2 kuv = vec2(cos(a), sin(a))*r + 0.5;
      uv = mix(uv, kuv, gKal);
    }
    // --- fisheye pulse ---
    if (gFish > 0.){
      vec2 p = uv*2.-1.;
      float k = gFish*0.35*(0.5+0.5*sin(t*1.3));
      p *= 1.0 - k*dot(p,p)*0.5;
      uv = p*0.5+0.5;
    }
    // --- CRT barrel ---
    if (gCrt > 0.){
      vec2 p = uv*2.-1.;
      p *= 1.0 + gCrt*0.12*dot(p,p);
      uv = p*0.5+0.5;
    }
    // --- wave / heat shimmer / shake ---
    if (gWave > 0.)  uv.x += 0.02*gWave*sin(uv.y*12.0 + t*2.0);
    if (gShim > 0.)  uv += 0.012*gShim*vec2(noise(uv*8.0+t*1.7)-.5, noise(uv*8.0-t*1.3)-.5);
    if (gShake > 0.){
      float s = step(0.4, noise(vec2(t*8.0,3.7)));
      uv += 0.02*gShake*s*vec2(hash(vec2(t*13.,1.))-.5, hash(vec2(t*17.,2.))-.5);
    }
    // --- glitch block displacement ---
    if (gGlitch > 0.){
      float row = floor(uv.y*24.0);
      float on = step(0.75, hash(vec2(row, floor(t*9.0))));
      uv.x += on*gGlitch*(hash(vec2(row, floor(t*9.0)+1.))-.5)*0.18;
    }
    // --- pixelate ---
    if (gPix > 0.){
      float cells = mix(400.0, 40.0, gPix);
      uv = floor(uv*cells)/cells + 0.5/cells;
    }
    // out-of-bounds after warps -> dark edge
    vec2 uvc = clamp(uv, 0.0, 1.0);
    float inb = (uv==uvc) ? 1.0 : 0.0;

    // --- sample with RGB split ---
    float split = (gRgb*0.006) + gGlitch*0.004*step(0.6, noise(vec2(t*7.,9.)));
    vec3 col;
    col.r = texture(uTex, uvc + vec2( split, 0.)).r;
    col.g = texture(uTex, uvc).g;
    col.b = texture(uTex, uvc - vec2( split, 0.)).b;
    col *= inb;

    // --- neon edge (sobel-ish) ---
    if (gNeon > 0.){
      vec2 px = 1.0/uRes;
      float l0 = dot(texture(uTex, uvc).rgb, vec3(.299,.587,.114));
      float lx = dot(texture(uTex, uvc+vec2(px.x,0.)).rgb, vec3(.299,.587,.114)) - l0;
      float ly = dot(texture(uTex, uvc+vec2(0.,px.y)).rgb, vec3(.299,.587,.114)) - l0;
      float e = clamp(length(vec2(lx,ly))*6.0, 0., 1.);
      vec3 neonCol = mix(vec3(0.1,0.9,1.0), vec3(1.0,0.2,0.9), 0.5+0.5*sin(t*1.2));
      col += gNeon * e * neonCol * (0.7+0.3*sin(t*3.0));
    }
    // --- glow pulse (soft bloom approx) ---
    if (gGlow > 0.){
      vec2 px = 3.0/uRes;
      vec3 b = texture(uTex, uvc+vec2(px.x,0.)).rgb + texture(uTex, uvc-vec2(px.x,0.)).rgb
             + texture(uTex, uvc+vec2(0.,px.y)).rgb + texture(uTex, uvc-vec2(0.,px.y)).rgb;
      b *= 0.25;
      float pulse = 0.6+0.4*sin(t*2.2);
      col += gGlow * 0.35 * pulse * b*b;
    }
    // --- hologram ---
    if (gHolo > 0.){
      float lines = 0.5+0.5*sin(uvc.y*uRes.y*1.2 + t*6.0);
      float flick = 0.9 + 0.1*sin(t*40.0)*step(0.8, noise(vec2(t*3.,1.)));
      vec3 tint = vec3(0.35,0.9,1.0);
      col = mix(col, col*tint*(0.75+0.45*lines)*flick, gHolo);
    }
    // --- scanlines/VHS ---
    if (gScan > 0.){
      float sl = 0.5+0.5*sin(uvc.y*uRes.y*0.9);
      col *= 1.0 - gScan*0.25*sl;
      col += gScan*0.06*(hash(uvc*uRes + t*60.0)-.5);
    }
    // --- embers ---
    if (gEmb > 0.){
      vec3 acc = vec3(0.);
      for (int i=0;i<3;i++){
        float fi = float(i);
        vec2 p = uvc*vec2(20.0+8.0*fi, 14.0+6.0*fi);
        p.y += t*(0.8+0.5*fi);
        p.x += sin(t*0.7+fi*2.1)*0.6;
        vec2 id = floor(p);
        float star = step(0.965, hash(id+fi*7.13));
        vec2 f = fract(p)-0.5;
        float d = smoothstep(0.35, 0.0, length(f));
        float tw = 0.5+0.5*sin(t*4.0+hash(id)*6.28);
        acc += star*d*tw*mix(vec3(1.,0.55,0.15), vec3(1.,0.85,0.3), hash(id+1.7));
      }
      col += gEmb*acc;
    }
    // --- rain ---
    if (gRain > 0.){
      vec2 p = uvc*vec2(60.0, 8.0);
      p.y += t*6.0; p.x += uvc.y*2.0;
      float r = step(0.94, hash(vec2(floor(p.x), floor(p.y))));
      float streak = smoothstep(0.5, 0.0, abs(fract(p.y)-0.5))*r;
      col += gRain*0.35*streak*vec3(0.7,0.8,1.0);
      col *= 1.0 - gRain*0.08;
    }
    // --- smoke ---
    if (gSmoke > 0.){
      float s = fbm(uvc*3.0 + vec2(t*0.15, -t*0.1));
      col = mix(col, col*0.6 + vec3(0.5,0.5,0.55)*0.5, gSmoke*0.5*s);
    }
    // --- posterize ---
    if (gPoster > 0.){
      float levels = mix(12.0, 4.0, gPoster);
      col = floor(col*levels)/levels;
    }
    // --- film grain ---
    if (gGrain > 0.){
      col += gGrain*0.12*(hash(uvc*uRes + fract(t)*137.0)-.5);
    }
    // --- duotone color grade ---
    if (gDuo > 0.){
      float luma = dot(col, vec3(.299,.587,.114));
      col = mix(col, mix(uDuoB, uDuoA, luma), gDuo);
    }
    // --- strobe ---
    if (gStrobe > 0.){
      float fl = step(0.72, noise(vec2(t*10.0, 5.5)));
      col *= 1.0 + gStrobe*0.8*fl;
      col *= 1.0 - gStrobe*0.25*step(0.85, noise(vec2(t*13.0, 8.8)));
    }
    // --- vignette ---
    if (gVig > 0.){
      vec2 p = uvc*2.-1.;
      float v = smoothstep(1.5, 0.4, dot(p,p));
      float pulse = 0.9+0.1*sin(t*1.5);
      col *= mix(1.0, v*pulse, gVig);
    }
    outC = vec4(col, 1.0);
  }`;

  // ---------------- WebGL setup ----------------
  let gl=null, prog=null, tex=null, overlay=null, uT=null, uRes=null, uFxLoc=null, uDuoA=null, uDuoB=null;
  function initGL(w, h){
    overlay = document.createElement('canvas');
    overlay.id = 'raFxOverlay';
    overlay.width = w; overlay.height = h;
    overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:50;display:none;';
    gl = overlay.getContext('webgl2', { premultipliedAlpha:false, preserveDrawingBuffer:true });
    if (!gl) return false;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('[fx] shader', gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error('[fx] link', gl.getProgramInfoLog(prog)); return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    uT   = gl.getUniformLocation(prog, 'uT');
    uRes = gl.getUniformLocation(prog, 'uRes');
    uFxLoc = gl.getUniformLocation(prog, 'uFx');
    uDuoA = gl.getUniformLocation(prog, 'uDuoA');
    uDuoB = gl.getUniformLocation(prog, 'uDuoB');
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
    return true;
  }

  // ---------------- Runtime state ----------------
  let running=false, raf=0, t0=0;
  function currentPreset(){
    const presetId = document.getElementById('raFxPreset')?.value;
    return PRESETS.find(x => x.id === presetId) || PRESETS[0];
  }
  function currentFxArray(){
    const p = currentPreset();
    const master = parseFloat(document.getElementById('raFxMaster')?.value || '1');
    return FX_KEYS.map(k => Math.min(1.5, (p.fx[k] || 0) * master));
  }
  function frame(now){
    if (!running) return;
    const c = getCanvas(); if (!c) return;
    const src = c.lowerCanvasEl;
    const speed = parseFloat(document.getElementById('raFxSpeed')?.value || '1');
    const t = ((now - t0)/1000) * speed;
    const loopMode = document.getElementById('raFxLoop')?.value || 'loop';
    const dur = Math.max(1, parseFloat(document.getElementById('raFxDur')?.value || '6'));
    let tt = t % dur;
    if (loopMode === 'pingpong') { const c2 = t % (dur*2); tt = c2 < dur ? c2 : (dur*2 - c2); }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.viewport(0, 0, overlay.width, overlay.height);
    gl.uniform1f(uT, tt);
    gl.uniform2f(uRes, overlay.width, overlay.height);
    gl.uniform1fv(uFxLoc, currentFxArray());
    const duo = currentPreset().duo || [[1,1,1],[0,0,0]];
    gl.uniform3f(uDuoA, duo[0][0], duo[0][1], duo[0][2]);
    gl.uniform3f(uDuoB, duo[1][0], duo[1][1], duo[1][2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }
  function startPreview(){
    const c = getCanvas(); if (!c) { alert('Canvas not ready'); return; }
    const src = c.lowerCanvasEl;
    if (!gl){
      const wrap = src.parentElement;
      if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
      if (!initGL(src.width, src.height)) { alert('WebGL2 not available'); return; }
      wrap.appendChild(overlay);
    }
    if (overlay.width !== src.width || overlay.height !== src.height){
      overlay.width = src.width; overlay.height = src.height;
    }
    overlay.style.display = 'block';
    running = true; t0 = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stopPreview(){
    running = false;
    cancelAnimationFrame(raf);
    if (overlay) overlay.style.display = 'none';
  }

  // ---------------- Export ----------------
  async function exportVideo(statusEl){
    const c = getCanvas(); if (!c) { alert('Canvas not ready'); return; }
    const dur = Math.max(1, Math.min(30, parseFloat(document.getElementById('raFxDur')?.value || '6')));
    if (!running) startPreview();
    statusEl.textContent = 'Recording ' + dur + 's...';
    // Try WebCodecs MP4 first, fall back to MediaRecorder WebM.
    try {
      const mp4 = await tryWebCodecsMp4(dur);
      if (mp4) { finishExport(mp4, 'fx-export.mp4', statusEl); return; }
    } catch (e) { console.warn('[fx] mp4 path failed, falling back to webm', e); }
    try {
      const webm = await recordMediaRecorder(dur);
      finishExport(webm, 'fx-export.webm', statusEl);
    } catch (e) {
      statusEl.textContent = 'Export failed: ' + (e && e.message || e);
    }
  }
  function finishExport(blob, filename, statusEl){
    const url = URL.createObjectURL(blob);
    const a = document.getElementById('raFxDownload');
    a.href = url; a.download = filename;
    a.textContent = 'Download ' + filename + ' (' + (blob.size/1024/1024).toFixed(1) + ' MB)';
    a.style.display = 'inline-block';
    const v = document.getElementById('raFxVideo');
    v.src = url; v.style.display = 'block';
    statusEl.textContent = 'Done.';
  }
  function recordMediaRecorder(durSec){
    return new Promise((resolve, reject) => {
      const stream = overlay.captureStream(60);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      rec.onerror = e => reject(e.error || new Error('recorder error'));
      rec.start();
      setTimeout(() => { try { rec.stop(); } catch(_){} }, durSec * 1000);
    });
  }
  async function tryWebCodecsMp4(durSec){
    if (typeof VideoEncoder === 'undefined') return null;
    const mux = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm').catch(() => null);
    if (!mux) return null;
    const { Muxer, ArrayBufferTarget } = mux;
    const fps = 60, W = overlay.width & ~1, H = overlay.height & ~1;
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H }, fastStart: 'in-memory' });
    const enc = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error('[fx] encoder', e)
    });
    enc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 12_000_000, framerate: fps });
    const total = Math.round(durSec * fps);
    for (let i = 0; i < total; i++){
      await new Promise(r => requestAnimationFrame(r)); // let the preview loop draw
      const vf = new VideoFrame(overlay, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: i % 120 === 0 });
      vf.close();
      if (enc.encodeQueueSize > 8) await enc.flush();
    }
    await enc.flush();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  }

  // ---------------- UI ----------------
  function injectUI(){
    if (document.getElementById('raFxPanel')) return true;
    // Anchor: the Export card (the old Unified Animate panel this used to
    // anchor on was removed when FX Studio replaced it).
    let anim = document.getElementById('raAnimUnifiedV2Panel');
    if (!anim) {
      const hs = Array.from(document.querySelectorAll('h2,h3,h4,strong'));
      const h = hs.find(x => /^\s*export\s*$/i.test(x.textContent || ''));
      anim = h ? (h.closest('section') || h.parentElement) : null;
    }
    if (!anim) return false;
    const panel = document.createElement('div');
    panel.id = 'raFxPanel';
    panel.style.cssText = 'margin:16px 0;padding:14px;border:1px solid #23262c;border-radius:12px;background:#0f1116;color:#e9eaed;font:12px system-ui;';
    const opts = PRESETS.map(p => '<option value="' + p.id + '">' + p.name + '</option>').join('');
    panel.innerHTML = [
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">',
      '<strong style="font-size:14px;">FX Studio</strong>',
      '<span style="opacity:.5;font-size:11px;">v1 - WebGL effects</span>',
      '</div>',
      '<div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;">',
      '<label>Preset</label><select id="raFxPreset">' + opts + '</select>',
      '<label>Intensity</label><input id="raFxMaster" type="range" min="0.2" max="1.5" step="0.05" value="1">',
      '<label>Speed</label><input id="raFxSpeed" type="range" min="0.25" max="3" step="0.05" value="1">',
      '<label>Duration</label><div><input id="raFxDur" type="number" min="1" max="30" value="6" style="width:60px;background:#161a21;color:#e9eaed;border:1px solid #2c3138;border-radius:8px;padding:6px;"> s</div>',
      '<label>Loop</label><select id="raFxLoop"><option value="loop">Loop</option><option value="pingpong">Ping-pong</option></select>',
      '</div>',
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">',
      '<button id="raFxPreview" class="btn">Preview</button>',
      '<button id="raFxStop" class="btn">Stop</button>',
      '<button id="raFxExport" class="btn">Export Video</button>',
      '</div>',
      '<div id="raFxStatus" style="margin-top:6px;font-size:12px;opacity:.75;"></div>',
      '<a id="raFxDownload" style="display:none;margin-top:6px;color:#7dd3fc;"></a>',
      '<video id="raFxVideo" controls loop style="display:none;width:100%;margin-top:8px;border-radius:8px;"></video>'
    ].join('');
    panel.querySelectorAll('select').forEach(s => {
      s.style.cssText = 'background:#161a21;color:#e9eaed;border:1px solid #2c3138;border-radius:8px;padding:7px 10px;';
    });
    anim.parentNode.insertBefore(panel, anim);
    const status = panel.querySelector('#raFxStatus');
    panel.querySelector('#raFxPreview').onclick = startPreview;
    panel.querySelector('#raFxStop').onclick = stopPreview;
    panel.querySelector('#raFxExport').onclick = () => exportVideo(status);
    return true;
  }
  let tries = 0;
  const t = setInterval(() => { if (injectUI() || ++tries > 60) clearInterval(t); }, 300);
})();
