// /api/share-discord.js
// Post the current creation to Discord AS THE REAL ANT-THONY BOT.
//
// Preferred path (the real bot): set DISCORD_BOT_TOKEN (same token the
// economy-core bot uses) + DISCORD_SHARE_CHANNEL_ID (right-click channel ->
// Copy Channel ID). Posts via the Discord REST API with the bot account, so
// it is the actual Ant-Thony - his avatar, his flair, and his own replies
// continue naturally in-thread. Bot needs Send Messages + Attach Files in
// the channel.
//
// Fallback: DISCORD_WEBHOOK_URL (posts as a webhook pseudo-user).
// Neither set -> not_configured.
//
// Requires a signed-in commander. POST { image: dataURL }

const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('./_lib/nameSession');

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 9 * 1024 * 1024) reject(new Error('too_large')); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_SHARE_CHANNEL_ID;
  const hook = process.env.DISCORD_WEBHOOK_URL;
  const useBot = !!(botToken && channelId);
  if (!useBot && !hook) return res.status(200).json({ ok: false, error: 'not_configured' });

  const rawName = verifyNameSession(readCookie(req, NAME_SESSION_COOKIE));
  if (!rawName) return res.status(401).json({ ok: false, error: 'sign_in_required' });
  const bare = String(rawName).replace(/^name:/i, '');
  const name = bare.charAt(0).toUpperCase() + bare.slice(1);

  let body;
  try { body = await readJSON(req); } catch (e) { return res.status(400).json({ ok: false, error: String(e.message || e) }); }
  const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/i.exec(String(body.image || ''));
  if (!m) return res.status(400).json({ ok: false, error: 'bad_image' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 7.5 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'image_too_large' });

  const lines = [
    'Fresh from the Workshop - **' + name + '** just cooked this up \u{1F41C}\u{1F525}',
    'Hot off the mandibles! **' + name + '** made a thing.',
    '**' + name + '** walked into my Workshop and left with THIS. Respect. \u{1F41C}',
    'The colony grows stronger - new drip by **' + name + '**.'
  ];
  let content = lines[Math.floor(Math.random() * lines.length)];

  // Ant-Thony reviews the piece right in the post (best effort, 15s cap).
  const akey = process.env.ANTHROPIC_API_KEY;
  if (akey) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const ar = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': akey, 'anthropic-version': '2023-06-01' },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          system: 'You are Ant-Thony, the wise-cracking ant mascot of the Rebel Ants NFT community. Witty, cheeky, playful roasts - never mean-spirited, PG-13. Short and punchy with ant/bug flavor and at most one emoji.',
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: m[1].toLowerCase(), data: m[2] } },
            { type: 'text', text: 'A community member just made this in the overlay builder and is sharing it with the colony. Give ONE short sentence: a playful roast or hype reaction to something specific you can see. No preamble.' }
          ] }]
        })
      });
      clearTimeout(timer);
      const aj = await ar.json().catch(() => null);
      const line = aj && (aj.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
      if (ar.ok && line) content += '\n> ' + line.slice(0, 280);
    } catch (_) {}
  }

  try {
    const form = new FormData();
    const ext = /jpeg/i.test(m[1]) ? 'jpg' : 'png';
    const filename = 'workshop-' + Date.now() + '.' + ext;

    if (useBot) {
      // The real Ant-Thony: bot-token REST post (no username/avatar overrides
      // needed - it IS him). Suppress all pings.
      form.append('payload_json', JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
        attachments: [{ id: 0, filename }]
      }));
      form.append('files[0]', new Blob([buf], { type: m[1] }), filename);
      const r = await fetch('https://discord.com/api/v10/channels/' + channelId + '/messages', {
        method: 'POST',
        headers: { Authorization: 'Bot ' + botToken },
        body: form
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return res.status(200).json({ ok: false, error: 'discord ' + r.status + ' ' + t.slice(0, 140) });
      }
      return res.status(200).json({ ok: true, via: 'bot' });
    }

    // Fallback: webhook pseudo-user
    form.append('payload_json', JSON.stringify({
      username: 'Ant-Thony',
      avatar_url: 'https://builder.rebelants.io/assets/apple-touch-icon.png',
      content
    }));
    form.append('files[0]', new Blob([buf], { type: m[1] }), filename);
    const r = await fetch(hook, { method: 'POST', body: form });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(200).json({ ok: false, error: 'discord ' + r.status + ' ' + t.slice(0, 140) });
    }
    return res.status(200).json({ ok: true, via: 'webhook' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
};
