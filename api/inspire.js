// =============================================================================
// /api/inspire — v2 (AI-only, artwork-aware)
// =============================================================================
// Generates a short quote via Claude Haiku. No canned templates anywhere:
// every quote is model-generated. Three modes, picked per request:
//   - motivational : gritty builder/warrior motivation
//   - ninja        : blade/honor/shadow themed
//   - artwork      : riffs on the NFT actually loaded on the canvas
//                    (only when the frontend sends a snapshot)
//
// ENV: ANTHROPIC_API_KEY (required), INSPIRE_MODEL (optional override)
//
// REQUEST: POST { recent?: string[], image?: dataURL }
// RESPONSE: 200 { quote, vibe } | 4xx/5xx { error }
// =============================================================================

const MODEL = process.env.INSPIRE_MODEL || 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const COMMON_RULES = [
  'Hard rules:',
  '- Output ONLY the quote text. No quotes around it. No preamble. No explanation.',
  '- Between 3 and 14 words. Aim for 6-10.',
  '- Standard ASCII punctuation only. No emojis. No hashtags.',
  '- Never reuse or closely mimic any recent quote the user lists.',
  '- Every quote must be freshly invented. Never fall back to stock phrases.'
].join('\n');

const VIBES = {
  motivational: {
    label: 'motivational quote',
    system: [
      'You write SHORT original motivational quotes for the Rebel Ants NFT community.',
      'Speak as Ant-Thony, the wise-cracking warrior-philosopher ant mascot of the colony: gritty, witty, proud, never corporate. The quote must stand alone (no name prefix), but it should FEEL like him.',
      'Vibe: gritty, defiant, builder-warrior energy. Earned wisdom, not corporate poster fluff.',
      COMMON_RULES
    ].join('\n')
  },
  ninja: {
    label: 'ninja quote',
    system: [
      'You write SHORT original ninja-flavored quotes for the Rebel Ants NFT community.',
      'Speak as Ant-Thony, the wise-cracking warrior-philosopher ant mascot of the colony: gritty, witty, proud, never corporate. The quote must stand alone (no name prefix), but it should FEEL like him.',
      'Vibe: blades, shadows, honor, discipline, the way of the warrior. Slightly mythic.',
      COMMON_RULES
    ].join('\n')
  },
  artwork: {
    label: 'quote inspired by this artwork',
    system: [
      'You write SHORT original quotes inspired by the NFT character artwork the user shows you.',
      'Speak as Ant-Thony, the wise-cracking warrior-philosopher ant mascot of the colony: gritty, witty, proud, never corporate. The quote must stand alone (no name prefix), but it should FEEL like him.',
      'Look at the image: the character, outfit, weapons, props, colors, expression, mood.',
      'Write a quote that clearly riffs on something SPECIFIC you can see, in a motivational or ninja spirit.',
      COMMON_RULES
    ].join('\n')
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[inspire] ANTHROPIC_API_KEY not set');
    return res.status(503).json({ error: 'not_configured' });
  }

  let recent = [], imageData = null, imageMedia = null;
  try {
    const body = (typeof req.body === 'string') ? JSON.parse(req.body) : (req.body || {});
    if (Array.isArray(body.recent)) {
      recent = body.recent.filter(s => typeof s === 'string' && s.length < 200).slice(0, 20);
    }
    if (typeof body.image === 'string' && body.image.startsWith('data:image/')) {
      const m = body.image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
      if (m && m[2].length < 2.8e6) { imageMedia = m[1]; imageData = m[2]; }
    }
  } catch (_) {}

  // Mode: artwork gets priority weight when a snapshot is present.
  const keys = imageData ? ['artwork', 'artwork', 'motivational', 'ninja'] : ['motivational', 'ninja'];
  const vibeKey = keys[Math.floor(Math.random() * keys.length)];
  const vibe = VIBES[vibeKey];

  const askText = (recent.length ? ('Recent quotes (do not repeat or closely mimic):\n- ' + recent.join('\n- ') + '\n\n') : '')
    + 'Give me one new ' + vibe.label + '.';
  const content = (vibeKey === 'artwork' && imageData)
    ? [{ type: 'image', source: { type: 'base64', media_type: imageMedia, data: imageData } }, { type: 'text', text: askText }]
    : askText;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 60,
        temperature: 1.0,
        system: vibe.system,
        messages: [{ role: 'user', content }]
      }),
      signal: ctrl.signal
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.error('[inspire] anthropic non-2xx', r.status, errText.slice(0, 200));
      return res.status(502).json({ error: 'upstream_failed', status: r.status });
    }
    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim()
      .replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '').trim();
    if (!text || text.length < 3 || text.length > 140) {
      return res.status(502).json({ error: 'bad_generation' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ quote: text, vibe: vibeKey });
  } catch (e) {
    if (e.name === 'AbortError') return res.status(504).json({ error: 'upstream_timeout' });
    console.error('[inspire] unexpected', e && e.message);
    return res.status(500).json({ error: 'internal' });
  } finally {
    clearTimeout(timer);
  }
};
