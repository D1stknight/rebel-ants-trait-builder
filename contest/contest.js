// /contest/contest.js
(function () {
  const elBoard = document.getElementById('board');
  const elEmpty = document.getElementById('empty');
  const elTitle = document.getElementById('cTitle');
  const elPrompt = document.getElementById('cPrompt');
  const elCountdown = document.getElementById('cCountdown');

  const EMOJIS = ['👍','❤️','🔥','😂','😮'];

  function esc(s){ return String(s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  async function json(url, opts){
    const r = await fetch(url, opts||{});
    const t = await r.text();
    try { return { ok:r.ok, status:r.status, data: JSON.parse(t) }; }
    catch { return { ok:r.ok, status:r.status, data: null, text: t }; }
  }

  function renderCountdown(meta){
    if (!meta?.endTs) { elCountdown.textContent = ''; return; }
    const left = Math.max(0, meta.endTs - Date.now());
    const s = Math.floor(left/1000)%60;
    const m = Math.floor(left/60000)%60;
    const h = Math.floor(left/3600000);
    elCountdown.textContent = `${h}h ${m}m ${s}s left`;
  }

  function cardHTML(e){
    const name = esc(e.name || 'Anonymous');
    const caption = esc(e.caption || '');
    const img = esc(e.imageUrl || e.url || '');

    return `
      <article class="entry" data-id="${e.id}">
        <img loading="lazy" src="${img}" alt="${name}">
        <div class="meta">
          <div class="name">${name}</div>
          ${caption ? `<div class="caption">${caption}</div>` : ''}
          <div class="score">Score: ${e.score|0}</div>
          <div class="votes">
            ${EMOJIS.map(em => `
              <button class="vote" data-emoji="${em}" aria-label="vote ${em}">${em}</button>
            `).join('')}
          </div>
        </div>
      </article>
    `;
  }

  async function loadBoard(){
    elEmpty.textContent = '';
    elBoard.innerHTML = '';

    const r = await json('/api/contest/contest');
    if (!r.ok) { elEmpty.textContent = r.text || 'Failed to load contest.'; return; }

    const { active, meta, entries } = r.data || {};
    if (!active) { elEmpty.textContent = 'No active contest right now.'; return; }

    // header
    if (meta) {
      elTitle.textContent = meta.name || 'Rebel Ants Weekly Contest';
      elPrompt.textContent = meta.prompt || '';
    }

    // entries
    const list = Array.isArray(entries) ? entries.slice() : [];
    if (!list.length) { elEmpty.textContent = 'No entries yet.'; return; }

    // newest first, then by score desc
    list.sort((a,b)=> (b.score|0)-(a.score|0) || (b.ts|0)-(a.ts|0));
    elBoard.innerHTML = list.map(cardHTML).join('');
  }

  // vote click handler
  document.addEventListener('click', async (ev)=>{
    const b = ev.target.closest('.vote');
    if (!b) return;
    const card = b.closest('.entry');
    if (!card) return;
    const entryId = card.getAttribute('data-id');
    const emoji = b.getAttribute('data-emoji');

    // optimistic UI: disable this emoji button
    b.disabled = true;

    const r = await json('/api/contest/vote', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ entryId, emoji })
    });

    if (!r.ok) {
      // re-enable if server rejected
      b.disabled = false;
      alert('Vote failed: ' + (r.text || (r.data && r.data.error) || 'error'));
      return;
    }

    // refresh board to update scores and keep order
    await loadBoard();
  });

  // initial + ticker
  (async function init(){
    await loadBoard();
    setInterval(loadBoard, 15000);
    setInterval(async ()=>{
      const r = await json('/api/contest/contest');
      if (r.ok && r.data?.meta) renderCountdown(r.data.meta);
    }, 1000);
  })();
})();
