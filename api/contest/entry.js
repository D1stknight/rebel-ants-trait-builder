// api/contest/entry.js
import { put } from '@vercel/blob';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  try {
    // Parse query safely (need a base host in node runtime)
    const u = new URL(req.url, `http://${req.headers.host}`);
    const name = (u.searchParams.get('name') || 'Anonymous').slice(0, 48);
    const caption = (u.searchParams.get('caption') || '').slice(0, 140);

    // Read raw bytes ONCE (avoid disturbed/locked body errors)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if (!bytes.length) {
      res.status(400).json({ ok: false, error: 'no image bytes' });
      return;
    }

    // TEMP: upload the image to Blob only (skip DB to remove timeouts)
    const id = Math.random().toString(36).slice(2);
    const filename = `tests/${id}.png`;

    const { url } = await put(filename, bytes, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: 'image/png'
    });

    res.status(200).json({ ok: true, id, url, name, caption });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}
