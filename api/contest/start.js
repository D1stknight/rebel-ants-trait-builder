// api/contest/start.js
export const config = { runtime: 'nodejs' };

import { startContest } from '../_lib/redisAdapter.js';

export default async function handler(req) {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(req.url);
    const admin = url.searchParams.get('admin') || '';
    const wanted = process.env.RA_ADMIN_KEY || '';

    if (!wanted || admin !== wanted) {
      return new Response(
        JSON.stringify({ ok: false, error: 'unauthorized' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const name = (body.name || 'Weekly Contest').toString();
    const prompt = (body.prompt || '').toString();
    const durationDays = Number(body.durationDays || 7);

    const { id, endsAt } = await startContest({ name, prompt, durationDays });

    return new Response(
      JSON.stringify({ ok: true, contest: { id, name, prompt, endsAt } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (err) {
    console.error('start contest error', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
