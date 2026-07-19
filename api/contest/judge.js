// /api/contest/judge.js
// Ant-Thony judges the active contest: reviews every entry (vision),
// roasts each one, scores it, and nominates finalists. The human admin
// confirms actual winners - Ant-Thony is the color commentator, not the
// final word. Admin-only. Optional body {post:true} publishes his verdict
// to Discord through the real bot (economy-core bridge).

import { getActiveContestId, getContestMeta, listEntries } from '../_lib/redisAdapter';
import { isAdminRequest } from '../_lib/adminAuth';

const PERSONA =
  'You are Ant-Thony, the wise-cracking ant mascot of the Rebel Ants NFT ' +
  'community, serving as celebrity judge of an overlay-art contest. Witty, ' +
  'cheeky, playful roasts - never mean-spirited, PG-13. Ant/bug flavor when ' +
  'it lands.';

function readJSON(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }
  if (!isAdminRequest(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ ok: false, error: 'not_configured' });

  const body = await readJSON(req);

  try {
    const id = await getActiveContestId();
    if (!id) return res.status(200).json({ ok: false, error: 'no_active_contest' });
    const meta = await getContestMeta(id);
    const all = (await listEntries(id, 50)) || [];
    const entries = all.filter(e => e && (e.url || e.imageUrl)).slice(0, 16);
    if (!entries.length) return res.status(200).json({ ok: false, error: 'no_entries' });

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
    if (!r.ok || !j) return res.status(200).json({ ok: false, error: 'upstream ' + r.status });
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    let verdict;
    try { verdict = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch { return res.status(200).json({ ok: false, error: 'bad_verdict', raw: text.slice(0, 300) }); }

    const reviews = (verdict.reviews || []).map(v => {
      const e = entries[(v.entry || 0) - 1] || {};
      return { entry: v.entry, name: e.name || 'Anonymous', url: e.url || e.imageUrl || '', roast: String(v.roast || ''), score: Number(v.score) || 0 };
    });
    const finalists = (verdict.finalists || []).map(n => {
      const e = entries[(n || 0) - 1] || {};
      return { entry: n, name: e.name || 'Anonymous' };
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

    return res.status(200).json({ ok: true, contest: { id, name: (meta && meta.name) || '' }, count: entries.length, truncated: all.length > entries.length, reviews, finalists, closing, posted });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
}
