// ============================================================================
// 50-contest-actions.js
// Original app.js lines 10193-10264 (72 lines)
// ============================================================================


   /* =========================================================
   Export panel → compact "Submit to Contest" + "Open Contest"
   - Buttons sit together at the bottom-right of the Export card
   ========================================================= */
(function mountContestActions(){
  try {
    // Clean up any older versions
    ['raContestLink','raOpenContestBtn','raSendToContest','raSubmitToContest']
      .forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
    const oldRow = document.querySelector('.ra-contest-actions'); if (oldRow) oldRow.remove();

    // Find the right-side Export card
    const right = document.querySelector('aside.panel.right') || document.querySelector('.panel.right');
    if (!right) return;
    const exportCard =
      right.querySelector('.export, [data-card="export"]') ||
      Array.from(right.querySelectorAll('.card, section')).find(n => /export/i.test(n.textContent||'')) ||
      right;

    // Row that holds both buttons, aligned to the right
    const row = document.createElement('div');
    row.className = 'ra-contest-actions';

    // Submit button (compact)
    const submitBtn = document.createElement('button');
    submitBtn.id   = 'raSubmitToContest';
    submitBtn.type = 'button';
    submitBtn.className = 'ra-btn ra-primary';
    submitBtn.textContent = 'Submit to Contest';

    submitBtn.addEventListener('click', async () => {
      try {
        const canvas = document.getElementById('c'); // Fabric lower-canvas
        if (!canvas || typeof canvas.toDataURL !== 'function') {
          alert('Canvas not ready. Try again in a second.'); return;
        }

        const name    = prompt('Display name (shown on leaderboard):', '') || 'Anonymous';
        const caption = prompt('Caption (optional):', '') || '';
        const imageDataUrl = canvas.toDataURL('image/png');

        const r = await fetch('/api/contest/entry', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, caption, imageDataUrl })
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || 'Upload failed');

        alert('Submitted! Open the contest page to see your entry.');
      } catch (e) {
        alert('Submit failed: ' + (e && e.message || e));
      }
    });

    // Open contest button (compact)
    const openBtn = document.createElement('button');
    openBtn.id   = 'raOpenContestBtn';
    openBtn.type = 'button';
    openBtn.className = 'ra-btn ra-ghost';
    openBtn.textContent = 'Open Contest';
    openBtn.addEventListener('click', () => window.open('/contest', '_blank', 'noopener'));

    // Mount under the Export card (bottom)
    row.appendChild(openBtn);
    row.appendChild(submitBtn);
    exportCard.appendChild(row);
  } catch (e) {
    console.warn('Failed to mount contest actions:', e);
  }
})();