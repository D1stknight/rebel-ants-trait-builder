// /contest/contest.js
(function () {
  const elTitle = document.getElementById('cTitle');
  const elPrompt = document.getElementById('cPrompt');
  const elCountdown = document.getElementById('cCountdown');
  const elTop10 = document.getElementById('top10');
  const elBoard = document.getElementById('board');

  let ACTIVE = null;

  async function json(url, opts) {
    const r = await fetch(url, opts || {});
    const t = await r.text();
    if (!r.ok) throw new Error(t || r.statusText);
    try { return JSON.parse(t); } catch { return {}; }
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  async function loadContest() {
    const data = await json('/api/contest/contest');
    if (!data || data.ok === false) throw new Error(data && data.error || 'load failed');

    if (!data.active) {
      elTitle.textContent = 'No active contest';
      elPrompt.textContent = '';
      elCountdown.textContent = '';
      elBoard.innerHTML = '';
      elTop10.innerHTML = '';
      return;
    }

    ACTIVE = data.meta || {};
    elTitle.textContent = ACTIVE.name || 'Contest';
    elPrompt.textContent = ACTIVE.prompt || '';

    const tick = () => {
      if (!ACTIVE || !ACTIVE.endTs) { elCountdown.textContent = ''; return; }
      const left = Math.max(0, ACTIVE.endTs - Date.now());
      const s = Math.floor(left / 1000) % 60;
      const m = Math.floor(left / 60000) % 60;
      const h = Math.floor(left / 3600000);
      elCountdown.textContent = `${h}h ${m}m ${s}s left`;
    };
    tick(); setInterval(tick, 1000);

    render(data.entries || []);
  }

  function render(items) {
    // sort: highest score first, then newest
    const sorted = [...(items || [])].sort((a,b) => (b.score|0) - (a.score|0) || (b.ts|0) - (a.ts|0));

    // Top 10 bar (names + scores)
    elTop10.innerHTML = sorted.slice(0, 10).map((e, i) => `
      <span class="chip">
        <b>${i+1}</b> ${esc(e.name || 'Anonymous')} <i>${e.score|0}</i>
      </span>`).join('');

    // Cards
    elBoard.innerHTML = '';
    for (const row of sorted) {
      const id   = esc(row.id || '');
      const name = esc(row.name || 'Anonymous');
      const cap  = esc(row.caption || '');
      const src  = esc(row.url || row.imageUrl || '');

      const card = document.createElement('article');
      card.className = 'entry';
      card.innerHTML = `
        <div class="imgWrap"><img loading="lazy" src="${src}" alt="${name}"></div>
        <div class="meta">
          <div class="name">${name}</div>
          ${cap ? `<div class="caption">${cap}</div>` : ''}
          <div class="score">Score: ${row.score|0}</div>
          <div class="votes">
            ${['👍','❤️','🔥','😂','😮'].map(em=>`
              <button class="vote" data-id="${id}" data-emoji="${em}">${em}</button>
            `).join('')}
          </div>
        </div>
      `;
      elBoard.appendChild(card);
    }
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.vote');
    if (!b) return;

    // tiny animation for fun
    b.classList.add('burst');
    setTimeout(() => b.classList.remove('burst'), 140);

    b.disabled = true; // UI guard
    try {
      await json('/api/contest/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entryId: b.getAttribute('data-id'),
          emoji: b.getAttribute('data-emoji')
        })
      });
      const fresh = await json('/api/contest/contest');
      render(fresh.entries || []);
    } catch (err) {
      alert('Vote failed: ' + err.message);
    }
  });

  loadContest().catch(console.error);
})();
