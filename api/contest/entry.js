// api/contest/entry.js
export const config = { runtime: 'nodejs' };

import { put } from '@vercel/blob';
import {
  getActiveContestId,
  saveEntry,
} from '../_lib/redisAdapter.js';

export default async function handler(req) {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405 });
    }

    // Ensure there is an active contest
    const contestId = await getActiveContestId();
    if (!contestId) {
      return new Response(JSON.stringify({ ok: false, error: 'No active contest' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Read name/caption from the query string (how the builder sends them)
    const urlObj = new URL(req.url);
    const name = (urlObj.searchParams.get('name') || 'Anonymous').slice(0, 48);
    const caption = (urlObj.searchParams.get('caption') || '').slice(0, 140);

    // Read PNG bytes from body
    const bytes = await req.arrayBuffer();
    if (!bytes || bytes.byteLength < 32) {
      return new Response(JSON.stringify({ ok: false, error: 'No image bytes' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Upload to Vercel Blob
    const id = crypto.randomUUID();
    const filename = `contests/${contestId}/${id}.png`;
    const { url } = await put(filename, bytes, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      contentType: 'image/png',
    });

    // Save entry JSON in Redis (robust; no null args)
    const saved = await saveEntry(contestId, id, name, url, caption);

    return new Response(JSON.stringify({ ok: true, id, url, entry: saved }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
