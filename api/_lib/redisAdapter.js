// api/_lib/redisAdapter.js
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

export async function getActiveContestId() {
  return await redis.get('contest:active');
}

export async function setActiveContest(id) {
  await redis.set('contest:active', id);
}

export async function createContest({ id, name, prompt, endsAt }) {
  await redis.hset(`contest:${id}`, {
    id, name, prompt, endsAt, status: 'open', createdAt: Date.now()
  });
}

export async function saveEntry({ contestId, id, name, url, caption }) {
  // Store the entry
  await redis.hset(`contest:${contestId}:entry:${id}`, {
    id, name, url, caption: caption || '', votes: 0, createdAt: Date.now()
  });
  // Track the id in a set for easy listing
  await redis.sadd(`contest:${contestId}:entries`, id);
}
