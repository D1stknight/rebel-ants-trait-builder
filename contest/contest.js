(function(){
  const EMOJIS = ['👍','❤️','🔥','😂','😮'];
  let ACTIVE = null;

  const elPrompt    = document.getElementById('cPrompt');
  const elCountdown = document.getElementById('cCountdown');
  const elChips     = document.getElementById('chips');
  const elBoard     = document.getElementById('board');

  const VOTE_LS = () => 'ra:voted:' + (ACTIVE?.id || 'none');

  init();

  async function init(){
    const data = await getJSON('/api/contest/contest').catch(()=>null);
    if (!data || !data.active){ elPrompt.textContent=''; elCountdown.textContent=''; return; }
    ACTIVE = { id: data.id, meta: data.meta || {} };
    elPrompt.textContent = ACTIVE.meta.prompt || 'Share your best overlay combo!';
    
    render(data.entries||[]);
  }

  function render(entries){
    // sort by score desc for initial render
    entries.sort((a,b)=> (b.score|0) - (a.score|0));

    // render chips (top 10 names + score)
    const top = entries.slice(0,10);
    elChips.innerHTML = top.map(e => `<span class="chip">${esc(e.name||'Anonymous')} ${e.score|0}</span>`).join('');

    // render cards
    elBoard.innerHTML = entries.map(cardHTML).join('');
    // set initial disabled state for buttons user already used
    const voted = JSON.parse(localStorage.getItem(VOTE_LS()) || '{}');
    elBoard.querySelectorAll('.card').forEach(card=>{
      const eid = card.dataset.id;
      EMOJIS.forEach(em => {
        const btn = card.querySelector(`button[data-emoji="${em}"]`);
        if (voted[`${eid}:${em}`]) btn.disabled = true;
      });
    });

    // delegate click handling
    elBoard.addEventListener('click', onVoteClick, { passive:false });
  }

 function cardHTML(e){
  const id      = esc(e.id);
  const name    = esc(e.name || 'Anonymous');
  const caption = esc(e.caption || '');
  const url     = esc(e.imageUrl || e.url || '');
  const votes   = e.votes || {};
  const score   = e.score|0;

  const buttons = EMOJIS.map(em => {
    const c = votes[em] | 0;
    return `<button class="voteBtn" data-id="${id}" data-emoji="${em}">
              <span>${em}</span><span class="count" data-count>${c}</span>
            </button>`;
  }).join('');

  // note: we include data-name and data-url for the share handler
  return `
    <article class="card" data-id="${id}" data-score="${score}" id="e-${id}">
      <div class="imgWrap">
        <img src="${url}" alt="${name}">
      </div>
      <div class="meta">
        <div class="name">${name}</div>
        ${caption ? `<div class="caption">${caption}</div>` : ''}
        <div class="voteBar">
          ${buttons}
          <button class="shareBtn" title="Share on X"
                  data-id="${id}" data-name="${name}" data-url="${url}">
            <span class="x">𝕏</span> Share
          </button>
          <div class="score" data-score>Score: ${score}</div>
        </div>
      </div>
    </article>`;
}

  async function onVoteClick(ev){
    const btn = ev.target.closest('button.voteBtn');
    if (!btn) return;

    const eid   = btn.getAttribute('data-id');
    const emoji = btn.getAttribute('data-emoji');
    if (!eid || !EMOJIS.includes(emoji)) return;

    // one vote per emoji per user → local gate
    const lsKey = VOTE_LS();
    const voted = JSON.parse(localStorage.getItem(lsKey) || '{}');
    if (voted[`${eid}:${emoji}`]) return; // already voted for this emoji

    // optimistic UI: disable + small pop animation
    btn.disabled = true;
    btn.classList.add('pop');

    try{
      const r = await postJSON('/api/contest/vote', { entryId: eid, emoji });
      if (!r || !r.ok) throw new Error(r?.error || 'vote failed');

      // update counts on this card only (no full re-render → no flicker)
      const card  = btn.closest('.card');
      const count = btn.querySelector('[data-count]');
      if (count) count.textContent = (r.votes && (r.votes[emoji]|0)) || +count.textContent+1;

      const scoreEl = card.querySelector('[data-score]');
      if (scoreEl) scoreEl.textContent = 'Score: ' + (r.score|0);
      card.dataset.score = r.score|0;

      // persist local “already voted” state
      voted[`${eid}:${emoji}`] = true;
      localStorage.setItem(lsKey, JSON.stringify(voted));

      // gently update chips
      refreshChips();
    }catch(e){
      // rollback UI if server rejected
      btn.disabled = false;
      alert('Vote failed: ' + (e.message||e));
    }finally{
      setTimeout(()=>btn.classList.remove('pop'), 260);
    }
  }

  function refreshChips(){
    // read current DOM scores to avoid refetch → no flicker
    const rows = [...elBoard.querySelectorAll('.card')].map(card=>{
      return {
        name: card.querySelector('.name')?.textContent || 'Anonymous',
        score: +(card.dataset.score||'0')
      };
    }).sort((a,b)=>b.score-a.score).slice(0,10);

    elChips.innerHTML = rows.map(r => `<span class="chip">${esc(r.name)} ${r.score}</span>`).join('');
  }

  // utilities
  async function getJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error(await r.text()); return r.json(); }
  async function postJSON(url, body){
    const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
    const text = await r.text();
    try { const json = JSON.parse(text); return json; } catch { throw new Error(text||('HTTP '+r.status)); }
  }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
})();

/* Countdown – single source of truth (guarded) */
(function () {
  if (window.__raCountdownMounted) return;         // prevent duplicates if file runs twice
  window.__raCountdownMounted = true;

  let timer = null;

  function getCountdownEl() {
    let el = document.getElementById('cCountdown');
    if (!el) {
      const head = document.querySelector('.c-head') || document.body;
      el = document.createElement('p');
      el.id = 'cCountdown';
      el.className = 'muted';
      head.appendChild(el);
    }
    return el;
  }

  async function start() {
    try {
      const r = await fetch('/api/contest/contest');
      const data = await r.json();
      const endTs = Number(data?.meta?.endTs || 0);   // ms since epoch
      if (!endTs) return;

      const el = getCountdownEl();
      clearInterval(timer);

      const tick = () => {
        const leftMs = endTs - Date.now();
        if (leftMs <= 0) {
          el.textContent = 'Ended';
          clearInterval(timer);
          return;
        }
        // ceil to avoid flicker to zeros between seconds
        const totalSec = Math.ceil(leftMs / 1000);
        const s = totalSec % 60;
        const m = Math.floor(totalSec / 60) % 60;
        const h = Math.floor(totalSec / 3600);
        el.textContent = `${h}h ${m}m ${s}s left`;
      };

      tick();
      timer = setInterval(tick, 1000);
    } catch {
      /* ignore network/parse errors */
    }
  }

  start();
})();

// ===== Share handling (append) =====
(function(){
  // attach once alongside your vote handler
  if (!elBoard.__shareWired) {
    elBoard.addEventListener('click', onShareClick, { passive:false });
    elBoard.__shareWired = true;
  }

  // Create an X intent URL (you can customize hashtags / via)
  function buildXIntent({ id, name, caption, imageUrl }){
    const contestURL = new URL('/contest', location.origin);
    contestURL.hash = 'e-' + id;

    // If you prefer the image to unfurl in the tweet card, set true.
    const PREF_IMAGE_UNFURL = false;

    const text = `${name ? name + ' — ' : ''}${caption || 'My contest entry'}\nVote here:`;
    const u = new URL('https://x.com/intent/tweet');
    u.searchParams.set('text', text);

    // Choose which URL should unfurl
    u.searchParams.set('url', (PREF_IMAGE_UNFURL && imageUrl) ? imageUrl : contestURL.toString());

    // Optional extras
    u.searchParams.set('hashtags', 'RebelAnts,Contest');
    // u.searchParams.set('via', 'RebelAnts'); // set if you have a handle

    // Add the second URL as plain text (won't unfurl)
    if (!PREF_IMAGE_UNFURL && imageUrl) u.searchParams.append('url', imageUrl);

    return u.toString();
  }

  async function onShareClick(ev){
    const b = ev.target.closest('.shareBtn');
    if (!b) return;

    const id   = b.getAttribute('data-id');
    const name = b.getAttribute('data-name') || '';
    const url  = b.getAttribute('data-url') || '';
    const cap  = b.closest('.card')?.querySelector('.caption')?.textContent || '';

    const contestURL = new URL('/contest', location.origin);
    contestURL.hash = 'e-' + id;

    const shareData = {
      title: 'Rebel Ants Contest',
      text: `${name ? name + ' — ' : ''}${cap || 'My contest entry'}\nVote here:`,
      url: contestURL.toString()
    };

    // Native share on phones (shows OS sheet with X if installed)
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch(_) { /* fall through */ }
    }

    // Desktop (or fallback): open X intent
    const intent = buildXIntent({ id, name, caption: cap, imageUrl: url });
    window.open(intent, '_blank', 'noopener');
  }
})();
