// api/contest/entry.js
export const config = { runtime: 'edge' };

import { put } from '@vercel/blob';
import { getActiveContestId, saveEntry } from '../_lib/redisAdapter';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const contestId = await getActiveContestId();
  if (!contestId) {
    return new Response(JSON.stringify({ ok: false, error: 'no active contest' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  const { searchParams } = new URL(req.url);
  const name    = (searchParams.get('name') || 'Anonymous').slice(0, 48);
  const caption = (searchParams.get('caption') || '').slice(0, 140);

  const bytes = await req.arrayBuffer();
  if (!bytes || bytes.byteLength < 32) {
    return new Response(JSON.stringify({ ok: false, error: 'no image bytes' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  const id = crypto.randomUUID();
  const filename = `contest/${contestId}/${id}.png`;

  const { url } = await put(filename, bytes, {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false,
    contentType: 'image/png'
  });

  await saveEntry({ contestId, id, name, url, caption });

  return new Response(JSON.stringify({ ok: true, id, url }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}
