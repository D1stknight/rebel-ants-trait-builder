// api/contest/entry.js
import { put } from '@vercel/blob';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const name = (searchParams.get('name') || 'Anonymous').slice(0, 48);
    const caption = (searchParams.get('caption') || '').slice(0, 140);

    // Read raw image bytes one time
    const bytes = Buffer.from(await req.arrayBuffer());
    if (!bytes.length) {
      return new Response(JSON.stringify({ ok: false, error: 'no image bytes' }), {
        status: 400, headers: { 'content-type': 'application/json' }
      });
    }

    // ✅ TEMP: upload to Blob only (skip Upstash)
    const id = Math.random().toString(36).slice(2);
    const filename = `tests/${id}.png`;

    // If this call hangs, the 504 is the Blob token, not your code.
    const { url } = await put(filename, bytes, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: 'image/png'
    });

    return new Response(JSON.stringify({ ok: true, id, url, name, caption }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
