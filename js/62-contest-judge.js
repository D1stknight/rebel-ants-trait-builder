// 62-contest-judge.js
// Admin-only (admin URL + admin session): Ant-Thony judges the active
// contest - per-entry roasts + scores, finalist nominations, optional
// post of the verdict to Discord through the real bot. The human admin
// still confirms winners.
;(() => {
  'use strict';
  if (window.__RA_CONTEST_JUDGE__) return;
  window.__RA_CONTEST_JUDGE__ = true;
  const isAdminUrl = /[?&]admin=1\b/.test(location.search);
  if (!isAdminUrl) return;

  function allowed(){ return !!(window.raSession && window.raSession.isAdmin); }

  function injectUI(){
    if (document.getElementById('raJudgeCard')) return;
    const anchor = document.getElementById('raAiOverlayBox');
    if (!anchor) { setTimeout(injectUI, 400); return; }
    const box = document.createElement('section');
    box.id = 'raJudgeCard';
    box.className = anchor.className || '';
    box.style.cssText = anchor.getAttribute('style') || '';
    box.innerHTML = [
      '<div style="font-weight:700;font-size:16px;margin-bottom:8px;">\u{1F3C6} Ant-thony \u2014 Contest Judge <span style="opacity:.55;font-weight:400;font-size:12px;">(admin)</span></div>',
      '<div style="display:flex;gap:6px;">',
      '<button id="raJudgeRun" class="btn" style="flex:1;font-size:12px;">\u{1F41C} Judge the active contest</button>',
      '<button id="raJudgePost" class="btn" style="flex:1;font-size:12px;">\u{1F4E4} Judge + post verdict</button>',
      '</div>',
      '<div id="raJudgeOut" style="display:none;margin-top:10px;font-size:13px;line-height:1.4;"></div>'
    ].join('');
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
    box.style.flex = '0 0 auto';

    async function run(post){
      const out = document.getElementById('raJudgeOut');
      const b1 = document.getElementById('raJudgeRun'), b2 = document.getElementById('raJudgePost');
      b1.disabled = b2.disabled = true;
      out.style.display = '';
      out.textContent = 'Ant-thony is squinting at every entry (this can take a minute)...';
      try {
        const r = await fetch('/api/contest/judge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ post: !!post }) });
        const j = await r.json().catch(() => null);
        if (!j || !j.ok) {
          const msgs = {
            no_active_contest: 'No contest is running. Start one, then bring me the entries.',
            no_entries: 'A contest with zero entries? My mandibles are bored. Get the colony posting.',
            unauthorized: 'Admins only in the judging booth.'
          };
          out.textContent = 'Ant-thony: ' + (msgs[(j && j.error) || ''] || ('Judging hiccup: ' + ((j && j.error) || 'unknown')));
          return;
        }
        const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
        const finalistSet = new Set((j.finalists || []).map(f => f.entry));
        const rows = (j.reviews || []).map(v => {
          const star = finalistSet.has(v.entry) ? ' \u2B50 <b>FINALIST</b>' : '';
          return '<div style="margin:6px 0;padding:6px 8px;border:1px solid rgba(255,255,255,.1);border-radius:8px;">' +
            '<b>' + esc(v.name) + '</b> \u2014 ' + v.score + '/10' + star +
            '<div style="opacity:.85;margin-top:2px;">' + esc(v.roast) + '</div></div>';
        }).join('');
        out.innerHTML =
          '<div style="font-weight:600;">' + esc(j.contest.name || 'Contest') + ' \u2014 ' + j.count + ' entries judged' + (j.truncated ? ' (first 16)' : '') + '</div>' +
          rows +
          (j.closing ? '<div style="margin-top:6px;font-style:italic;opacity:.9;">\u201C' + esc(j.closing) + '\u201D \u2014 Ant-thony</div>' : '') +
          (post ? ('<div style="margin-top:6px;font-weight:600;">' + (j.posted ? 'Verdict posted to Discord \u2705' : 'Discord post failed - check the bridge env') + '</div>') : '') +
          '<div style="margin-top:6px;opacity:.7;">Ant-thony nominates - you confirm the actual winners.</div>';
      } finally {
        b1.disabled = b2.disabled = false;
      }
    }
    document.getElementById('raJudgeRun').addEventListener('click', () => run(false));
    document.getElementById('raJudgePost').addEventListener('click', () => run(true));
  }

  function sync(){
    const card = document.getElementById('raJudgeCard');
    if (allowed()) { if (!card) injectUI(); else card.style.display = ''; }
    else if (card) card.style.display = 'none';
  }
  document.addEventListener('ra-auth-change', sync);
  if (allowed()) injectUI();
  let tries = 0;
  const t = setInterval(() => { if (allowed()) { injectUI(); clearInterval(t); } else if (++tries > 40) clearInterval(t); }, 500);
})();
