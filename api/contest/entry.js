// api/contest/entry.js
export const config = { runtime: 'nodejs' };

import { put } from '@vercel/blob';
import crypto from 'node:crypto';
import { getActiveContestId, saveEntry } from '../_lib/redisAdapter.js'; // adjust ".js" if your adapter file uses extensionless import

// Read raw bytes from a Node request
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  try {
    // Build a proper base so URL() works in Node
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const url = new URL(req.url, `${proto}://${host}`);

    const name = (url.searchParams.get('name') || 'Anonymous').slice(0, 48);
    const caption = (url.searchParams.get('caption') || '').slice(0, 140);

    // Ensure there is an active contest
    const contestId = await getActiveContestId();
    if (!contestId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'No active contest' }));
      return;
    }

    // Read the raw PNG bytes from the body
    const bytes = await readBody(req);
    if (!bytes || bytes.length < 32) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'No image bytes' }));
      return;
    }

    // Store to Vercel Blob
    const id = crypto.randomUUID();
    const filename = `contests/${contestId}/${id}.png`;
    const blob = await put(filename, bytes, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: 'image/png',
      addRandomSuffix: false,
    });

    // Save the entry metadata to Redis
    await saveEntry(contestId, id, name, blob.url, caption);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, id, url: blob.url }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
  }
}
