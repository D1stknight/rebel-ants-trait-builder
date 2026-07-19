// api/auth/sign-in.js — Commander Name + PIN sign-in (same accounts as the
// Playground: hashes and name records live in the shared Redis).
// Set COMMANDER_KV_REST_API_URL/TOKEN if the commander records live in a
// different Upstash database than this project's KV (e.g. the Playground's).
const { createHash } = require('crypto');
const { signNameSession, nameSessionSetCookie } = require('../_lib/nameSession');

const KV_URL = process.env.COMMANDER_KV_REST_API_URL || process.env.KV_REST_API_URL || process.env.KV_URL;
const KV_TOKEN = process.env.COMMANDER_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.KV_REST_TOKEN;

async function kvGetRaw(key){
  const r = await fetch(KV_URL + '/get/' + encodeURIComponent(key), { headers: { Authorization: 'Bearer ' + KV_TOKEN } });
  const j = await r.json().catch(() => ({}));
  let v = j.result;
  if (typeof v === 'string') { try { const p = JSON.parse(v); if (typeof p === 'string') v = p; } catch(_){} }
  return v == null ? null : String(v);
}
const hashPin = (name, pin) => createHash('sha256').update('ra:commander:' + name.toLowerCase() + ':' + pin + ':rebel-ants-2026').digest('hex');
const normalize = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9_]/g, '');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok:false, error:'method_not_allowed' }); }
  if (!process.env.NAME_SESSION_SECRET) return res.status(503).json({ ok:false, error:'signon_not_configured' });
  if (!KV_URL || !KV_TOKEN) return res.status(503).json({ ok:false, error:'kv_not_configured' });

  let body = {};
  try { body = (typeof req.body === 'string') ? JSON.parse(req.body) : (req.body || {}); } catch(_){}
  const raw = String(body.name || '').trim();
  const pin = String(body.pin || '').trim();
  const name = normalize(raw);
  if (!name) return res.status(400).json({ ok:false, error:'name_required' });
  if (!pin) return res.status(400).json({ ok:false, error:'pin_required' });

  const exists = await kvGetRaw('ra:commander:name:' + name);
  if (!exists) return res.status(404).json({ ok:false, error:'commander_not_found' });
  const storedHash = await kvGetRaw('ra:commander:pin:' + name);
  if (!storedHash) return res.status(403).json({ ok:false, error:'no_pin_set' });
  if (hashPin(name, pin) !== storedHash) return res.status(403).json({ ok:false, error:'incorrect_pin' });

  const displayName = (await kvGetRaw('ra:commander:player:name:' + name)) || raw;
  const token = signNameSession('name:' + name);
  if (token) res.setHeader('Set-Cookie', nameSessionSetCookie(token));
  return res.status(200).json({ ok:true, name, playerId: 'name:' + name, displayName });
};
