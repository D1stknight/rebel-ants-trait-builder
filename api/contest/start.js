// api/contest/start.js
export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ✅ TEMP: just prove the function is reachable and returns quickly.
  try {
    const { searchParams } = new URL(req.url);
    const admin = searchParams.get('admin') || '';
    if (admin !== process.env.RA_ADMIN_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      });
    }

    const now = Date.now();
    const endsAt = now + 7 * 24 * 60 * 60 * 1000;

    return new Response(JSON.stringify({
      ok: true,
      contest: { id: 'test-' + Math.random().toString(36).slice(2, 8), endsAt }
    }), { status: 200, headers: { 'content-type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
