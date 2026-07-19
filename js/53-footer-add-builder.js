// ============================================================================
// 53-footer-add-builder.js
// Original app.js lines 10570-10593 (24 lines)
// ============================================================================


// ===== Rebel Ants: add footer on Builder if missing =====
(() => {
  // If a footer already exists (e.g., on contest), do nothing
  if (document.getElementById('ra-footer')) return;

  const footer = document.createElement('footer');
  footer.className = 'ra-site-footer';
  footer.id = 'ra-footer';

  // Your legal files are at project root per your screenshot
  footer.innerHTML = `
    <nav class="links">
      <a href="/contest/rules.html">Contest Rules</a>
      <a href="/contest/privacy.html">Privacy</a>
      <a href="/contest/terms.html">Terms</a>
      <a href="/contest/moderation.html">Moderation</a>
    </nav>
    <small>© Rebel Ants LLC</small>
  `;

  // Append after paint so it sits above any mobile dock
  requestAnimationFrame(() => document.body.appendChild(footer));
})();