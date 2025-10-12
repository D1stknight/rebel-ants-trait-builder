// /contest/contest.js
(function () {
  const elTitle = document.getElementById('cTitle');
  const elPrompt = document.getElementById('cPrompt');
  const elCountdown = document.getElementById('cCountdown');
  const elBoard = document.getElementById('board');
  const elImage = document.getElementById('eImage');
  const elName = document.getElementById('eName');
  const elCaption = document.getElementById('eCaption');
  const elFile = document.getElementById('eFile');
  const elMsg = document.getElementById('eMsg');

  let ACTIVE = null;

  async function json(url, opts) {
    const r = await fetch(url, opts || {});
    const txt = await r.text();
    if (!r.ok) throw new Error(txt || r.statusText);
    try { return JSON.parse(txt); } catch { return {}; }
  }

  async function loadContest() {
    const data = await json('/api/contest/contest');
    if (!data || data.ok === false) throw new Error(data && data.error || 'load failed');

    if (!data.active) {
      elTitle.textContent = 'No active contest';
      elPrompt.textContent = '';
      elCountdown.textContent = '';
      elBoard.innerHTML = '';
      return;
    }

    ACTIVE = data.meta || { name: 'Contest', prompt: '' };
    elTitle.textContent = ACTIVE.name || 'Contest';
    elPrompt.textContent = ACTIVE.prompt || '';

    // Tick countdown:
    const tick = () => {
      if (!ACTIVE || !ACTIVE.endTs) { elCountdown.textContent = ''; return; }
      const left = Math.max(0, ACTIVE.endTs - Date.now());
      const s = Math.floor(left / 1000) % 60;
      const m = Math.floor(left / 60000) % 60;
      const h = Math.floor(left / 3600000);
      elCountdown.textContent = `${h}h ${m}m ${s}s left`;
    };
    tick(); setInterval(tick, 1000);

    renderBoard(data.entries || []);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function renderBoard(items) {
    elBoard.innerHTML = '';
    if (!Array.isArray(items) || !items.length) return;

    for (const row of items) {
      const id   = esc(row.id || '');
      const name = esc(row.name || 'Anonymous');
      const cap  = esc(row.caption || '');
      const src  = esc(row.url || row.imageUrl || '');

      const card = document.createElement('article');
      card.className = 'entry';
      card.innerHTML = `
        <div class="imgWrap">
          <img loading="lazy" src="${src}" alt="${name}" />
        </div>
        <div class="meta">
          <div class="name">${name}</div>
          ${cap ? `<div class="caption">${cap}</div>` : ''}
          <div class="score">Score: ${row.score | 0}</div>
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

  // Upload helper for people not coming from the builder
  async function handleUpload() {
    const f = elFile.files[0];
    if (!f) throw new Error('Select a PNG/JPG first');
    const fd = new FormData();
    fd.append('file', f);
    const r = await fetch('/api/contest/upload', { method: 'POST', body: fd });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    const url = data.url || (data.pathname ? `https://blob.vercel-storage.com${data.pathname}` : '');
    if (!url) throw new Error('Upload returned no URL');
    elImage.value = url;
  }

  async function submitEntry() {
    elMsg.textContent = '';
    const name = elName.value.trim() || 'Anonymous';
    const imageUrl = elImage.value.trim();  // filled by Upload PNG or pasted
    const caption = elCaption.value.trim();

    if (!imageUrl) {
      elMsg.textContent = 'Please provide an Image URL or use Upload PNG.';
      return;
    }

    try {
      await json('/api/contest/entry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, caption, imageUrl })
      });
      elMsg.textContent = 'Thanks! Your entry was submitted.';
      elName.value = ''; elImage.value = ''; elCaption.value = ''; elFile.value = '';
      const fresh = await json('/api/contest/contest');
      renderBoard(fresh.entries || []);
    } catch (e) {
      elMsg.textContent = 'Submit failed: ' + e.message;
    }
  }

  // Wire up events
  const upBtn = document.getElementById('eUpload');
  if (upBtn) upBtn.addEventListener('click', async () => {
    try { await handleUpload(); elMsg.textContent = 'Uploaded ✓'; }
    catch (e) { elMsg.textContent = 'Upload failed: ' + e.message; }
  });

  document.getElementById('eSubmit')
    .addEventListener('click', submitEntry);

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.vote');
    if (!b) return;
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
      renderBoard(fresh.entries || []);
    } catch (err) {
      alert('Vote failed: ' + err.message);
    }
  });

  // Init
  loadContest().catch(err => {
    elBoard.innerHTML = '';
    elTitle.textContent = 'Contest';
    elPrompt.textContent = '';
    elCountdown.textContent = '';
    console.error(err);
  });
})();
