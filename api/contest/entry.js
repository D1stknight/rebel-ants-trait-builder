// api/contest/entry.js
export const config = { runtime: 'nodejs' };

import { put } from '@vercel/blob';
import { getActiveContestId, saveEntry } from '../_lib/redisAdapter.js';

export default async function handler(req) {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const contestId = await getActiveContestId();
    if (!contestId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'no active contest' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    const u = new URL(req.url);
    const name = (u.searchParams.get('name') || 'Anonymous').slice(0, 48);
    const caption = (u.searchParams.get('caption') || '').slice(0, 140);

    // read raw bytes (we send a PNG blob from the builder)
    const bytes = await req.arrayBuffer();
    if (!bytes || bytes.byteLength < 32) {
      return new Response(
        JSON.stringify({ ok: false, error: 'no image bytes' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    const id = crypto.randomUUID();
    const path = `contests/${contestId}/${id}.png`;

    // Upload to Vercel Blob (public URL back)
    const putRes = await put(
      path,
      new Blob([bytes], { type: 'image/png' }),
      {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: false,
        contentType: 'image/png'
      }
    );

    // Record in Redis
    await saveEntry({
      contestId,
      id,
      name,
      url: putRes.url,
      caption
    });

    return new Response(
      JSON.stringify({ ok: true, id, url: putRes.url }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (err) {
    console.error('entry error', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
