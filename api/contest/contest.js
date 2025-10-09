// api/contest/contest.js
export const config = { runtime: 'edge' };

import { kvGet } from '../_lib/redisAdapter.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const contest = await kvGet('contest:active');
  return new Response(JSON.stringify({ contest }), {
    headers: { 'content-type': 'application/json' }
  });
}
