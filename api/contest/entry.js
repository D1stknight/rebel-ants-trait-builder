// /api/contest/entry.js
import { put } from '@vercel/blob';
import { getActiveContestId, saveEntry } from '../_lib/redisAdapter.js';

export const config = { runtime: 'nodejs' };

// helper: read raw body (works in Node runtime on Vercel)
function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJSON(req) {
  const buf = await readRaw(req);
  try { return JSON.parse(buf.toString() || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const contestId = await getActiveContestId();
    if (!contestId) {
      res.status(400).json({ ok: false, error: 'no active contest' });
      return;
    }

    // name + caption come via querystring (from the builder)
    const urlObj = new URL(req.url, 'https://x');
    const name = (urlObj.searchParams.get('name') || 'Anonymous').slice(0, 48);
    const caption = (urlObj.searchParams.get('caption') || '').slice(0, 140);

    const ct = String(req.headers['content-type'] || '');
    let imageUrl = '';

    if (ct.startsWith('image/')) {
      // Builder path: raw PNG/JPG upload -> Blob
      const bytes = await readRaw(req);
      if (!bytes || bytes.length < 64) {
        res.status(400).json({ ok: false, error: 'empty image' });
        return;
      }

      const id = crypto.randomUUID();
      const filename = `contests/${contestId}/${id}.png`;

      const stored = await put(filename, bytes, {
        access: 'public',
        contentType: 'image/png',
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      imageUrl = stored.url || (stored.pathname ? `https://blob.vercel-storage.com${stored.pathname}` : '');

      const payload = {
        id,
        name,
        caption,
        url: imageUrl,        // <-- keep
        imageUrl,             // <-- also store here
        ts: Date.now(),
        votes: {},
        score: 0,
      };

      await saveEntry(contestId, payload);
      res.status(200).json({ ok: true, id, url: imageUrl });
      return;
    }

    // Fallback path: JSON body with imageUrl
    const body = await readJSON(req);
    imageUrl = String(body.imageUrl || body.url || '').trim();
    if (!/^https?:\/\//i.test(imageUrl)) {
      res.status(400).json({ ok: false, error: 'imageUrl required' });
      return;
    }

    const id = crypto.randomUUID();
    const payload = {
      id,
      name,
      caption,
      url: imageUrl,
      imageUrl,
      ts: Date.now(),
      votes: {},
      score: 0,
    };

    await saveEntry(contestId, payload);
    res.status(200).json({ ok: true, id, url: imageUrl });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
