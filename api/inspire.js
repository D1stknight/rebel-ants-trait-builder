// =============================================================================
// /api/inspire — Phase 2 of the cleanup
// =============================================================================
// Generates a short Rebel Ants flavored quote/battle-cry/punchline using
// Claude Haiku 4.5. The frontend (js/09-inspire-quotes.js) calls this; on any
// failure it falls back to its own local template generator, so this endpoint
// returning a non-2xx is non-fatal for the user.
//
// ENV REQUIRED:
//   ANTHROPIC_API_KEY  — your Anthropic API key (project-scoped is fine)
// ENV OPTIONAL:
//   INSPIRE_MODEL      — override the model id (default: claude-haiku-4-5-20251001)
//
// REQUEST:
//   POST /api/inspire
//   { "recent": ["last quote 1", "last quote 2", ...]  // optional, used for anti-repeat
//   }
//
// RESPONSE:
//   200 { "quote": "Charge with honor.", "vibe": "battle" }
//   4xx/5xx { "error": "..." }
// =============================================================================

const MODEL = process.env.INSPIRE_MODEL || 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Two stylistic personas. We pick one at random per request so the feed feels
// varied rather than monotone.
const VIBES = {
  battle: {
    label: 'battle-cry',
    system: [
      "You write SHORT punchy Rebel Ants quotes in a battle-cry style.",
      "Vibe: ninja warrior, defiant, honor-coded, slightly mythic.",
      "Examples of the right tone: 'Charge with honor.' / 'Strike first, apologize never.' / 'Stand. Or be ground to dust.'",
      "Hard rules:",
      "- Output ONLY the quote text. No quotes around it. No preamble. No explanation.",
      "- Between 3 and 14 words. Aim for 6-9.",
      "- Standard ASCII punctuation only. No emojis. No hashtags.",
      "- Do NOT repeat any of the recent quotes the user provides."
    ].join('\n')
  },
  irreverent: {
    label: 'irreverent',
    system: [
      "You write SHORT funny Rebel Ants one-liners. Internet-pilled, slightly shitposty, ant-themed when it lands.",
      "Vibe: terminally online warrior ant. Self-aware. Punchy.",
      "Examples of the right tone: 'Built different. Mostly out of dirt.' / 'GM but make it threatening.' / 'Six legs, one mission, zero chill.'",
      "Hard rules:",
      "- Output ONLY the quote text. No quotes around it. No preamble. No explanation.",
      "- Between 3 and 14 words. Aim for 6-10.",
      "- Standard ASCII punctuation only. No emojis. No hashtags.",
      "- Do NOT repeat any of the recent quotes the user provides."
    ].join('\n')
  }
};

module.exports = async (req, res) => {
  // Allow same-origin only (the frontend on Vercel). Reject other methods.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Hard config error — frontend will fall back gracefully, but log it loudly.
    console.error('[inspire] ANTHROPIC_API_KEY not set in environment');
    return res.status(503).json({ error: 'not_configured' });
  }

  // Read recent quotes for anti-repeat. Vercel's body parsing depends on
  // Content-Type; trust it but validate carefully.
  let recent = [];
  try {
    const body = (typeof req.body === 'string') ? JSON.parse(req.body) : (req.body || {});
    if (Array.isArray(body.recent)) {
      recent = body.recent.filter(s => typeof s === 'string' && s.length < 200).slice(0, 20);
    }
  } catch (_) { /* tolerate missing/bad body — recent stays [] */ }

  // Pick a vibe at random.
  const vibeKeys = Object.keys(VIBES);
  const vibeKey = vibeKeys[Math.floor(Math.random() * vibeKeys.length)];
  const vibe = VIBES[vibeKey];

  // Build the user message. Pass recent quotes as anti-repeat hint.
  const userMsg = recent.length > 0
    ? `Recent quotes (do not repeat or closely mimic):\n- ${recent.join('\n- ')}\n\nGive me one new ${vibe.label}.`
    : `Give me one ${vibe.label}.`;

  // Anthropic Messages API call. 8s server-side timeout.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 60,
        temperature: 1.0,           // we want variety, not consistency
        system: vibe.system,
        messages: [{ role: 'user', content: userMsg }]
      }),
      signal: ctrl.signal
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.error('[inspire] anthropic non-2xx', r.status, errText.slice(0, 200));
      return res.status(502).json({ error: 'upstream_failed', status: r.status });
    }
    const data = await r.json();
    // Response shape: { content: [{ type: 'text', text: '...' }, ...], ... }
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join(' ')
      .trim()
      // Strip wrapping quotes if the model added them anyway
      .replace(/^["'`]+/, '').replace(/["'`]+$/, '')
      .replace(/^"\s*|\s*"$/g, '')
      .trim();

    if (!text || text.length < 3 || text.length > 200) {
      return res.status(502).json({ error: 'malformed_quote' });
    }

    // No-cache: every request must reach the model. The frontend is what
    // dedupes for users via localStorage anti-repeat.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ quote: text, vibe: vibe.label });
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'upstream_timeout' });
    }
    console.error('[inspire] unexpected', e && e.message);
    return res.status(500).json({ error: 'internal' });
  } finally {
    clearTimeout(timer);
  }
};
