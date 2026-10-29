// api/contest/close.js
import { getActiveContestId, kvDel, kvSet } from '../_lib/redisAdapter';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { isAdminRequest } = require('../_lib/adminAuth');
    const hdr = String(req.headers['x-admin'] || '').trim();
    const legacyHdr = !!(process.env.ALLOW_TYPED_ADMIN_KEY === 'true' && process.env.RA_ADMIN_KEY && hdr && hdr === process.env.RA_ADMIN_KEY);
    if (!legacyHdr && !isAdminRequest(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const id = await getActiveContestId();
    if (!id) {
      return res.status(200).json({ ok: true, closed: false, reason: 'no active contest' });
    }

    // mark no active contest; keep it as the last contest so its page shows the results
    await kvSet('ra:contest:last', { id });
    await kvDel('ra:contest:active');

    return res.status(200).json({ ok: true, closed: true, id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
