// ============================================================================
// 27-canvas-controls-layout.js
// Original app.js lines 5462-5553 (92 lines)
// ============================================================================


    // Keyboard shortcut: press “Z” to toggle tool
    document.addEventListener('keydown', (e)=>{
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (e.key.toLowerCase() === 'z' && !e.metaKey && !e.ctrlKey && tag!=='input' && tag!=='textarea' && tag!=='select' && !e.target?.isContentEditable){
        e.preventDefault();
        toggleTool();
        setBtnText(toolOn ? 'Click Zoom: On' : 'Click Zoom: Off');
      }
    }, true);

    // Expose minimal API if you ever want to control it elsewhere
    window.raClickZoom = {
      on: ()=>toolOn,
      setAnchor: (x,y)=>{ lastAnchor = new fabric.Point(x,y); },
      clearAnchor: ()=>{ lastAnchor = null; },
      enable: enableTool, disable: disableTool, toggle: toggleTool
    };
  });
})();

/* === RA_CANVAS_CONTROLS_LAYOUT_v1 — put Reset + Click Zoom on their own line === */
(() => {
  if (window.__RA_CANVAS_LAYOUT_V1) return;
  window.__RA_CANVAS_LAYOUT_V1 = true;

  function findResetButton() {
    let el =
      document.getElementById('zoomReset') ||
      document.getElementById('resetZoom') ||
      document.getElementById('reset');
    if (el) return el;
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => /reset/i.test((b.textContent || '').trim()));
  }

  function place() {
    const reset = findResetButton();
    if (!reset) return false;

    // Try to find the row Reset was in, and the Canvas panel that contains it
    const row   = reset.closest ? (reset.closest('.row') || reset.parentNode) : reset.parentNode;
    const panel = row && row.parentNode ? row.parentNode : null;
    if (!panel) return false;

    // Create a small toolbar right BELOW that row
    let bar = document.getElementById('raCanvasBottomBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'raCanvasBottomBar';
      bar.style.display    = 'flex';
      bar.style.flexWrap   = 'wrap';
      bar.style.gap        = '8px';
      bar.style.marginTop  = '6px';
      panel.insertBefore(bar, row.nextSibling);
    }

    // Move RESET into the new toolbar
    bar.appendChild(reset);
    reset.style.margin   = '0';
    reset.style.fontSize = '12px';
    reset.style.padding  = '6px 8px';

    // If our Click‑Zoom toggle exists, move it next to Reset
    const cz = document.getElementById('raClickZoomToggle');
    if (cz) {
      bar.appendChild(cz);
      cz.style.margin   = '0';
      cz.style.fontSize = '12px';
      cz.style.padding  = '6px 8px';
      cz.style.whiteSpace = 'nowrap';
      cz.style.maxWidth = '120px';
    }

    // Let the first row wrap if it ever needs to (prevents overflow on small widths)
    if (row && row.style) {
      row.style.display   = 'flex';
      row.style.flexWrap  = 'wrap';
      row.style.gap       = '6px';
      row.style.alignItems = 'center';
    }

    return true;
  }

  // Try until the elements exist
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (place() || tries > 50) clearInterval(t);
  }, 150);
})();