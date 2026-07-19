// /api/generate-overlay.js — Phase 4a (AI Overlay MVP)
// =============================================================================
// Generates a decorative overlay PNG (transparent background) that matches the
// style/palette of the NFT currently loaded on the canvas, using OpenAI's
// gpt-image-1 image-edit endpoint. Successful generations are saved to Vercel
// Blob and indexed in KV so they persist until the user deletes them
// (see /api/ai-overlays for list/delete).
//
// ENV REQUIRED:
//   OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN (already set for overlay publishing),
//   KV_REST_API_URL / KV_REST_API_TOKEN (already set)
//
// REQUEST (POST, JSON):
//   { "image": "<data:image/png;base64,...>" OR "imageUrl": "https://...",
//     "prompt": "user's idea, optional",
//     "quality": "low" | "medium" | "high" (optional, default "medium") }
//
// RESPONSE:
//   200 { ok:true, imageB64:"<base64 png>", id:"...", url:"https://...blob..." }
// =============================================================================

const { kvGet, kvSet } = require('./_lib/redisAdapter');
const { put } = require('@vercel/blob');
const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('./_lib/nameSession');
const { resolveByPlayerId, debit, credit, billingConfigured } = require('./_lib/economy');

const OPENAI_URL = 'https://api.openai.com/v1/images/edits';
const LIST_KEY = 'ra:ai-overlays';
const AI_COST_KEY = 'ra:settings:aiCost';

// Cost is admin-adjustable at runtime (KV), env var as fallback default.
async function currentAiCost(){
  try {
    const v = await kvGet(AI_COST_KEY);
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  } catch(_){}
  return Math.max(0, parseInt(process.env.REBEL_COST_PER_GEN || '25', 10) || 0);
}
const MAX_SAVED = 200;

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

  // ---- Phase 4b: sign-in + $REBEL billing ----
  // Rollout-safe: no NAME_SESSION_SECRET -> behaves as before (open endpoint,
  // frontend admin-gated). Secret set -> sign-in required. SERVICE_API_KEY
  // also set + cost > 0 -> each generation debits the central economy ledger.
  const SIGNON_ON = !!process.env.NAME_SESSION_SECRET;
  const COST = await currentAiCost();
  let playerId = null, billedUser = null, idem = null;
  if (SIGNON_ON) {
    playerId = verifyNameSession(readCookie(req, NAME_SESSION_COOKIE));
    if (!playerId) return res.status(401).json({ ok: false, error: 'sign_in_required' });
    if (billingConfigured() && COST > 0) {
      billedUser = await resolveByPlayerId(playerId);
      if (!billedUser) return res.status(502).json({ ok: false, error: 'economy_unreachable' });
      if (billedUser.balance < COST) {
        return res.status(402).json({ ok: false, error: 'insufficient_points', balance: billedUser.balance, cost: COST });
      }
      idem = 'aiov-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      const d = await debit({ userId: billedUser.userId, amount: COST, type: 'game_spend',
        reason: 'AI overlay generation', idempotencyKey: idem, metadata: { playerId, feature: 'ai_overlay' } });
      if (!d.ok) return res.status(502).json({ ok: false, error: 'debit_failed' });
    }
  }
  const refundIfBilled = async (why) => {
    if (!billedUser) return;
    try {
      await credit({ userId: billedUser.userId, amount: COST, type: 'refund',
        reason: 'Refund: AI overlay generation failed (' + why + ')', idempotencyKey: idem + '-refund' });
    } catch (e) { console.error('[gen-overlay] refund failed', e && e.message); }
  };

  let body = {};
  try { body = (typeof req.body === 'string') ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ ok: false, error: 'bad_json' }); }

  let imgBuf = null;
  try {
    if (typeof body.image === 'string' && body.image.startsWith('data:image/')) {
      imgBuf = Buffer.from(body.image.slice(body.image.indexOf(',') + 1), 'base64');
    } else if (typeof body.imageUrl === 'string' && /^https?:\/\//i.test(body.imageUrl)) {
      const r = await fetch(body.imageUrl);
      if (!r.ok) return res.status(400).json({ ok: false, error: 'image_fetch_failed' });
      imgBuf = Buffer.from(await r.arrayBuffer());
    } else {
      return res.status(400).json({ ok: false, error: 'no_image' });
    }
  } catch {
    return res.status(400).json({ ok: false, error: 'image_read_failed' });
  }
  if (!imgBuf || imgBuf.length < 100) return res.status(400).json({ ok: false, error: 'empty_image' });
  if (imgBuf.length > 6 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'image_too_large' });

  const userIdea = String(body.prompt || '').slice(0, 400).trim();
  const quality = ['low', 'medium', 'high'].includes(body.quality) ? body.quality : 'medium';

  const prompt = [
    'Create a single decorative overlay graphic for this NFT character artwork.',
    'CRITICAL STYLE MATCHING RULES:',
    '- Sample colors DIRECTLY from the artwork: reuse its exact palette, shading style, outline weight, and rendering technique so the overlay looks drawn by the same artist.',
    '- If the overlay includes body parts (hands, arms, paws, claws), they MUST belong to the SAME character shown in the image: same species and anatomy, same skin/fur/exoskeleton colors, same outfit and sleeves. NEVER draw generic human hands unless the character is human.',
    '- Match the artwork\'s theme (e.g. ninja, streetwear, faction colors) in any props or effects.',
    userIdea ? ('Requested overlay: ' + userIdea + '.') : 'Overlay idea: pick something that complements the character (weapon, aura, headwear, frame accent, effects).',
    'OUTPUT RULES:',
    '- Output ONLY the overlay element(s), isolated on a fully transparent background.',
    '- Do NOT redraw or include the original character or its background.',
    '- No solid background, no full-canvas frame, no text unless explicitly requested.',
  ].join('\n');

  const fd = new FormData();
  fd.append('model', 'gpt-image-1');
  fd.append('image[]', new Blob([imgBuf], { type: 'image/png' }), 'base.png');
  fd.append('prompt', prompt);
  fd.append('size', '1024x1024');
  fd.append('background', 'transparent');
  fd.append('quality', quality);
  fd.append('input_fidelity', 'high'); // better palette/character matching
  fd.append('n', '1');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 110000);
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
      await refundIfBilled('upstream ' + r.status);
      return res.status(502).json({ ok: false, error: 'upstream_failed', status: r.status });
    }
    const data = await r.json();
    const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
    if (!b64) { await refundIfBilled('malformed response'); return res.status(502).json({ ok: false, error: 'malformed_response' }); }

    // Persist to Blob + KV so paid generations aren't lost. Failures here are
    // non-fatal: the user still gets the image back.
    let saved = null;
    try {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const png = Buffer.from(b64, 'base64');
      const blob = await put('ai-overlays/' + id + '.png', png, { access: 'public', contentType: 'image/png' });
      // Per-commander shelf when signed in; legacy global shelf otherwise.
      const shelfKey = playerId ? (LIST_KEY + ':' + playerId) : LIST_KEY;
      let list = await kvGet(shelfKey);
      if (!Array.isArray(list)) list = [];
      list.unshift({ id, url: blob.url, prompt: userIdea, ts: Date.now() });
      if (list.length > MAX_SAVED) list = list.slice(0, MAX_SAVED);
      await kvSet(shelfKey, list);
      saved = { id, url: blob.url };
    } catch (e) {
      console.error('[gen-overlay] persist failed (non-fatal)', e && e.message);
    }

    res.setHeader('Cache-Control', 'no-store');
    const charged = billedUser ? COST : 0;
    const newBalance = billedUser ? (billedUser.balance - COST) : null;
    return res.status(200).json({ ok: true, imageB64: b64, charged, newBalance, ...(saved || {}) });
  } catch (e) {
    if (e.name === 'AbortError') { await refundIfBilled('timeout'); return res.status(504).json({ ok: false, error: 'upstream_timeout' }); }
    console.error('[gen-overlay] unexpected', e && e.message);
    await refundIfBilled('internal error');
    return res.status(500).json({ ok: false, error: 'internal' });
  } finally {
    clearTimeout(timer);
  }
};
