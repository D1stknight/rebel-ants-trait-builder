// api/contest/start.js
export const config = { runtime: 'edge' };

import { createContest, setActiveContest } from '../_lib/redisAdapter';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const adminHeader = req.headers.get('x-admin-key');
  const adminQuery  = url.searchParams.get('admin');
  const adminKey = adminHeader || adminQuery || '';

  if (adminKey !== (process.env.RA_ADMIN_KEY || '')) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' }
    });
  }

  const { name = 'Rebel Ants Weekly Contest', prompt = '', durationDays = 7 } = await req.json();
  const now = Date.now();
  const endsAt = now + Number(durationDays) * 864e5;
  const id = crypto.randomUUID();

  await createContest({ id, name, prompt, endsAt });
  await setActiveContest(id);

  return new Response(JSON.stringify({ ok: true, contest: { id, name, prompt, endsAt } }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}
