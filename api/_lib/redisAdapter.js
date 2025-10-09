// api/_lib/redisAdapter.js
// Uses Upstash KV REST API via KV_REST_API_URL + KV_REST_API_TOKEN

const BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

async function kv(cmd, ...args) {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([cmd, ...args])
  });
  const data = await r.json();
  if (data && data.error) throw new Error(data.error);
  return data ? data.result : null;
}

const j = (v) => JSON.stringify(v);
const p = (v) => { try { return JSON.parse(v); } catch { return null; } };

export async function startContest({ name, prompt, durationDays }) {
  const id = 'c' + Date.now().toString(36);
  const now = Date.now();
  const endsAt = now + (Number(durationDays) || 7) * 86400_000; // days→ms

  const meta = { id, name, prompt, startedAt: now, endsAt };

  // Save meta and set the "active" pointer with TTL so it auto-clears
  await kv('SET', `contest:${id}:meta`, j(meta));
  await kv('SET', 'contest:active', j({ id, endsAt }));
  await kv('EXPIRE', 'contest:active', Math.max(1, Math.floor((endsAt - now) / 1000)));

  return meta;
}

export async function getActiveContestId() {
  const raw = await kv('GET', 'contest:active');
  if (!raw) return null;
  const { id, endsAt } = p(raw) || {};
  if (!id || !endsAt || Date.now() > endsAt) {
    await kv('DEL', 'contest:active');
    return null;
  }
  return id;
}

export async function saveEntry(contestId, { name, caption, url }) {
  const entry = {
    id: 'e' + Math.random().toString(36).slice(2),
    ts: Date.now(),
    name, caption, url, votes: 0
  };
  // keep a map for quick lookup, and a list for ordering
  await kv('SET', `contest:${contestId}:entry:${entry.id}`, j(entry));
  await kv('LPUSH', `contest:${contestId}:entries`, j(entry));
  return entry;
}

export async function listEntries(contestId, limit = 50) {
  const raws = await kv('LRANGE', `contest:${contestId}:entries`, 0, limit - 1) || [];
  return raws.map(p).filter(Boolean);
}
