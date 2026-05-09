// ============================================================================
// 49-mobile-dock.js
// Original app.js lines 10126-10192 (67 lines)
// ============================================================================


/* ===== Mobile Dock Add‑on: Submit to Contest (non‑destructive) ===== */
(function () {
  const DOCK_SEL = '#raMobileDock';      // your mobile dock element
  const BTN_ID   = 'raDockSubmitBtn';    // id for our add-on button

  function findSubmitBtn() {
    // Try common ids/selectors first, then fall back to text match
    const guesses = [
      '#btnSubmitContest',
      '#submitContest',
      'button[data-action="submit-contest"]',
      'button#contestSubmit',
      'button[name="submit-contest"]'
    ];
    for (const sel of guesses) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return [...document.querySelectorAll('button, a[role="button"]')]
      .find(b => /submit/i.test(b.textContent || '') && /contest/i.test(b.textContent || ''));
  }

  function triggerSubmit() {
    const btn = findSubmitBtn();
    if (!btn) return false;
    btn.click();                 // use your existing handler/modal
    return true;
  }

  function openContest() {       // fallback if submit button not found
    try { window.location.href = '/contest/'; } catch {}
  }

  function ensureBtn(dock) {
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.className = 'dock-btn';
      btn.textContent = 'Submit';
      btn.title = 'Submit to Contest';
      dock.appendChild(btn);
      dock.classList.add('ra-has-contest');
    } else if (btn.parentElement !== dock) {
      dock.appendChild(btn);
    }
    btn.onclick = (e) => { e.preventDefault(); if (!triggerSubmit()) openContest(); };

    // ensure it’s visible on the right
    requestAnimationFrame(() => { try { dock.scrollLeft = dock.scrollWidth; } catch {} });
  }

  function init() {
    const dock = document.querySelector(DOCK_SEL);
    if (dock) ensureBtn(dock);
  }

  // Run now and re-run if the dock is re-rendered
  const obs = new MutationObserver(() => {
    if (!document.getElementById(BTN_ID) && document.querySelector(DOCK_SEL)) init();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();