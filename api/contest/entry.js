// api/contest/entry.js
export const config = { runtime: 'nodejs' };

import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { getActiveContestId, saveEntry } from '../_lib/redisAdapter';

// Helpers to read request bodies in Node runtime
function readJSON(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.setEncoding('utf8');
    req.on('data', (ch) => (buf += ch));
    req.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function readBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (ch) => chunks.push(ch));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const contestId = await getActiveContestId();
    if (!contestId) return res.status(400).json({ ok: false, error: 'no active contest' });

    const ct = (req.headers['content-type'] || '').toLowerCase();
    let name = 'Anonymous';
    let caption = '';
    let url = '';

    if (ct.includes('application/json')) {
      // From the /contest page (name, caption, imageUrl)
      const body = await readJSON(req);
      name = String(body.name || 'Anonymous').slice(0, 48);
      caption = String(body.caption || '').slice(0, 140);
      url = String(body.imageUrl || body.url || '').trim();
      if (!url) return res.status(400).json({ ok: false, error: 'missing imageUrl/url' });
    } else {
      // From the Builder (raw PNG bytes)
      const bytes = await readBuffer(req);
      if (!bytes || bytes.length < 32) {
        return res.status(400).json({ ok: false, error: 'no image bytes' });
      }

      // Optional: name/caption via querystring (?name=&caption=)
      const qs = new URL(req.url, 'http://local').searchParams;
      name = String(qs.get('name') || 'Anonymous').slice(0, 48);
      caption = String(qs.get('caption') || '').slice(0, 140);

      const id = crypto.randomUUID();
      const filename = `contests/${contestId}/${id}.png`;

      const putRes = await put(filename, bytes, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: 'image/png',
        addRandomSuffix: false,
      });

      url = putRes.url; // publicly accessible URL
    }

    // Save the entry – keep BOTH keys to be future‑proof
    const entryId = await saveEntry(contestId, {
      name,
      caption,
      url,            // <— primary
      imageUrl: url,  // <— also set for older/newer UIs
    });

    return res.status(200).json({ ok: true, id: entryId, url });
  } catch (e) {
    console.error('[entry]', e);
    return res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
