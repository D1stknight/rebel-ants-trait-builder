// /api/contest/entry.js
export const config = { runtime: 'nodejs' };

import crypto from 'crypto';
import { put } from '@vercel/blob';
import { getActiveContestId, saveEntry } from '../_lib/redisAdapter';

async function readJSON(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return null; }
}

async function readBuffer(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const contestId = await getActiveContestId();
    if (!contestId) {
      res.status(400).json({ ok: false, error: 'no active contest' });
      return;
    }

    const ctype = String(req.headers['content-type'] || '').toLowerCase();

    let name = 'Anonymous';
    let caption = '';
    let url = null;

    if (ctype.startsWith('application/json')) {
      // JSON body: { name, caption, imageUrl? | url? | imageDataUrl? }
      const body = await readJSON(req) || {};
      name = (body.name || 'Anonymous').slice(0, 48);
      caption = (body.caption || '').slice(0, 140);

      if (body.imageUrl) url = body.imageUrl;
      else if (body.url) url = body.url;
      else if (body.imageDataUrl && /^data:image\/(png|jpeg);base64,/i.test(body.imageDataUrl)) {
        const m = body.imageDataUrl.match(/^data:(image\/(png|jpeg));base64,(.+)$/i);
        if (m) {
          const mime = m[1];
          const ext = /jpeg/i.test(mime) ? 'jpg' : 'png';
          const bytes = Buffer.from(m[3], 'base64');
          const filename = `contests/${contestId}/${crypto.randomUUID()}.${ext}`;
          const putRes = await put(filename, bytes, {
            access: 'public',
            contentType: mime,
            addRandomSuffix: false
          });
          url = putRes.url || (putRes.pathname ? `https://blob.vercel-storage.com${putRes.pathname}` : null);
        }
      }
    } else if (ctype.startsWith('image/')) {
      // Raw PNG/JPG bytes from the builder
      const u = new URL(req.url, 'http://x');
      name    = (u.searchParams.get('name') || 'Anonymous').slice(0, 48);
      caption = (u.searchParams.get('caption') || '').slice(0, 140);

      const bytes = await readBuffer(req);
      if (!bytes || bytes.length < 100) {
        res.status(400).json({ ok: false, error: 'empty image bytes' });
        return;
      }
      const ext = /jpe?g/.test(ctype) ? 'jpg' : 'png';
      const filename = `contests/${contestId}/${crypto.randomUUID()}.${ext}`;
      const putRes = await put(filename, bytes, {
        access: 'public',
        contentType: ctype,
        addRandomSuffix: false
      });
      url = putRes.url || (putRes.pathname ? `https://blob.vercel-storage.com${putRes.pathname}` : null);
    } else {
      res.status(400).json({ ok: false, error: 'unsupported content-type' });
      return;
    }

    if (!url) {
      res.status(400).json({ ok: false, error: 'missing imageUrl/url' });
      return;
    }

    const entry = await saveEntry(contestId, {
      id: crypto.randomUUID(),
      name,
      caption,
      url,                 // always set
      imageUrl: url,       // also set for older renderers
      ts: Date.now(),
      votes: {},
      score: 0
    });

    res.status(200).json({ ok: true, id: entry.id, url: entry.url });
  } catch (e) {
    console.error('[entry]', e);
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
