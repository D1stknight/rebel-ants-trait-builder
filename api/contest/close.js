// api/contest/close.js
import { getActiveContestId, kvDel } from '../_lib/redisAdapter';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const provided = String(req.query.admin || req.headers['x-admin'] || '');
    const secret   = String(process.env.RA_ADMIN_KEY || '');

    if (!secret || !provided || provided !== secret) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const id = await getActiveContestId();
    if (!id) {
      return res.status(200).json({ ok: true, closed: false, reason: 'no active contest' });
    }

    // mark no active contest
    await kvDel('ra:contest:active');

    return res.status(200).json({ ok: true, closed: true, id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
