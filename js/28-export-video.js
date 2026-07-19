// ============================================================================
// 28-export-video.js
// Original app.js lines 5554-5677 (124 lines)
// ============================================================================


/* ========== RA_EXPORT_VIDEO_v7 — Safari-friendly export (MP4 if possible, fallback open tab) ========== */
(function RA_EXPORT_VIDEO_v7(){
  const $  = (id)=> document.getElementById(id);
  const qs = (sel)=> document.querySelector(sel);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  function findExportBtn(){
    return $("exportVideoBtn")
      || qs('#exportVideoBtn, [data-role="exportVideo"]')
      || Array.from(document.querySelectorAll('button')).find(b => /export\s*video/i.test(b.textContent||""));
  }
  function findPreviewBtn(){
    return $("previewBtn")
      || qs('#previewBtn, [data-role="preview"]')
      || Array.from(document.querySelectorAll('button')).find(b => /^preview$/i.test((b.textContent||"").trim()));
  }

  const btn = findExportBtn();
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      // Duration (seconds) from UI (fallback 6)
      const durEl =
        $("animDuration") ||
        qs('#animDuration, [data-role="animDuration"], input[name="animDuration"]');
      let durSec = parseFloat(durEl && durEl.value || "6");
      if (!Number.isFinite(durSec) || durSec <= 0) durSec = 6;
      durSec = Math.min(60, Math.max(1, durSec));

      // Fabric drawing layer
      const capCanvas =
        (window.canvas && (canvas.lowerCanvasEl || (canvas.getElement && canvas.getElement()))) ||
        qs('canvas');
      if (!capCanvas || !capCanvas.captureStream) {
        alert("Sorry, this browser cannot capture canvas video.");
        return;
      }

      // Choose a MIME that the browser can actually record
      let mime = 'video/webm;codecs=vp9';
      if (typeof MediaRecorder !== 'undefined') {
        if (isSafari && MediaRecorder.isTypeSupported('video/mp4')) {
          mime = 'video/mp4'; // prefer MP4 on Safari
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
          mime = 'video/webm;codecs=vp9';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
          mime = 'video/webm;codecs=vp8';
        } else if (MediaRecorder.isTypeSupported('video/webm')) {
          mime = 'video/webm';
        }
      }

      const fps = 30;
      const stream = capCanvas.captureStream(fps);

      let rec;
      try {
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      } catch (e) {
        // Fallback if Safari says yes but throws on creation
        mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9'
             : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8'
             : 'video/webm';
        rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      }

      const chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => rec.onstop = res);

      // Drive the same animation you preview so export matches it
      const previewBtn = findPreviewBtn();
      if (previewBtn) {
        try { previewBtn.click(); } catch(_) {}
        await new Promise(r => setTimeout(r, 60));
        try { previewBtn.click(); } catch(_) {}
      }

      // Keep frames flowing
      let pumpTimer = 0;
      const pump = ()=> {
        try { window.canvas && canvas.requestRenderAll(); } catch(_){}
        pumpTimer = setTimeout(pump, Math.round(1000/fps));
      };

      pump();
      rec.start(200);

      // Exact duration (+ tiny pad for encoder)
      await new Promise(r => setTimeout(r, Math.round(durSec * 1000) + 180));
      rec.stop();
      clearTimeout(pumpTimer);
      await stopped;

      const ext  = mime.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: (mime.split(';')[0] || 'video/webm') });
      const url  = URL.createObjectURL(blob);

      // Save file — Safari often ignores download for blob; open in a new tab as fallback
      const a = document.createElement('a');
      a.href = url;
      a.download = `rebel-ants-export.${ext}`;

      if (isSafari) {
        // Try opening first (most reliable on Safari), user can Save As…
        const w = window.open(url);
        if (!w) { // popup blocked? fall back to download
          document.body.appendChild(a);
          a.click();
        }
      } else {
        document.body.appendChild(a);
        a.click();
      }
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1500);

    } catch (err) {
      console.error(err);
      alert("Export failed: " + (err && err.message || err));
    }
  }, { passive:true });
})();