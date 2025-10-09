// api/_lib/redisAdapter.js
import { Redis } from '@upstash/redis';

let _redis;
function redis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN
    });
  }
  return _redis;
}

// gets just the active contest id (or null)
export async function getActiveContestId() {
  return await redis().get('contest:active');
}

// starts a new contest and records meta
export async function startContest({ name, prompt, durationDays }) {
  const now = Date.now();
  const days = Number.isFinite(+durationDays) ? +durationDays : 7;
  const endsAt = now + days * 86400 * 1000;
  const id = `c:${now}`;

  const r = redis();

  // store active id
  await r.set('contest:active', id);

  // store contest meta in a hash
  await r.hset(`contest:${id}`, {
    id,
    name: String(name || 'Contest'),
    prompt: String(prompt || ''),
    startedAt: String(now),
    endsAt: String(endsAt)
  });

  return { id, endsAt };
}

// saves a single entry (and indexes it)
export async function saveEntry({ contestId, id, name, url, caption }) {
  const r = redis();
  const key = `contest:${contestId}:entry:${id}`;

  // all values coerced to strings so Upstash never sees null/undefined
  await r.hset(key, {
    id,
    name: String(name || 'Anonymous'),
    url: String(url || ''),
    caption: String(caption || ''),
    votes: '0',
    createdAt: String(Date.now())
  });

  // add to a set for listing
  await r.sadd(`contest:${contestId}:entries`, key);

  return key;
}
