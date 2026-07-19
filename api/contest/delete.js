// /api/contest/delete.js
export const config = { runtime: 'nodejs' };

import { getActiveContestId, kvGet, kvSet, kvDel } from '../_lib/redisAdapter';

const ACTIVE_KEY = 'ra:contest:active';
const idsKey   = (id) => `ra:contest:${id}:ids`;
const entryKey = (id, eid) => `ra:contest:${id}:entry:${eid}`;

async function readJSON(req){
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { isAdminRequest } = require('../_lib/adminAuth');
  const hdr = String(req.headers['x-admin'] || '').trim();
  const legacyHdr = !!(process.env.RA_ADMIN_KEY && hdr && hdr === process.env.RA_ADMIN_KEY);
  if (!legacyHdr && !isAdminRequest(req)) {
    return res.status(401).json({ ok:false, error:'unauthorized' });
  }

  try{
    const { entryId } = await readJSON(req);
    if (!entryId) return res.status(400).json({ ok:false, error:'entryId required' });

    const contestId = await getActiveContestId();
    if (!contestId) return res.status(400).json({ ok:false, error:'no active contest' });

    // remove entry key
    await kvDel(entryKey(contestId, entryId));
    // remove from ids array
    let ids = await kvGet(idsKey(contestId)) || [];
    if (!Array.isArray(ids)) ids = [];
    ids = ids.filter(id => id !== entryId);
    await kvSet(idsKey(contestId), ids);

    return res.status(200).json({ ok:true });
  }catch(e){
    console.error('[delete]', e);
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
}
