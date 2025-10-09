// api/_lib/redisAdapter.js
// Lightweight adapter for Upstash Redis (REST). Works with several env var names.

const REST_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  process.env.KV_URL; // tolerate different names

const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  process.env.REDIS_REST_TOKEN ||
  process.env.KV_TOKEN;

if (!REST_URL || !REST_TOKEN) {
  console.warn(
    '[redisAdapter] Missing Upstash REST env vars. Expected one of ' +
      'UPSTASH_REDIS_REST_URL / TOKEN or KV_REST_API_URL / TOKEN.'
  );
}

// Core REST caller
async function r(cmd, ...args) {
  const path = [cmd, ...args.map(a => encodeURIComponent(String(a)))].join('/');
  const url = `${REST_URL}/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (data.error) throw new Error(`[redisAdapter] ${data.error}`);
  return data.result;
}

// Simple string get/set
async function get(key) {
  return r('GET', key);
}
async function set(key, value, ttlSec) {
  const val = typeof value === 'string' ? value : JSON.stringify(value);
  return ttlSec ? r('SET', key, val, 'EX', ttlSec) : r('SET', key, val);
}
async function del(key) {
  return r('DEL', key);
}

// Hash helpers (for emoji tallies, etc.)
async function hIncr(key, field, by = 1) {
  return r('HINCRBY', key, field, by);
}
async function hGetAll(key) {
  const res = await r('HGETALL', key);
  if (!res) return {};
  // Upstash may return array or object; normalize to object of numbers
  if (Array.isArray(res)) {
    const obj = {};
    for (let i = 0; i < res.length; i += 2) obj[res[i]] = Number(res[i + 1] ?? 0);
    return obj;
  }
  return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, Number(v)]));
}

// Sorted set helpers (leaderboard)
async function zIncr(key, by, member) {
  return r('ZINCRBY', key, by, member);
}
async function zTop(key, start = 0, stop = 49, withScores = true) {
  const res = await r('ZREVRANGE', key, start, stop, withScores ? 'WITHSCORES' : undefined);
  if (withScores && Array.isArray(res)) {
    const arr = [];
    for (let i = 0; i < res.length; i += 2) arr.push({ member: res[i], score: Number(res[i + 1]) });
    return arr;
  }
  return res || [];
}

// Sets (for entry ids)
async function sadd(key, ...members) {
  return r('SADD', key, ...members);
}
async function smembers(key) {
  const res = await r('SMEMBERS', key);
  return res || [];
}

// Misc
async function exists(key) {
  return Number(await r('EXISTS', key)) === 1;
}
async function expire(key, ttlSec) {
  return r('EXPIRE', key, ttlSec);
}

module.exports = {
  r,
  get,
  set,
  del,
  hIncr,
  hGetAll,
  zIncr,
  zTop,
  sadd,
  smembers,
  exists,
  expire,
};
