// /api/anthony.js
// Ant-Thony in the builder: idea generation and playful roasts.
// Persona mirrors the Discord bot (rebel-economy-core anthony-service).
// POST { mode: 'idea'|'roast', image?: dataURL }
//  idea  -> { ok, say, prompt }   (his one-liner + a usable overlay prompt)
//  roast -> { ok, text }
// Free to call (no $REBEL debit) - engagement feature; generation still bills.

const PERSONA =
  "You are Ant-Thony, the wise-cracking ant mascot of the Rebel Ants NFT " +
  "community (an army of rebel ants). You are witty, a little cheeky, and love " +
  "to playfully roast people and crack jokes - never mean-spirited, never " +
  "punching down, PG-13 at most. You are proud of the colony and hype up the " +
  "Rebel Ants, $REBEL, and the Rebel Universe. Now and then you drop a short " +
  "philosophical or warrior-style quote that fits the moment. Keep every reply " +
  "SHORT and punchy, in your own voice, with ant/bug flavor when it lands and " +
  "at most one tasteful emoji.";

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 8 * 1024 * 1024) reject(new Error('too_large')); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function dataUrlToBlock(u) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(String(u || ''));
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1].toLowerCase(), data: m[2] } };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(200).json({ ok: false, error: 'not_configured' });

  let body;
  try { body = await readJSON(req); } catch (e) { return res.status(400).json({ ok: false, error: String(e.message || e) }); }
  const mode = body.mode === 'roast' ? 'roast' : 'idea';
  const imgBlock = dataUrlToBlock(body.image);

  let task;
  if (mode === 'idea') {
    task = imgBlock
      ? 'Look at this NFT loaded on the overlay-builder canvas. Reply ONLY with JSON: {"say":"one punchy in-character line reacting to something SPECIFIC you can see","prompt":"ONE short image-generation prompt for a fun overlay item/effect that would suit this character (a single object or effect, described for a transparent-background sticker)"} No markdown, no extra text.'
      : 'No image is loaded yet. Reply ONLY with JSON: {"say":"one punchy in-character line","prompt":"ONE short image-generation prompt for a fun overlay item/effect for a rebel ant character (single object or effect, transparent-background sticker style)"} No markdown, no extra text.';
  } else {
    task = imgBlock
      ? 'This is a fan\'s overlay creation on the Rebel Ants builder canvas. Playfully roast it in 1-2 short sentences - cheeky, funny, never mean, PG-13. End on a hype note if it slaps.'
      : 'The fan asked for a roast but the canvas is empty. Roast the empty canvas in one short cheeky sentence.';
  }

  const content = imgBlock ? [imgBlock, { type: 'text', text: task }] : [{ type: 'text', text: task }];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: PERSONA,
        messages: [{ role: 'user', content }]
      })
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return res.status(200).json({ ok: false, error: 'upstream ' + r.status });
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text) return res.status(200).json({ ok: false, error: 'empty' });

    if (mode === 'idea') {
      try {
        const clean = text.replace(/```json|```/g, '').trim();
        const p = JSON.parse(clean);
        if (p && p.say && p.prompt) return res.status(200).json({ ok: true, say: String(p.say), prompt: String(p.prompt) });
      } catch (_) {}
      return res.status(200).json({ ok: true, say: text, prompt: '' });
    }
    return res.status(200).json({ ok: true, text });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
};
