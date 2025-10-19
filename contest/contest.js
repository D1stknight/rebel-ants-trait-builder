(function(){
  const EMOJIS = ['👍','❤️','🔥','😂','😮'];
  let ACTIVE = null;

  const elTitle     = document.getElementById('cTitle');
  const elPrompt    = document.getElementById('cPrompt');
  const elCountdown = document.getElementById('cCountdown');
  const elChips     = document.getElementById('chips');
  const elBoard     = document.getElementById('board');

  const VOTE_LS = () => 'ra:voted:' + (ACTIVE?.id || 'none');

 init();

async function init(){
  const data = await getJSON('/api/contest/contest').catch(()=>null);

  if (!data || !data.active){
    if (elPrompt)     elPrompt.textContent = '';
    if (elCountdown)  elCountdown.textContent = '';
    return;
  }

  ACTIVE = { id: data.id, meta: data.meta || {} };

  // Set page heading and browser tab title from contest meta
  const titleText = ACTIVE.meta.name || ACTIVE.meta.frame || 'Rebel Ants Contest Page';
  if (elTitle) elTitle.textContent = titleText;
  document.title = `${titleText} — Contest`;

  // Existing prompt line
  if (elPrompt) elPrompt.textContent = ACTIVE.meta.prompt || 'Share your best overlay combo!';

  // (If you already call startCountdown elsewhere, keep it; otherwise you can call it here)
  // startCountdown(ACTIVE.meta.endTs|0);

  render(data.entries || []);
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

/* ===== Share to X (desktop: single link/new tab; mobile: image + link) ===== */
(function () {
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent || '');

  const SEL = '.shareBtn'; // <- matches your current buttons

  const contestURL = (id) =>
    `${location.origin}/contest#e-${encodeURIComponent(id || '')}`;

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest(SEL);
    if (!btn) return;

    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    const card    = btn.closest('.card');
    const id      = btn.dataset.id   || card?.dataset.id || '';
    const name    = btn.dataset.name || card?.querySelector('.name')?.textContent?.trim() || '';
    const caption = card?.querySelector('.caption')?.textContent?.trim() || '';
    const imgUrl  = btn.dataset.url  || card?.querySelector('img')?.src || '';

    const link = contestURL(id);
    const head = [name, caption].filter(Boolean).join(' — ') || 'Check this entry';

  // ---- Mobile (Web Share): ALWAYS include the contest link in text ----
    if (isMobile && navigator.share) {
      (async () => {
        try {
          // iOS can drop `url` when files are attached, so keep the link in TEXT too
          const shareText = `${head}\n\nVote here: ${link}`;
          const data = { text: shareText, url: link };

          // Try to attach the image (if CORS allows and the platform supports files)
          if (imgUrl && navigator.canShare && typeof navigator.canShare === 'function') {
            try {
              const resp = await fetch(imgUrl, { mode: 'cors', cache: 'no-store' });
              if (resp.ok) {
                const blob = await resp.blob();
                const file = new File([blob], 'rebel-ants.png', { type: blob.type || 'image/png' });
                if (navigator.canShare({ files: [file], text: shareText, url: link })) {
                  data.files = [file];
                }
              }
            } catch { /* ignore and share without file */ }
          }

          await navigator.share(data);
          return;
        } catch {
          // fall through to desktop flow if user cancels or share fails
          openX(head, link, imgUrl, id);
        }
      })();
      return;
    }

    // ---- Desktop (and fallback): open X compose in a NEW TAB, single link ----
    openX(head, link, imgUrl, id);
  }, { passive: false });

  function openX(head, link, imgUrl, id) {
  // Use the viewer page so the image opens at a friendly size
  const imgPage = `${location.origin}/contest/img.html?id=${encodeURIComponent(id || '')}`;

  const text = `${head}\n\nVote here: ${link}`
             + (imgUrl ? `\n\nImage: ${imgPage}` : '');

  const u = new URL('https://twitter.com/intent/tweet');
  u.searchParams.set('text', text);
  window.open(u.toString(), '_blank');
}
})();
