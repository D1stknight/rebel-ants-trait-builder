// /api/share-discord.js
// Post the current creation to the community Discord via webhook, presented
// by Ant-Thony. Requires a signed-in commander (abuse control). Enabled once
// DISCORD_WEBHOOK_URL is set in the environment.
// POST { image: dataURL }

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
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (!hook) return res.status(200).json({ ok: false, error: 'not_configured' });

  const name = verifyNameSession(readCookie(req, NAME_SESSION_COOKIE));
  if (!name) return res.status(401).json({ ok: false, error: 'sign_in_required' });

  let body;
  try { body = await readJSON(req); } catch (e) { return res.status(400).json({ ok: false, error: String(e.message || e) }); }
  const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/i.exec(String(body.image || ''));
  if (!m) return res.status(400).json({ ok: false, error: 'bad_image' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 7.5 * 1024 * 1024) return res.status(400).json({ ok: false, error: 'image_too_large' });

  const lines = [
    'Fresh from the Workshop - **' + name + '** just cooked this up 🐜🔥',
    'Hot off the mandibles! **' + name + '** made a thing.',
    '**' + name + '** walked into my Workshop and left with THIS. Respect. 🐜',
    'The colony grows stronger - new drip by **' + name + '**.'
  ];
  const content = lines[Math.floor(Math.random() * lines.length)];

  try {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ username: 'Ant-Thony', content }));
    const ext = /jpeg/i.test(m[1]) ? 'jpg' : 'png';
    form.append('files[0]', new Blob([buf], { type: m[1] }), 'workshop-' + Date.now() + '.' + ext);
    const r = await fetch(hook, { method: 'POST', body: form });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(200).json({ ok: false, error: 'discord ' + r.status + ' ' + t.slice(0, 120) });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
};
