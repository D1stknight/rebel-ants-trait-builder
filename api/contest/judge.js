// /api/contest/judge.js
// Ant-Thony judges the active contest (admin only). The work is in api/_lib/judge.js, shared with the
// end-of-contest cron. Body {post:true} posts the verdict to Discord, gives finalists their badge and
// saves the verdict for the public contest page. The human admin confirms the actual winners.
import { isAdminRequest } from '../_lib/adminAuth';
import { runJudge } from '../_lib/judge';

function readJSON(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }
  if (!isAdminRequest(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const body = await readJSON(req);
  return res.status(200).json(await runJudge(body));
}
