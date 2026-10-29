// api/contest/confirm-winners.js — Miguel confirms 1st/2nd/3rd (admin only).
// POST { contestId?, places: [{ entryId, place: 1|2|3 }] }
//   -> writes ra:contest:<id>:winners (the array /api/contest/winners reads),
//      awards "contest.podium" to places 1-3 and counts a win for place 1.
// Idempotent per contest: the first confirm locks the winners
// (ra:contest:<id>:winners-confirmed); sending the same places again only
// retries badges that did not go through (per-entry marker), different
// places are refused. Badges are best-effort: the winners are saved anyway.
const { kvGet, kvSet, kvDel, kvSetNX, getActiveContestId, getEntry } = require('../_lib/redisAdapter');
const { isAdminRequest } = require('../_lib/adminAuth');
const { badgeEvent, awardedOf } = require('../_lib/rebel');

function readJSON(req){
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 64 * 1024) b = ''; });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const sig = (places) => places.map(p => p.place + ':' + p.entryId).sort().join(',');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }

  // New admin route: never open, even while the legacy routes still are.
  const namesSet = !!String(process.env.RA_ADMIN_NAMES || '').trim();
  const legacyKey = process.env.RA_ADMIN_KEY || '';
  if (!namesSet && !legacyKey) return res.status(503).json({ ok: false, error: 'admin_not_configured' });
  const hdr = String(req.headers['x-admin'] || '').trim();
  const legacyHdr = !!(legacyKey && hdr && hdr === legacyKey);
  if (!legacyHdr && !isAdminRequest(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  try {
    const body = await readJSON(req);
    const contestId = String(body.contestId || '').trim() || await getActiveContestId();
    if (!contestId || !/^[A-Za-z0-9_-]{1,64}$/.test(contestId)) return res.status(400).json({ ok: false, error: 'contest_required' });

    // validate places: 1..3, each place once, each entry once
    const raw = Array.isArray(body.places) ? body.places : [];
    const places = [];
    const usedPlace = new Set(), usedEntry = new Set();
    for (const p of raw) {
      const place = parseInt(p && p.place, 10);
      const entryId = String((p && p.entryId) || '').trim();
      if (![1, 2, 3].includes(place) || !entryId) continue;
      if (usedPlace.has(place) || usedEntry.has(entryId)) return res.status(400).json({ ok: false, error: 'duplicate_place_or_entry' });
      usedPlace.add(place); usedEntry.add(entryId);
      places.push({ place, entryId });
    }
    if (!places.length) return res.status(400).json({ ok: false, error: 'places_required' });
    places.sort((a, b) => a.place - b.place);

    const entries = {};
    for (const p of places) {
      const e = await getEntry(contestId, p.entryId);
      if (!e) return res.status(404).json({ ok: false, error: 'entry_not_found', entryId: p.entryId });
      entries[p.entryId] = e;
    }

    // lock (first confirm wins); same places again = retry missing badges only
    const lockKey = 'ra:contest:' + contestId + ':winners-confirmed';
    let lock = await kvGet(lockKey);
    let retry = false;
    if (!lock) {
      const got = await kvSetNX(lockKey, { places, ts: Date.now() });
      if (!got) lock = await kvGet(lockKey);
    }
    if (lock) {
      if (!Array.isArray(lock.places) || sig(lock.places) !== sig(places)) {
        return res.status(409).json({ ok: false, error: 'already_confirmed', places: lock.places || [] });
      }
      retry = true;
    }

    const winners = places.map(p => {
      const e = entries[p.entryId];
      const score = Object.values(e.votes || {}).reduce((a, b) => a + (b | 0), 0);
      return { place: p.place, entryId: p.entryId, id: p.entryId, name: e.name || 'Anonymous', caption: e.caption || '', url: e.url || e.imageUrl || '', imageUrl: e.imageUrl || e.url || '', score };
    });
    await kvSet('ra:contest:' + contestId + ':winners', winners); // same places on a retry

    // badges: podium for 1-3, a win for 1st (once per entry, marker-guarded)
    const badges = [];
    for (const p of places) {
      const e = entries[p.entryId];
      if (!e.userId) { badges.push({ place: p.place, entryId: p.entryId, status: 'not_signed_in' }); continue; }
      const mark = 'ra:contest:' + contestId + ':badged:' + p.entryId;
      let mine = false;
      try { mine = await kvSetNX(mark, Date.now()); } catch (_) {}
      if (!mine) { badges.push({ place: p.place, entryId: p.entryId, status: 'already_awarded' }); continue; }
      const out = await badgeEvent(e.userId, {
        award: ['contest.podium'],
        counters: p.place === 1 ? [{ key: 'wins', op: 'add' }] : [],
        context: { contestId, place: p.place }
      });
      if (!out) { try { await kvDel(mark); } catch (_) {} badges.push({ place: p.place, entryId: p.entryId, status: 'economy_unavailable' }); continue; }
      badges.push({ place: p.place, entryId: p.entryId, status: 'awarded', awarded: awardedOf(out) });
    }

    // the Rebel Console gives points prizes, so admins get the winners' Rebel account ids (not stored)
    const withAccounts = winners.map(w => ({ ...w, userId: (entries[w.entryId] && entries[w.entryId].userId) || null }));
    return res.status(200).json({ ok: true, contestId, winners: withAccounts, alreadyConfirmed: retry, badges });
  } catch (e) {
    console.error('[confirm-winners]', e);
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
