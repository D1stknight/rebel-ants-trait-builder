// ============================================================================
// 51-admin-overlays-expand.js
// Original app.js lines 10265-10311 (47 lines)
// ============================================================================


/* ===== Admin (/?admin=1): Expand/Collapse the "Published Overlays" section ===== */
(function addPublishedExpandToggle(){
  if (!/[?&]admin=1\b/.test(location.search)) return;

  function findRight(){ return document.querySelector('aside.panel.right') || document.querySelector('.panel.right'); }
  function findTitle() {
    const right = findRight(); if (!right) return null;
    return [...right.querySelectorAll('h1,h2,h3,.section-title')]
      .find(el => /Published Overlays/i.test(el.textContent || '')) || null;
  }

  function mount() {
    const title = findTitle();
    if (!title || title.__raExpandMounted) return;
    title.__raExpandMounted = true;

    const btn = document.createElement('button');
    btn.textContent = 'Show all';
    btn.style.cssText = 'margin-left:8px;font-size:12px;padding:2px 8px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:#1b2538;color:#e8eefc;cursor:pointer;';
    title.appendChild(btn);

    const section = title.closest('section,.card,.group,.panel-section') || title.parentElement;
    let expanded = false;
    const right = findRight();

    function apply() {
      if (expanded) {
        if (right) right.style.overflowY = 'visible';
        section.style.maxHeight = 'none';
        section.style.overflow = 'visible';
        btn.textContent = 'Collapse';
      } else {
        if (right) right.style.overflowY = 'auto';
        section.style.maxHeight = '60vh';
        section.style.overflow = 'auto';
        btn.textContent = 'Show all';
      }
    }
    btn.onclick = () => { expanded = !expanded; apply(); };
    apply();
  }

  const mo = new MutationObserver(mount);
  mo.observe(document.body, { childList:true, subtree:true });
  mount();
})();