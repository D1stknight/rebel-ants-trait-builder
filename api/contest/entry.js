// api/contest/entry.js
import { put } from '@vercel/blob';
import { getActiveContestId, saveEntry } from '../_lib/redisAdapter';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  try {
    const contestId = await getActiveContestId();
    if (!contestId) {
      res.status(400).json({ ok: false, error: 'no active contest' });
      return;
    }

    const u = new URL(req.url, `http://${req.headers.host}`);
    const name = (u.searchParams.get('name') || 'Anonymous').slice(0, 48);
    const caption = (u.searchParams.get('caption') || '').slice(0, 140);

    // read raw bytes once
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const bytes = Buffer.concat(chunks);
    if (!bytes.length) {
      res.status(400).json({ ok: false, error: 'no image bytes' });
      return;
    }

    // upload image to Blob
    const id = Math.random().toString(36).slice(2);
    const filename = `contests/${contestId}/${id}.png`;
    const { url } = await put(filename, bytes, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: 'image/png'
    });

    // save entry meta in KV
    const entry = await saveEntry(contestId, { name, caption, url });

    res.status(200).json({ ok: true, contestId, entry });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
