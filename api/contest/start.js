// api/contest/start.js
export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  try {
    // IMPORTANT: in node runtime req.url is relative, so include a base host
    const u = new URL(req.url, `http://${req.headers.host}`);
    const admin = u.searchParams.get('admin') || '';

    if (admin !== process.env.RA_ADMIN_KEY) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    const now = Date.now();
    const endsAt = now + 7 * 24 * 60 * 60 * 1000; // temp: 7 days

    // TEMP: no DB here—just prove route returns promptly
    res.status(200).json({
      ok: true,
      contest: { id: 'test-' + Math.random().toString(36).slice(2, 8), endsAt }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
