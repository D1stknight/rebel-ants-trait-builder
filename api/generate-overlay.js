// /api/generate-overlay.js — Phase 4a (AI Overlay MVP)
// =============================================================================
// Generates a decorative overlay PNG (transparent background) that matches the
// style/palette of the NFT currently loaded on the canvas, using OpenAI's
// gpt-image-1 image-edit endpoint.
//
// ENV REQUIRED:
//   OPENAI_API_KEY
//
// REQUEST (POST, JSON):
//   { "image": "<data:image/png;base64,...>" OR "imageUrl": "https://...",
//     "prompt": "user's idea, optional",
//     "quality": "low" | "medium" | "high" (optional, default "medium") }
//
// RESPONSE:
//   200 { ok:true, imageB64: "<base64 png>" }
//   4xx/5xx { ok:false, error:"..." }
//
// Billing note: free while in MVP (admin-gated on the frontend). Phase 4b wires
// this behind commander sign-in + Rebel Economy debit, same as the Playground.
// =============================================================================

const OPENAI_URL = 'https://api.openai.com/v1/images/edits';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('[gen-overlay] OPENAI_API_KEY not set');
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  // Parse body (Vercel may give object or string)
  let body = {};
  try { body = (typeof req.body === 'string') ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ ok: false, error: 'bad_json' }); }

  // Get the source image bytes: dataURL or URL
  let imgBuf = null;
  try {
    if (typeof body.image === 'string' && body.image.startsWith('data:image/')) {
      const b64 = body.image.slice(body.image.indexOf(',') + 1);
      imgBuf = Buffer.from(b64, 'base64');
    } else if (typeof body.imageUrl === 'string' && /^https?:\/\//i.test(body.imageUrl)) {
      const r = await fetch(body.imageUrl);
      if (!r.ok) return res.status(400).json({ ok: false, error: 'image_fetch_failed' });
      imgBuf = Buffer.from(await r.arrayBuffer());
    } else {
      return res.status(400).json({ ok: false, error: 'no_image' });
    }
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'image_read_failed' });
  }
  if (!imgBuf || imgBuf.length < 100) return res.status(400).json({ ok: false, error: 'empty_image' });
  if (imgBuf.length > 6 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'image_too_large' });

  const userIdea = String(body.prompt || '').slice(0, 400).trim();
  const quality = ['low', 'medium', 'high'].includes(body.quality) ? body.quality : 'medium';

  const prompt = [
    'Create a single decorative overlay graphic inspired by this NFT character artwork.',
    'It must match the artwork\'s color palette, lighting, and art style so it looks native to the piece.',
    userIdea ? ('Theme requested by the user: ' + userIdea + '.') : 'Theme: pick something that complements the character (weapon, aura, headwear, frame accent, effects).',
    'HARD RULES:',
    '- Output ONLY the overlay element(s), isolated on a fully transparent background.',
    '- Do NOT redraw or include the original character.',
    '- No solid background, no frame filling the whole canvas, no text unless asked.',
  ].join('\n');

  // Build multipart form for the edits endpoint
  const fd = new FormData();
  fd.append('model', 'gpt-image-1');
  fd.append('image[]', new Blob([imgBuf], { type: 'image/png' }), 'base.png');
  fd.append('prompt', prompt);
  fd.append('size', '1024x1024');
  fd.append('background', 'transparent');
  fd.append('quality', quality);
  fd.append('n', '1');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 110000); // image gen can take 30-90s
  try {
    const r = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: fd,
      signal: ctrl.signal
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.error('[gen-overlay] openai non-2xx', r.status, errText.slice(0, 300));
      return res.status(502).json({ ok: false, error: 'upstream_failed', status: r.status });
    }
    const data = await r.json();
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) return res.status(502).json({ ok: false, error: 'malformed_response' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, imageB64: b64 });
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ ok: false, error: 'upstream_timeout' });
    console.error('[gen-overlay] unexpected', e && e.message);
    return res.status(500).json({ ok: false, error: 'internal' });
  } finally {
    clearTimeout(timer);
  }
};
