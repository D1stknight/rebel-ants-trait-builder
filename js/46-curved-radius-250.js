// ============================================================================
// 46-curved-radius-250.js
// Original app.js lines 9839-10014 (176 lines)
// ============================================================================


/* ===============================================================
   RA_CURVED_RADIUS_250_ONLY_V1
   Purpose: Force the Curved text feature to use Radius = 250 every time
            the "Curved" checkbox is turned ON (no other behavior changes).
   - Does NOT alter / add reversible logic.
   - Leaves existing curved / linear conversion code untouched.
   - Works by:
       1. Capturing the checkbox change event in the CAPTURE phase so
          we set the radius slider BEFORE the original handler runs.
       2. Fires input/change events so readUI() returns 250.
       3. After the curved object is created (which may be async),
          re‑enforces radius=250 a few times (40/120/240ms) in case
          legacy code overwrites it.
   - Public helper: window.raForceCurvedRadius250()
   - Safe to include multiple times (guarded).
   =============================================================== */
(function RA_CURVED_RADIUS_250_ONLY_V1(){
  if (window.__RA_CURVED_RADIUS_250_ONLY_V1__) return;
  window.__RA_CURVED_RADIUS_250_ONLY_V1__ = true;

  const TARGET_RADIUS = 250;

  const C = () => (window.canvas && window.canvas.upperCanvasEl) ? window.canvas : null;

  function log(){ /* Uncomment for debug:
    console.log('[CURVE250]', ...arguments); */ }

  /* ------------ DOM Finders ------------ */
  function findCustomTextCard(){
    const h = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,label'))
      .find(el => /custom text/i.test(el.textContent||''));
    return h ? (h.closest('.card') || h.parentElement) : null;
  }

  function findCurvedCheckbox(card){
    if (!card) return null;
    return Array.from(card.querySelectorAll('input[type="checkbox"]'))
      .find(cb=>{
        const lab = card.querySelector(`label[for="${cb.id}"]`) || cb.closest('label');
        return lab && /curved/i.test(lab.textContent||'');
      }) || null;
  }

  function findRadiusSlider(card){
    if (!card) return null;
    // Look for label containing "Radius"
    const lbl = Array.from(card.querySelectorAll('label,span,div'))
      .find(el => /radius/i.test(el.textContent||''));
    if (lbl){
      let scope = lbl.parentElement;
      for (let i=0;i<4 && scope && !scope.querySelector('input[type="range"]');i++){
        scope = scope.parentElement;
      }
      if (scope){
        // Pick the first range with value >= 100 (likely the radius) else first
        const ranges = Array.from(scope.querySelectorAll('input[type="range"]'));
        const likely = ranges.find(r => parseInt(r.value,10) >= 100);
        return likely || ranges[0] || null;
      }
    }
    // Fallback: any range
    return card.querySelector('input[type="range"]');
  }

  function fireValueChange(el){
    if (!el) return;
    try { el.dispatchEvent(new Event('input',  { bubbles:true })); } catch(_){}
    try { el.dispatchEvent(new Event('change', { bubbles:true })); } catch(_){}
  }

  /* ------------ Radius Enforcement ------------ */
  function setRadiusOnSlider(card){
    const slider = findRadiusSlider(card);
    if (!slider) return false;
    if (parseInt(slider.value,10) !== TARGET_RADIUS){
      slider.value = TARGET_RADIUS;
      fireValueChange(slider);
      return true;
    }
    return false;
  }

  function isCurved(o){
    return !!(o && (o._raCurved || o.data?.raType === 'curvedText' || o.raCurve));
  }

  function enforceOnActive(){
    const c = C(); if (!c) return;
    const o = c.getActiveObject && c.getActiveObject();
    if (o && isCurved(o) && o.raCurve){
      if (o.raCurve.radius !== TARGET_RADIUS){
        // Rebuild positions quickly by mimicking existing build logic formula if possible
        o.raCurve.radius = TARGET_RADIUS;
        // If your original code has a function to reflow (e.g. reflectUI or updateCurved),
        // call it here. Otherwise we reposition children directly:
        const kids = o._objects || [];
        const { arc, start, spacing, inward } = o.raCurve;
        const text = o.raCurve.text || extractText(o);
        const chars = kids.length === text.length ? kids : null;
        if (chars){
          const N = chars.length || 1;
            const step = (N>1 ? arc/(N-1) : 0) + (spacing/Math.max(TARGET_RADIUS,1))*(180/Math.PI);
            const startDeg = start - arc/2;
            for (let i=0;i<N;i++){
              const ang = (startDeg + i*step) * Math.PI/180;
              const ch = chars[i];
              ch.left  = TARGET_RADIUS * Math.cos(ang);
              ch.top   = TARGET_RADIUS * Math.sin(ang);
              ch.angle = (startDeg + i*step) + (inward ? -90 : 90);
              ch.setCoords && ch.setCoords();
            }
          o.setCoords && o.setCoords();
          try { c.requestRenderAll(); } catch(_){}
        }
      }
    }
  }

  function extractText(curved){
    if (!curved) return '';
    if (curved.raCurve && curved.raCurve.text) return curved.raCurve.text;
    if (Array.isArray(curved._objects)){
      return curved._objects.map(ch => ch.text || '').join('');
    }
    return '';
  }

  function multiEnforce(card){
    // Set slider BEFORE original handler runs (capture), then re‑enforce after object creation
    setRadiusOnSlider(card);
    [40,120,240].forEach(delay=>{
      setTimeout(()=>{
        setRadiusOnSlider(card);
        enforceOnActive();
      }, delay);
    });
  }

  /* ------------ Wiring ------------ */
  function wire(){
    const card = findCustomTextCard();
    if (!card){ retry(); return; }
    const curvedCB = findCurvedCheckbox(card);
    if (!curvedCB){ retry(); return; }
    if (curvedCB.__raRadius250) return;
    curvedCB.__raRadius250 = true;

    // Capture-phase so we run BEFORE existing change handlers
    curvedCB.addEventListener('change', (e)=>{
      if (curvedCB.checked){
        multiEnforce(card);
      }
    }, true);

    log('Curved radius=250 enforcement wired.');
  }

  function retry(i=0){
    if (i>60) return;
    setTimeout(()=>wire(i+1), 250);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wire, { once:true });
  } else {
    wire();
  }

  /* ------------ Public Helper ------------ */
  window.raForceCurvedRadius250 = function(){
    const card = findCustomTextCard();
    if (!card) return;
    multiEnforce(card);
  };
})();