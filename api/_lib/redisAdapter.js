// api/_lib/redisAdapter.js  (CommonJS, Upstash KV only)
const KV_URL   = process.env.KV_REST_API_URL || process.env.KV_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.KV_REST_TOKEN;

if (!KV_URL || !KV_TOKEN) {
  console.warn('[redisAdapter] Missing KV_REST_API_URL / KV_REST_API_TOKEN env vars');
}

async function kvRequest(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${KV_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      ...(body ? { 'Content-Type': 'text/plain' } : {})
    },
    body
  });
  if (!r.ok) {
    const t = await r.text().catch(() => String(r.status));
    throw new Error(`KV ${method} ${path} -> ${r.status} ${t}`);
  }
  return r.json();
}

async function kvGet(key) {
  const { result } = await kvRequest(`/get/${encodeURIComponent(key)}`);
  if (result == null) return null;
  try { return JSON.parse(result); } catch { return result; }
}

async function kvSet(key, value) {
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  await kvRequest(`/set/${encodeURIComponent(key)}`, { method: 'POST', body: payload });
  return true;
}

async function kvDel(key) {
  await kvRequest(`/del/${encodeURIComponent(key)}`, { method: 'POST' });
  return true;
}

// ----- Contest helpers (KV only) -----
const ACTIVE_KEY = 'ra:contest:active';
const idsKey     = (id) => `ra:contest:${id}:ids`;
const metaKey    = (id) => `ra:contest:${id}:meta`;
const entryKey   = (id, eid) => `ra:contest:${id}:entry:${eid}`;

async function getActiveContestId() {
  const active = await kvGet(ACTIVE_KEY);
  return active && active.id ? String(active.id) : null;
}
async function getContestMeta(id) {
  return await kvGet(metaKey(id));
}
async function setActiveContest(meta) {
  // meta: { id, name, prompt, startTs, endTs }
  await kvSet(ACTIVE_KEY, { id: meta.id });
  await kvSet(metaKey(meta.id), meta);
  if (!(await kvGet(idsKey(meta.id)))) await kvSet(idsKey(meta.id), []);
  return meta.id;
}

async function saveEntry(contestId, entry) {
  // Normalize to ensure both url and imageUrl exist, and defaults are present.
  // entry coming in may have only `url`; we mirror it to `imageUrl`.
  const normalized = {
    id: entry.id,
    name: entry.name || 'Anonymous',
    caption: entry.caption || '',
    url: entry.url || entry.imageUrl || '',     // prefer url if provided
    imageUrl: entry.imageUrl || entry.url || '',// ensure imageUrl is set
    ts: entry.ts || Date.now(),
    votes: entry.votes || {},                   // emoji -> count
    score: typeof entry.score === 'number'
      ? entry.score
      : Object.values(entry.votes || {}).reduce((a, b) => a + (b | 0), 0)
  };

  await kvSet(entryKey(contestId, normalized.id), normalized);

  let ids = (await kvGet(idsKey(contestId))) || [];
  if (!Array.isArray(ids)) ids = [];
  if (!ids.includes(normalized.id)) {
    ids.push(normalized.id);
    await kvSet(idsKey(contestId), ids);
  }
  return normalized;
}

async function getEntry(contestId, eid) {
  return await kvGet(entryKey(contestId, eid));
}

async function listEntries(contestId, limit = 50) {
  let ids = (await kvGet(idsKey(contestId))) || [];
  if (!Array.isArray(ids)) ids = [];
  ids = ids.slice(-limit).reverse(); // newest first
  const out = [];
  for (const id of ids) {
    const e = await getEntry(contestId, id);
    if (!e) continue;
    e.votes = e.votes || {};
    e.score = Object.values(e.votes).reduce((a, b) => a + (b | 0), 0);
    out.push(e);
  }
  return out;
}

async function addVote(contestId, eid, emoji) {
  const e = await getEntry(contestId, eid);
  if (!e) throw new Error('entry not found');
  e.votes = e.votes || {};
  e.votes[emoji] = (e.votes[emoji] || 0) + 1;
  await kvSet(entryKey(contestId, eid), e);
  return e.votes;
}

module.exports = {
  // low-level (kept for compatibility)
  kvGet, kvSet, kvDel,
  // contest
  getActiveContestId, getContestMeta, setActiveContest,
  saveEntry, getEntry, listEntries, addVote
};
