// api/contest/start.js
export const config = { runtime: 'edge' };

import { kvSet } from '../_lib/redisAdapter.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  // Simple admin check: either ?admin=KEY or header x-ra-admin: KEY
  const url = new URL(req.url);
  const keyFromQuery = url.searchParams.get('admin');
  const keyFromHeader = req.headers.get('x-ra-admin');
  const adminKey = keyFromQuery || keyFromHeader || '';

  if (!adminKey || adminKey !== (process.env.RA_ADMIN_KEY || '')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body = {};
  try { body = await req.json(); } catch (_) {}

  const now = Date.now();
  const durationDays = Number(body.durationDays || 7);
  const endsAt = Number(body.endsAt || (now + durationDays * 86400_000));

  const contest = {
    id: `c_${now}`,
    name: String(body.name || 'Weekly Overlay Contest'),
    prompt: String(body.prompt || ''),
    startsAt: now,
    endsAt,
    status: 'open'
  };

  await kvSet('contest:active', contest);
  return json({ ok: true, contest });
}
