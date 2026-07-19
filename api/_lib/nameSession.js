// api/_lib/nameSession.js — CJS port of the Playground's lib/name-session.ts
// HMAC-signed session token over a playerId ("name:<slug>"), cookie-based.
// Inert (returns null / no cookie) until NAME_SESSION_SECRET is set.
const { createHmac, timingSafeEqual } = require('crypto');

const SECRET = process.env.NAME_SESSION_SECRET || '';
const NAME_SESSION_COOKIE = 'ra_name_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const sign = (payload) => b64url(createHmac('sha256', SECRET).update(payload).digest());

function signNameSession(playerId){
  if (!SECRET || !playerId) return null;
  const encoded = b64url(Buffer.from(playerId, 'utf8'));
  return encoded + '.' + sign(encoded);
}
function verifyNameSession(token){
  if (!SECRET || !token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot), sig = token.slice(dot + 1);
  const a = Buffer.from(sig), b = Buffer.from(sign(encoded));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const playerId = fromB64url(encoded);
    return playerId.startsWith('name:') ? playerId : null;
  } catch { return null; }
}
function nameSessionSetCookie(token){
  return NAME_SESSION_COOKIE + '=' + token + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + MAX_AGE_SECONDS;
}
function nameSessionClearCookie(){
  return NAME_SESSION_COOKIE + '=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}
function readCookie(req, name){
  const raw = (req.headers && req.headers.cookie) || '';
  const hit = raw.split(';').map(s => s.trim()).find(p => p.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : '';
}
module.exports = { NAME_SESSION_COOKIE, signNameSession, verifyNameSession, nameSessionSetCookie, nameSessionClearCookie, readCookie };
