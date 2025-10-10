// /contest/contest.js
(function () {
  const elGallery = document.getElementById('gallery');
  const elEmpty   = document.getElementById('empty');

  fetch('/api/contest/contest')
    .then(r => r.json())
    .then(data => {
      if (!data || data.ok === false) {
        elEmpty.textContent = 'Error loading contest. Please try again.';
        return;
      }
      if (!data.active) {
        elEmpty.textContent = 'No active contest right now. Check back soon!';
        return;
      }
      const entries = Array.isArray(data.entries) ? data.entries : [];
      if (!entries.length) {
        elEmpty.textContent = 'Be the first to submit from the builder!';
        return;
      }

      elEmpty.textContent = '';
      elGallery.innerHTML = entries.map(cardHTML).join('');
    })
    .catch(err => {
      console.error(err);
      elEmpty.textContent = 'Failed to load entries.';
    });

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => (
      { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
    ));
  }

  function cardHTML(e) {
    const name    = esc(e.name || 'Anonymous');
    const caption = esc(e.caption || '');
    const url     = esc(e.url || '');
    return `
      <article class="entry">
        <img loading="lazy" src="${url}" alt="${name}">
        <div class="meta">
          <div class="name">${name}</div>
          ${caption ? `<div class="caption">${caption}</div>` : ''}
        </div>
      </article>`;
  }
})();
