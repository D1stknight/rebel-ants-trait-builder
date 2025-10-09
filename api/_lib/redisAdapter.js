// Upstash Redis via REST.
// Requires KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env.

const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;

async function raw(command, ...args) {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    throw new Error('KV_REST_API_URL or KV_REST_API_TOKEN missing');
  }
  const url = `${KV_REST_API_URL}/${command}/${args.map(a => encodeURIComponent(a)).join('/')}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
    cache: 'no-store'
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`[Upstash ${command}] ${r.status} ${text}`);
  }
  return r.json(); // { result: ... }
}

async function kvSet(key, value) {
  const v = (typeof value === 'string') ? value : JSON.stringify(value);
  return raw('SET', key, v);
}

async function kvGet(key) {
  const o = await raw('GET', key);
  const rawResult = o?.result ?? null;
  if (rawResult == null) return null;
  try { return JSON.parse(rawResult); } catch { return rawResult; }
}

async function del(key) { return raw('DEL', key); }

async function setEx(key, seconds, value) {
  const v = (typeof value === 'string') ? value : JSON.stringify(value);
  return raw('SETEX', key, String(seconds), v);
}

// Sets
async function sAdd(key, member) {
  const m = (typeof member === 'string') ? member : JSON.stringify(member);
  return raw('SADD', key, m);
}
async function sMembers(key) {
  const o = await raw('SMEMBERS', key);
  return Array.isArray(o?.result) ? o.result : [];
}

// Sorted sets (leaderboard)
async function zIncrBy(key, amount, member) {
  return raw('ZINCRBY', key, String(amount), member);
}
async function zRevRangeWithScores(key, start, stop) {
  // Upstash returns flat list ["member","score","member","score",...]
  const o = await raw('ZREVRANGE', key, String(start), String(stop), 'WITHSCORES');
  const arr = Array.isArray(o?.result) ? o.result : [];
  const out = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push({ member: arr[i], score: Number(arr[i+1]) });
  }
  return out;
}

module.exports = {
  raw, kvSet, kvGet, del, setEx,
  sAdd, sMembers,
  zIncrBy, zRevRangeWithScores
};
