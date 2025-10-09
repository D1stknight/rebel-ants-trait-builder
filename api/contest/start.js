// api/contest/start.js
import { startContest } from '../_lib/redisAdapter';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  try {
    // need a base when parsing req.url in node runtime
    const u = new URL(req.url, `http://${req.headers.host}`);
    const admin = u.searchParams.get('admin') || '';

    if (admin !== process.env.RA_ADMIN_KEY) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    // read JSON body safely
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');

    const meta = await startContest({
      name: body.name || 'Contest',
      prompt: body.prompt || '',
      durationDays: body.durationDays || 7
    });

    res.status(200).json({ ok: true, contest: meta });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
