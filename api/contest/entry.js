// api/contest/entry.js
export const config = { runtime: 'nodejs' };

import crypto from 'crypto';
import { put } from '@vercel/blob';
import { getActiveContestId, saveEntry } from '../_lib/redisAdapter';

// read whole request body as Buffer (Node stream)
function readBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// read JSON body (Node stream -> string -> JSON)
async function readJSON(req) {
  const buf = await readBuffer(req);
  if (!buf?.length) return {};
  try {
    return JSON.parse(buf.toString('utf8') || '{}');
  } catch {
    return {};
  }
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

    const ct = String(req.headers['content-type'] || '').toLowerCase();
    const urlObj = new URL(req.url, 'http://localhost');
    let name = (urlObj.searchParams.get('name') || '').trim() || 'Anonymous';
    let caption = (urlObj.searchParams.get('caption') || '').trim();

    let imageUrl = null;

    if (ct.includes('application/json')) {
      // JSON path
      const body = await readJSON(req);
      name = (body.name || name || 'Anonymous').toString().slice(0, 48);
      caption = (body.caption || caption || '').toString().slice(0, 140);

      if (body.imageUrl) {
        imageUrl = String(body.imageUrl);
      } else if (body.imageDataUrl) {
        // data URL -> buffer -> upload to Vercel Blob
        const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/i.exec(body.imageDataUrl);
        if (!m) {
          res.status(400).json({ ok: false, error: 'bad imageDataUrl' });
          return;
        }
        const buf = Buffer.from(m[2], 'base64');
        const filename = `contests/${contestId}/${crypto.randomUUID()}.png`;
        const putRes = await put(filename, buf, {
          access: 'public',
          contentType: m[1],
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        imageUrl = putRes.url;
      }
    }

    if (!imageUrl) {
      // raw bytes path (PNG/JPG blob from builder)
      const buf = await readBuffer(req);
      if (!buf?.length || buf.length < 32) {
        res.status(400).json({ ok: false, error: 'no image bytes and no imageUrl' });
        return;
      }
      const contentType =
        ct.includes('jpeg') || ct.includes('jpg') ? 'image/jpeg' : 'image/png';
      const filename = `contests/${contestId}/${crypto.randomUUID()}.png`;
      const putRes = await put(filename, buf, {
        access: 'public',
        contentType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      imageUrl = putRes.url;
    }

    // save entry
    const id = crypto.randomUUID();
    const entry = {
      id,
      name,
      caption,
      url: imageUrl,      // keep for compatibility
      imageUrl,           // explicit
      ts: Date.now(),
      votes: {},
    };
    await saveEntry(contestId, entry);

    res.status(200).json({ ok: true, id, url: imageUrl });
  } catch (e) {
    console.error('[entry]', e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
