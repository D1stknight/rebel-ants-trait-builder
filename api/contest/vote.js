// /api/contest/vote.js
export const config = { runtime: 'nodejs' };

import crypto from 'crypto';
import { getActiveContestId, getEntry, saveEntry, kvSetNX } from '../_lib/redisAdapter';

async function readJSON(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const contestId = await getActiveContestId();
    if (!contestId) return res.status(400).json({ ok: false, error: 'no active contest' });

    const { entryId, emoji } = await readJSON(req);
    if (!entryId || !emoji) return res.status(400).json({ ok: false, error: 'entryId and emoji required' });

    const entry = await getEntry(contestId, entryId);
    if (!entry) return res.status(404).json({ ok: false, error: 'entry not found' });

    // Build a per-user fingerprint (IP + UA) to cap 1 vote per emoji
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const ua = String(req.headers['user-agent'] || '');
    const voter = crypto.createHash('sha1').update(`${ip}|${ua}`).digest('hex');

    // NX gate: only accept the first vote for this user+emoji+entry
    const voteKey = `ra:contest:${contestId}:voted:${entryId}:${encodeURIComponent(emoji)}:${voter}`;
    const first = await kvSetNX(voteKey, 1);
    if (!first) {
      entry.votes = entry.votes || {};
      entry.score = Object.values(entry.votes).reduce((a, b) => a + (b | 0), 0);
      return res.status(200).json({ ok: true, duplicated: true, votes: entry.votes, score: entry.score });
    }

    // Count the vote
    entry.votes = entry.votes || {};
    entry.votes[emoji] = (entry.votes[emoji] || 0) + 1;
    entry.score = Object.values(entry.votes).reduce((a, b) => a + (b | 0), 0);

    await saveEntry(contestId, entry);
    res.status(200).json({ ok: true, votes: entry.votes, score: entry.score });
  } catch (e) {
    console.error('[vote]', e);
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
