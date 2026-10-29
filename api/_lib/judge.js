// api/_lib/judge.js — Ant-Thony judges a contest (shared by /api/contest/judge and the end-of-contest cron).
// Reviews up to 16 entries (vision), roasts + scores each, nominates up to 3 finalists. With post:
// posts the verdict to Discord through the economy, gives finalists the "Ant-Thony's Pick" badge,
// and saves the verdict so the public contest page can show it under each entry.
const { getActiveContestId, getContestMeta, listEntries, kvSet, kvGet } = require('./redisAdapter');
const { badgeEvent, awardedOf } = require('./rebel');

const PERSONA =
  'You are Ant-Thony, the wise-cracking ant mascot of the Rebel Ants NFT ' +
  'community, serving as celebrity judge of an overlay-art contest. Witty, ' +
  'cheeky, playful roasts - never mean-spirited, PG-13. Ant/bug flavor when ' +
  'it lands.';


const verdictKey = (id) => 'ra:contest:' + id + ':verdict';

async function readVerdict(id){ try { return await kvGet(verdictKey(id)); } catch (_) { return null; } }

/** -> { ok, ... } exactly like the /api/contest/judge response. contestId defaults to the active contest. */
async function runJudge(body = {}, opts = {}){
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: 'not_configured' };


  try {
    const id = (opts && opts.contestId) || await getActiveContestId();
    if (!id) return { ok: false, error: 'no_active_contest' };
    const meta = await getContestMeta(id);
    const all = (await listEntries(id, 50)) || [];
    const entries = all.filter(e => e && (e.url || e.imageUrl)).slice(0, 16);
    if (!entries.length) return { ok: false, error: 'no_entries' };

    const content = [];
    entries.forEach((e, i) => {
      content.push({ type: 'text', text: 'Entry ' + (i + 1) + ' by "' + (e.name || 'Anonymous') + '"' + (e.caption ? (' - caption: "' + String(e.caption).slice(0, 120) + '"') : '') + ':' });
      content.push({ type: 'image', source: { type: 'url', url: e.url || e.imageUrl } });
    });
    content.push({
      type: 'text',
      text: 'Contest: "' + ((meta && meta.name) || 'Overlay Contest') + '". Judge all ' + entries.length + ' entries. ' +
        'For EACH: one playful roast-or-hype sentence about something SPECIFIC you can see, and a score 1-10 (be generous but honest; creativity + effort + drip). ' +
        'Then pick up to 3 finalists (best overall). ' +
        'Reply ONLY with JSON: {"reviews":[{"entry":1,"roast":"...","score":7}],"finalists":[2,5],"closing":"one closing line as the judge"} No markdown.'
    });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1800, system: PERSONA, messages: [{ role: 'user', content }] })
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return { ok: false, error: 'upstream ' + r.status };
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    let verdict;
    try { verdict = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch { return { ok: false, error: 'bad_verdict', raw: text.slice(0, 300) }; }

    const reviews = (verdict.reviews || []).map(v => {
      const e = entries[(v.entry || 0) - 1] || {};
      return { entry: v.entry, name: e.name || 'Anonymous', url: e.url || e.imageUrl || '', roast: String(v.roast || ''), score: Number(v.score) || 0 };
    });
    const finalists = (verdict.finalists || []).slice(0, 3).map(n => {
      const e = entries[(n || 0) - 1] || {};
      return { entry: n, name: e.name || 'Anonymous', entryId: e.id || null, userId: e.userId || null };
    });
    const closing = String(verdict.closing || '');

    let posted = false;
    if (body.post) {
      const ecoBase = (process.env.ECONOMY_BASE_URL || '').replace(/\/$/, '');
      const svcKey = process.env.SERVICE_API_KEY;
      const channelId = process.env.DISCORD_SHARE_CHANNEL_ID;
      if (ecoBase && svcKey && channelId) {
        const lines = ['\u{1F3C6} **' + ((meta && meta.name) || 'Overlay Contest') + '** - the judge has spoken \u{1F41C}', ''];
        reviews.forEach(v => lines.push('**' + v.name + '** (' + v.score + '/10): ' + v.roast));
        lines.push('');
        lines.push('**Finalists:** ' + (finalists.map(f => f.name).join(', ') || 'to be announced'));
        if (closing) lines.push('_' + closing + '_');
        const msg = lines.join('\n').slice(0, 1900);
        try {
          const pr = await fetch(ecoBase + '/api/internal/anthony-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + svcKey },
            body: JSON.stringify({ channelId, content: msg })
          });
          const pj = await pr.json().catch(() => null);
          posted = !!(pr.ok && pj && pj.ok);
        } catch (_) {}
      }
    }

    // "Ant-Thony's Pick" badge for each finalist - only for the real verdict
    // (Judge + post), not the private preview run. Best-effort; signed-in
    // entries only. Awarding twice is harmless (a badge is earned once).
    const finalistBadges = [];
    if (body.post) {
      const seen = new Set();
      for (const f of finalists) {
        if (!f.userId || seen.has(f.userId)) continue;
        seen.add(f.userId);
        let awarded = [];
        try { awarded = awardedOf(await badgeEvent(f.userId, { award: ['contest.finalist'], context: { contestId: id } })); } catch (_) {}
        finalistBadges.push({ entryId: f.entryId, name: f.name, awarded });
      }
    }


    const publicFinalists = finalists.map(({ userId, ...f }) => f);
    const result = { ok: true, contest: { id, name: (meta && meta.name) || '' }, count: entries.length, truncated: all.length > entries.length, reviews, finalists: publicFinalists, closing, posted, finalistBadges };
    if (body.post) {
      const byEntry = {};
      reviews.forEach(v => { const e = entries[(v.entry || 0) - 1]; if (e && e.id) byEntry[e.id] = { roast: v.roast, score: v.score }; });
      try { await kvSet(verdictKey(id), { ts: Date.now(), closing, finalists: publicFinalists, reviews: byEntry, posted }); } catch (_) {}
    }
    return result;
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = { runJudge, readVerdict, verdictKey };
