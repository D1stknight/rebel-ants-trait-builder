// ============================================================================
// 56-footer-rename.js
// Original app.js lines 10722-10762 (41 lines)
// ============================================================================

})();

// ===== Runtime title + header rename (no need to edit index.html) =====
(() => {
  const NEW_TITLE = 'Rebel Ants Builder';

  function applyRename() {
    // 1) Tab / window title
    try {
      const t = document.title || '';
      // If it contains "Overlay Builder" or the old (vXX) label, force the new title
      if (/overlay builder/i.test(t) || /\(v\d+/i.test(t) || !t.trim()) {
        document.title = NEW_TITLE;
      }
    } catch {}

    // 2) The in-page crumb/pill at the top
    try {
      // Look for links/buttons that currently say "Overlay Builder (v...)" or "Overlay Builder"
      const nodes = document.querySelectorAll('a, button, .crumb, .breadcrumb, .nav a, header a');
      nodes.forEach(el => {
        const txt = (el.textContent || '').trim();
        if (/^overlay builder(\s*\(v.*\))?$/i.test(txt)) {
          el.textContent = NEW_TITLE;
        }
      });
    } catch {}
  }

  // Run now + after DOM builds
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyRename);
  } else {
    applyRename();
  }

  // If the nav is injected later, keep trying for a bit
  const mo = new MutationObserver(() => applyRename());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => mo.disconnect(), 6000); // stop after 6s
})();