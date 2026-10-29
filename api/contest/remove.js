// /api/contest/remove.js — admin only. Deletes a finished contest for good: its entries, votes count,
// winners list and Ant-Thony's verdict. The open contest can't be removed (close it first).
// Badges and points already given stay with the players. Used by the Rebel Console.
import { getActiveContestId, kvGet, kvDel } from '../_lib/redisAdapter';
import { isAdminRequest } from '../_lib/adminAuth';

export const config = { runtime: 'nodejs' };

async function readJSON(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }
  if (!isAdminRequest(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const { contestId } = await readJSON(req);
  const id = String(contestId || '').replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 80);
  if (!id) return res.status(400).json({ ok: false, error: 'contestId required' });
  if ((await getActiveContestId()) === id) return res.status(409).json({ ok: false, error: 'Close the contest first.' });

  const base = 'ra:contest:' + id;
  let ids = await kvGet(base + ':ids').catch(() => []);
  if (!Array.isArray(ids)) ids = [];
  for (const eid of ids) {
    await kvDel(base + ':entry:' + eid).catch(() => {});
    await kvDel(base + ':badged:' + eid).catch(() => {});
  }
  for (const k of [':ids', ':meta', ':winners', ':winners-confirmed', ':verdict', ':ended']) await kvDel(base + k).catch(() => {});
  const last = await kvGet('ra:contest:last').catch(() => null);
  if (last && String(last.id) === id) await kvDel('ra:contest:last').catch(() => {});
  return res.status(200).json({ ok: true, removed: id, entries: ids.length });
}
