<!-- /contest/contest.js -->
<script>
(function () {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const state = { contestId: null, byId: Object.create(null), entries: [] };

  // small helper to avoid any caches
  async function json(url, opts) {
    const u = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
    const r = await fetch(u, opts || {});
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  // ---------- INITIAL LOAD ----------
  (async function init(){
    const data = await json('/api/contest/contest');
    if (!data || data.ok === false || !data.active) {
      $('#gallery')?.remove();
      $('#empty').textContent = 'No active contest right now. Check back soon!';
      return;
    }
    state.contestId = data.id || (data.meta && data.meta.id);
    renderAll(data.entries || []);
    startCountdown((data.meta && data.meta.endTs) || data.endTs);
  })().catch(err => { console.error(err); $('#empty').textContent = 'Failed to load contest.'; });

  // ---------- COUNTDOWN ----------
  function startCountdown(endTs){
    const el = $('#countdown');
    if (!el || !endTs) return;
    const tick = () => {
      const left = Math.max(0, endTs - Date.now());
      const s = Math.floor(left/1000)%60;
      const m = Math.floor(left/60000)%60;
      const h = Math.floor(left/3600000);
      el.textContent = `${h}h ${m}m ${s}s left`;
    };
    tick(); setInterval(tick, 1000);
  }

  // ---------- RENDER ----------
  function renderAll(entries){
    // normalize, score, sort
    state.entries = (entries || []).map(e => normalize(e));
    state.entries.sort((a,b) => b.score - a.score || a.name.localeCompare(b.name));
    state.byId = Object.fromEntries(state.entries.map(e => [e.id, e]));
    const gallery = $('#gallery');
    $('#empty').textContent = state.entries.length ? '' : 'Be the first to submit from the builder!';
    gallery.innerHTML = state.entries.map(cardHTML).join('');
  }

  function normalize(e){
    const v = e.votes || {};
    const score = Object.values(v).reduce((a,b)=>a+(b|0),0);
    return {
      id: String(e.id),
      name: e.name || 'Anonymous',
      caption: e.caption || '',
      imageUrl: e.imageUrl || e.url || '',
      votes: { '👍':v['👍']|0, '❤️':v['❤️']|0, '🔥':v['🔥']|0, '😂':v['😂']|0, '😮':v['😮']|0 },
      score
    };
  }

  function cardHTML(e){
    const voted = (emoji) => localStorage.getItem(voteKey(e.id, emoji)) ? 'disabled' : '';
    return `
      <article class="entry card" data-id="${e.id}">
        <div class="imgWrap"><img loading="lazy" src="${escapeHtml(e.imageUrl)}" alt=""></div>
        <div class="meta">
          <div class="name">${escapeHtml(e.name)}</div>
          ${e.caption ? `<div class="caption">${escapeHtml(e.caption)}</div>` : ''}
          <div class="scoreLine">Score: <span class="score" data-score>${e.score}</span></div>
          <div class="votes">
            ${['👍','❤️','🔥','😂','😮'].map(em => `
              <button class="vote" data-emoji="${em}" ${voted(em)} title="Vote ${em}">
                <span class="em">${em}</span>
                <span class="cnt" data-cnt="${em}">${e.votes[em]||0}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </article>`;
  }

  function updateCard(entry){
    const el = $(`.card[data-id="${entry.id}"]`);
    if (!el) return;
    for (const em of ['👍','❤️','🔥','😂','😮']){
      const cnt = $(`[data-cnt="${em}"]`, el);
      if (cnt) cnt.textContent = entry.votes[em] || 0;
      const btn = $(`.vote[data-emoji="${em}"]`, el);
      if (btn) btn.disabled = !!localStorage.getItem(voteKey(entry.id, em));
    }
    const sc = $('[data-score]', el);
    if (sc) sc.textContent = entry.score;
  }

  function maybeResort(){
    // If order changed, re-render everything
    const before = state.entries.map(e => e.id).join(',');
    state.entries.sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name));
    const after = state.entries.map(e => e.id).join(',');
    if (before !== after) {
      const gallery = $('#gallery');
      gallery.innerHTML = state.entries.map(cardHTML).join('');
    }
  }

  function voteKey(id, emoji){
    return `voted:${state.contestId}:${id}:${emoji}`;
  }

  // ---------- CLICK HANDLER (VOTE) ----------
  document.addEventListener('click', async (ev)=>{
    const btn = ev.target.closest('.vote');
    if (!btn) return;
    const card = ev.target.closest('.card');
    if (!card) return;

    const entryId = card.getAttribute('data-id');
    const emoji = btn.getAttribute('data-emoji');
    if (!entryId || !emoji) return;
    if (btn.disabled) return;

    btn.disabled = true;
    burst(btn, emoji);

    try{
      const res = await json('/api/contest/vote', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ entryId, emoji })
      });

      // treat {ok:true} and {duplicated:true} similarly for UI
      if (res.ok || res.duplicated){
        localStorage.setItem(voteKey(entryId, emoji), '1');
        if (res.ok && res.votes){
          const entry = state.byId[entryId];
          if (entry){
            entry.votes = { ...entry.votes, ...res.votes };
            entry.score = res.score|0;
            updateCard(entry);
            maybeResort();
          }
        }
      } else {
        btn.disabled = false;
        alert('Vote failed: ' + (res.error || 'unknown'));
      }
    }catch(e){
      btn.disabled = false;
      console.error(e);
      alert('Vote failed: ' + e.message);
    }
  });

  // ---------- Fun burst animation near the button ----------
  function burst(anchor, emoji){
    const card = anchor.closest('.card');
    if (!card) return;
    card.style.position = 'relative';
    const rect = anchor.getBoundingClientRect();
    const base = document.createElement('div');
    base.className = 'burstBase';
    base.style.position = 'absolute';
    base.style.left = (anchor.offsetLeft + anchor.offsetWidth/2) + 'px';
    base.style.top  = (anchor.offsetTop  + anchor.offsetHeight/2) + 'px';
    base.style.pointerEvents = 'none';
    card.appendChild(base);
    for (let i=0;i<6;i++){
      const sp = document.createElement('span');
      sp.className = 'burst';
      sp.textContent = emoji;
      const a = (Math.PI * 2) * (i/6) + (Math.random()*0.6-0.3);
      const r = 26 + Math.random()*16;
      sp.style.setProperty('--tx', (Math.cos(a)*r)+'px');
      sp.style.setProperty('--ty', (Math.sin(a)*r)+'px');
      sp.style.setProperty('--rot', (Math.random()*40-20)+'deg');
      base.appendChild(sp);
      sp.addEventListener('animationend', ()=> sp.remove());
    }
    setTimeout(()=> base.remove(), 650);
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
})();
</script>
