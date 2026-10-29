// contest/contest.js — the public contest page.
// Shows the open contest (or the last one, with its results): countdown, Ant-Thony's verdict,
// winners, leaderboard, and entry cards with reactions, his roast and an X share button.
(function () {
  const EMOJIS = ['👍', '❤️', '🔥', '😂', '😮'];
  const $ = (id) => document.getElementById(id);

  let DATA = null;          // last /api/contest/contest response
  let ENTRIES = [];         // entries with live scores
  let SORT = 'top';
  let OPEN = false;         // can people react right now
  let timer = null;

  const VOTE_LS = () => 'ra:voted:' + (DATA && DATA.id || 'none');
  const readVoted = () => { try { return JSON.parse(localStorage.getItem(VOTE_LS()) || '{}'); } catch (_) { return {}; } };
  const saveVoted = (v) => { try { localStorage.setItem(VOTE_LS(), JSON.stringify(v)); } catch (_) {} };

  init();

  async function init() {
    let data = null;
    try { data = await getJSON('/api/contest/contest'); } catch (_) {}
    if (!data || !data.ok || !data.id) return renderNone();

    DATA = data;
    const meta = data.meta || {};
    const endTs = Number(meta.endTs) || 0;
    OPEN = data.votingOpen !== undefined ? !!data.votingOpen : (!!data.active && (!endTs || Date.now() < endTs));

    const title = meta.name || meta.frame || 'Overlay Contest';
    $('cTitle').textContent = title;
    document.title = title + ' · Rebel Ants Contest';
    $('cPrompt').textContent = meta.prompt || 'Build your best Rebel Ants overlay combo.';

    ENTRIES = (data.entries || []).map((e) => ({ ...e, score: score(e.votes) }));

    setStatus();
    if (OPEN && endTs) startClock(endTs);
    else $('cCountdown').textContent = endTs ? 'Ended ' + when(endTs) : '';

    renderStats();
    renderVerdict();
    renderPodium();
    renderBoard();
    bindSort();
    jumpToHash();
  }

  // ---------- status + clock ----------
  function setStatus() {
    const el = $('cStatus');
    const t = $('cStatusText');
    const v = DATA.verdict;
    if (OPEN) { el.className = 'ct-status live'; t.textContent = 'Live · voting open'; }
    else if (DATA.active) { el.className = 'ct-status wait'; t.textContent = 'Voting closed · Ant-Thony is judging'; }
    else if (v || (DATA.winners || []).length) { el.className = 'ct-status done'; t.textContent = 'Ended · results are in'; }
    else { el.className = 'ct-status done'; t.textContent = 'Ended'; }
    $('cHint').textContent = OPEN
      ? 'Tap a reaction to give 1 point. One of each per entry.'
      : 'Voting is closed. Scores are final.';
    $('cCta').hidden = !OPEN;
  }

  function startClock(endTs) {
    $('cClock').hidden = false;
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const left = endTs - Date.now();
      if (left <= 0) {
        clearInterval(timer);
        OPEN = false;
        $('cClock').hidden = true;
        $('cCountdown').textContent = 'Time is up. Ant-Thony is judging.';
        setStatus();
        renderBoard();
        return;
      }
      const s = Math.ceil(left / 1000);
      $('cD').textContent = Math.floor(s / 86400);
      $('cH').textContent = pad(Math.floor(s / 3600) % 24);
      $('cM').textContent = pad(Math.floor(s / 60) % 60);
      $('cS').textContent = pad(s % 60);
      $('cCountdown').textContent = 'Voting closes ' + when(endTs);
    };
    tick();
    timer = setInterval(tick, 1000);
  }

  function renderStats() {
    const total = ENTRIES.reduce((a, e) => a + e.score, 0);
    const players = new Set(ENTRIES.map((e) => (e.name || '').toLowerCase())).size;
    $('cStats').innerHTML = [
      [ENTRIES.length, ENTRIES.length === 1 ? 'entry' : 'entries'],
      [players, players === 1 ? 'builder' : 'builders'],
      [total, total === 1 ? 'reaction' : 'reactions'],
    ].map(([n, l]) => '<div><b>' + n.toLocaleString('en-US') + '</b><span>' + l + '</span></div>').join('');
  }

  // ---------- Ant-Thony ----------
  function renderVerdict() {
    const v = DATA.verdict;
    const box = $('verdict');
    if (!v || (!v.closing && !(v.finalists || []).length)) { box.hidden = true; return; }
    const fin = (v.finalists || []).map((f) => {
      const e = ENTRIES.find((x) => x.id === f.entryId);
      const img = e ? (e.imageUrl || e.url || '') : '';
      return '<a class="ct-fin" href="#e-' + esc(f.entryId || '') + '">' +
        (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '') +
        '<span>' + esc(f.name || 'Anonymous') + '</span></a>';
    }).join('');
    box.innerHTML =
      '<div class="ct-judge" aria-hidden="true">' + judgeSVG() + '</div>' +
      '<div class="ct-vBody">' +
        '<div class="ct-kicker">THE JUDGE HAS SPOKEN</div>' +
        '<h2>Ant-Thony\'s verdict</h2>' +
        (v.closing ? '<blockquote>“' + esc(v.closing) + '”</blockquote>' : '') +
        (fin ? '<div class="ct-finLabel">His finalists</div><div class="ct-fins">' + fin + '</div>' : '') +
      '</div>';
    box.hidden = false;
  }

  function renderPodium() {
    const w = (DATA.winners || []).slice().sort((a, b) => a.place - b.place);
    if (!w.length) { $('podium').hidden = true; return; }
    const order = [w.find((x) => x.place === 2), w.find((x) => x.place === 1), w.find((x) => x.place === 3)].filter(Boolean);
    const medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
    $('podiumRow').innerHTML = order.map((x) =>
      '<a class="ct-step p' + x.place + '" href="#e-' + esc(x.entryId) + '">' +
        '<div class="ct-stepImg">' + (x.imageUrl ? '<img src="' + esc(x.imageUrl) + '" alt="" loading="lazy">' : '') + '</div>' +
        '<div class="ct-stepName">' + medal[x.place] + ' ' + esc(x.name || 'Anonymous') + '</div>' +
        '<div class="ct-stepScore">' + (x.score | 0) + ' points</div>' +
        '<div class="ct-block">' + x.place + '</div>' +
      '</a>').join('');
    $('podium').hidden = false;
  }

  function renderLeaders() {
    const top = ENTRIES.slice().sort((a, b) => b.score - a.score).slice(0, 10);
    if (!top.length) { $('leaders').hidden = true; return; }
    const max = Math.max(1, top[0].score);
    $('chips').innerHTML = top.map((e, i) =>
      '<li><a href="#e-' + esc(e.id) + '">' +
        '<span class="ct-rank">' + (i + 1) + '</span>' +
        '<img src="' + esc(e.imageUrl || e.url || '') + '" alt="" loading="lazy">' +
        '<span class="ct-lName">' + esc(e.name || 'Anonymous') + '</span>' +
        '<span class="ct-bar"><i style="width:' + Math.round((e.score / max) * 100) + '%"></i></span>' +
        '<b>' + e.score + '</b>' +
      '</a></li>').join('');
    $('leaders').hidden = false;
  }

  // ---------- entries ----------
  function renderBoard() {
    renderLeaders();
    const list = ENTRIES.slice().sort(SORT === 'new'
      ? (a, b) => (b.ts | 0) - (a.ts | 0)
      : (a, b) => b.score - a.score || (a.ts | 0) - (b.ts | 0));
    $('cCount').textContent = ENTRIES.length ? String(ENTRIES.length) : '';
    if (!list.length) {
      $('board').innerHTML = '';
      $('empty').hidden = false;
      $('empty').innerHTML = OPEN
        ? '<b>No entries yet.</b><span>Be the first: build an overlay and press Submit to Contest.</span><a class="ct-btn" href="/">Open the Builder</a>'
        : '<b>No entries in this round.</b>';
      return;
    }
    $('empty').hidden = true;
    const voted = readVoted();
    const rank = new Map(ENTRIES.slice().sort((a, b) => b.score - a.score).map((e, i) => [e.id, i + 1]));
    $('board').innerHTML = list.map((e) => cardHTML(e, voted, rank.get(e.id))).join('');
  }

  function cardHTML(e, voted, rank) {
    const id = esc(e.id);
    const name = esc(e.name || 'Anonymous');
    const caption = esc(e.caption || '');
    const url = esc(e.imageUrl || e.url || '');
    const votes = e.votes || {};
    const review = DATA.verdict && DATA.verdict.reviews ? DATA.verdict.reviews[e.id] : null;
    const isFinalist = DATA.verdict && (DATA.verdict.finalists || []).some((f) => f.entryId === e.id);
    const win = (DATA.winners || []).find((w) => w.entryId === e.id);

    const buttons = EMOJIS.map((em) => {
      const done = !!voted[e.id + ':' + em];
      return '<button class="ct-react' + (done ? ' mine' : '') + '" type="button" data-id="' + id + '" data-emoji="' + em + '"' +
        (done || !OPEN ? ' disabled' : '') + ' aria-label="React ' + em + '">' +
        '<span>' + em + '</span><span class="n" data-count>' + (votes[em] | 0) + '</span></button>';
    }).join('');

    const tags = [
      win ? '<span class="ct-tag gold">' + ['', '🥇 1st', '🥈 2nd', '🥉 3rd'][win.place] + '</span>' : '',
      isFinalist ? '<span class="ct-tag violet">Ant-Thony\'s pick</span>' : '',
      !win && rank && rank <= 3 && e.score > 0 ? '<span class="ct-tag">#' + rank + '</span>' : '',
    ].join('');

    return '<article class="ct-card" data-id="' + id + '" id="e-' + id + '">' +
      '<a class="ct-img" href="/contest/img.html?id=' + encodeURIComponent(e.id) + '" aria-label="Open ' + name + ' full size">' +
        (url ? '<img src="' + url + '" alt="' + name + '" loading="lazy">' : '') +
        (tags ? '<div class="ct-tags">' + tags + '</div>' : '') +
      '</a>' +
      '<div class="ct-meta">' +
        '<div class="ct-nameRow"><span class="ct-name">' + name + '</span><span class="ct-score" data-score>' + e.score + ' pts</span></div>' +
        (caption ? '<p class="ct-caption">' + caption + '</p>' : '') +
        (review && review.roast
          ? '<div class="ct-roast"><div class="ct-roastHead"><span class="ct-mini" aria-hidden="true">' + judgeSVG() + '</span>Ant-Thony' +
            (review.score ? '<b>' + (review.score | 0) + '/10</b>' : '') + '</div><p>' + esc(review.roast) + '</p></div>'
          : '') +
        '<div class="ct-bar2">' + buttons +
          '<button class="ct-share shareBtn" type="button" title="Share on X" data-id="' + id + '" data-name="' + name + '" data-url="' + url + '">𝕏 Share</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button.ct-react');
    if (!btn || btn.disabled || !OPEN) return;
    const eid = btn.dataset.id;
    const emoji = btn.dataset.emoji;
    if (!eid || !EMOJIS.includes(emoji)) return;
    const voted = readVoted();
    if (voted[eid + ':' + emoji]) return;

    btn.disabled = true;
    btn.classList.add('pop', 'mine');
    try {
      const r = await postJSON('/api/contest/vote', { entryId: eid, emoji });
      if (r && r.ok) {
        const e = ENTRIES.find((x) => x.id === eid);
        if (e) { e.votes = r.votes || e.votes; e.score = r.score | 0; }
        const card = btn.closest('.ct-card');
        const c = btn.querySelector('[data-count]');
        if (c) c.textContent = (r.votes && (r.votes[emoji] | 0)) || (+c.textContent + 1);
        const s = card && card.querySelector('[data-score]');
        if (s) s.textContent = (r.score | 0) + ' pts';
        voted[eid + ':' + emoji] = true; saveVoted(voted);
        renderLeaders(); renderStats();
      } else if (r && /already/.test(String(r.error))) {
        voted[eid + ':' + emoji] = true; saveVoted(voted);
        toast('You already gave this one ' + emoji);
      } else {
        throw new Error((r && r.error) || 'try again');
      }
    } catch (e) {
      btn.disabled = false;
      btn.classList.remove('mine');
      toast('That reaction did not go through: ' + (e.message || e));
    } finally {
      setTimeout(() => btn.classList.remove('pop'), 280);
    }
  });

  function bindSort() {
    document.querySelectorAll('.ct-sort button').forEach((b) => b.addEventListener('click', () => {
      SORT = b.dataset.sort;
      document.querySelectorAll('.ct-sort button').forEach((x) => x.classList.toggle('on', x === b));
      renderBoard();
    }));
  }

  function renderNone() {
    $('cStatus').className = 'ct-status done';
    $('cStatusText').textContent = 'Between rounds';
    $('cTitle').textContent = 'No contest running right now';
    $('cPrompt').textContent = 'The next round is announced in the Rebel Ants Discord. Warm up in the Builder.';
    $('cHint').hidden = true;
    document.querySelector('.ct-entriesHead').hidden = true;
    $('cCta').innerHTML = '<a class="ct-btn" href="/">Open the Builder</a>';
  }

  function jumpToHash() {
    if (!/^#e-/.test(location.hash)) return;
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); }
  }

  // ---------- helpers ----------
  function judgeSVG() {
    // Ant-Thony: a little ant in a judge's wig
    return '<svg viewBox="0 0 64 64"><circle cx="32" cy="34" r="20" fill="#1b1530"/>' +
      '<path d="M14 30c0-12 8-19 18-19s18 7 18 19c-3-3-5-3-7 0-2-3-5-3-7 0-2-3-6-3-8 0-2-3-5-3-7 0-2-3-5-3-7 0z" fill="#ece7ff"/>' +
      '<circle cx="25" cy="36" r="3.2" fill="#22d3ee"/><circle cx="39" cy="36" r="3.2" fill="#22d3ee"/>' +
      '<path d="M25 45q7 4 14 0" stroke="#ece7ff" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M22 13 15 4M42 13l7-9" stroke="#8b5cf6" stroke-width="2.4" stroke-linecap="round"/></svg>';
  }
  function score(v) { return Object.values(v || {}).reduce((a, b) => a + (b | 0), 0); }
  function when(ts) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
  }
  let toastT = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }
  async function getJSON(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
  async function postJSON(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    try { return JSON.parse(text); } catch (_) { throw new Error(text || ('HTTP ' + r.status)); }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
})();

/* ===== Share to X (mobile: share sheet with image + link; desktop: X compose in a new tab) ===== */
(function () {
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent || '');
  const contestURL = (id) => location.origin + '/contest#e-' + encodeURIComponent(id || '');

  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.shareBtn');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();

    const card = btn.closest('.ct-card');
    const id = btn.dataset.id || (card && card.dataset.id) || '';
    const name = btn.dataset.name || '';
    const caption = (card && card.querySelector('.ct-caption') && card.querySelector('.ct-caption').textContent.trim()) || '';
    const imgUrl = btn.dataset.url || '';
    const link = contestURL(id);
    const head = [name, caption].filter(Boolean).join(' — ') || 'Check this Rebel Ants overlay';

    if (isMobile && navigator.share) {
      (async () => {
        try {
          // iOS can drop `url` when files are attached, so keep the link in the text too
          const shareText = head + '\n\nVote here: ' + link;
          const data = { text: shareText, url: link };
          if (imgUrl && typeof navigator.canShare === 'function') {
            try {
              const resp = await fetch(imgUrl, { mode: 'cors', cache: 'no-store' });
              if (resp.ok) {
                const blob = await resp.blob();
                const file = new File([blob], 'rebel-ants.png', { type: blob.type || 'image/png' });
                if (navigator.canShare({ files: [file], text: shareText, url: link })) data.files = [file];
              }
            } catch (_) { /* share without the image */ }
          }
          await navigator.share(data);
        } catch (_) { openX(head, link, imgUrl, id); }
      })();
      return;
    }
    openX(head, link, imgUrl, id);
  }, { passive: false });

  function openX(head, link, imgUrl, id) {
    const imgPage = location.origin + '/contest/img.html?id=' + encodeURIComponent(id || '');
    const text = head + '\n\nVote here: ' + link + (imgUrl ? '\n\nImage: ' + imgPage : '');
    const u = new URL('https://twitter.com/intent/tweet');
    u.searchParams.set('text', text);
    window.open(u.toString(), '_blank', 'noopener');
  }
})();
