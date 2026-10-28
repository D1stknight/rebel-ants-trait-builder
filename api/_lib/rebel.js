// api/_lib/rebel.js — who the player is (same sign-in as every Rebel app) +
// Rebel badges (kept by Rebel Economy Core; not points, not transferable).
//
// Identity, in this order:
//   1. the Builder's own Commander session (ra_name_session -> "name:<slug>")
//   2. the shared economy session cookie `poker_session` (Discord / colony
//      name sign-in on economy.rebelants.io, set on .rebelants.io)
//      -> playerId "rebel:<economy userId>"
//
// Everything badge-related is best-effort: ~3 s timeouts, errors swallowed,
// logged once. Without REBEL_BADGES_KEY the badge calls simply do nothing.
//
// ENV: REBEL_ECONOMY_URL (falls back to ECONOMY_BASE_URL, then
//      https://economy.rebelants.io), REBEL_BADGES_KEY (badges-only key).
const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('./nameSession');
const { resolveByPlayerId } = require('./economy');

const ECONOMY_SESSION_COOKIE = 'poker_session';
const TIMEOUT_MS = 3000;
const APP = 'builder';
// The Rebel Ants (OG) collection on Ethereum (see api/ra-collections.js).
const REBEL_ANTS_CONTRACTS = ['0x96c1469c1c76e3bb0e37c23a830d0eea6bcf9221'];

const economyBase = () => String(process.env.REBEL_ECONOMY_URL || process.env.ECONOMY_BASE_URL || 'https://economy.rebelants.io').replace(/\/+$/, '');
const badgesKey = () => process.env.REBEL_BADGES_KEY || '';
const badgesOn = () => !!badgesKey();

const warned = new Set();
function warnOnce(tag, msg){
  if (warned.has(tag)) return;
  warned.add(tag);
  console.warn('[rebel] ' + tag + ': ' + msg);
}

// fetch JSON with a hard timeout; never throws, returns { status, json } or null
async function call(path, { method = 'GET', key, body, timeoutMs = TIMEOUT_MS } = {}){
  if (!key) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(economyBase() + path, {
      method, cache: 'no-store', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await r.json().catch(() => null);
    return { status: r.status, json };
  } catch (e) {
    warnOnce('call ' + path, String((e && e.message) || e));
    return null;
  } finally { clearTimeout(t); }
}

const withTimeout = (p, ms, fallback) => Promise.race([
  Promise.resolve(p).catch(() => fallback),
  new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
]);

// economy session token -> { userId, displayName, balance } (null = not signed in)
async function resolveEconomySession(token){
  // Identity lookup only: prefer the badges key, fall back to the existing
  // service key so Discord sign-in works before REBEL_BADGES_KEY is set.
  const key = badgesKey() || process.env.SERVICE_API_KEY || '';
  if (!token || !key) return null;
  const r = await call('/api/internal/resolve', { method: 'POST', key, body: { sessionToken: token } });
  const j = r && r.json;
  if (!r || r.status !== 200 || !j || !j.ok || !j.userId) return null;
  return { userId: String(j.userId), displayName: j.displayName || null, balance: Number(j.balance || 0) };
}

// "name:<slug>" -> economy user, raced against the badge timeout
async function resolveName(playerId){
  if (process.env.SERVICE_API_KEY) return withTimeout(resolveByPlayerId(playerId), TIMEOUT_MS, null);
  if (!badgesKey()) return null;
  const r = await call('/api/internal/resolve', { method: 'POST', key: badgesKey(), body: { discordId: playerId, username: playerId, displayName: null } });
  const j = r && r.json;
  if (!r || r.status !== 200 || !j || !j.ok || !j.userId) return null;
  return { userId: String(j.userId), displayName: j.displayName || null, balance: Number(j.balance || 0) };
}

// Who is signed in, without resolving a name user's economy id (no network
// for name users). Cached per request.
//   -> null | { via:'name'|'discord', playerId, name, displayName, userId|null, balance|null }
function rebelIdentity(req){
  if (req.__rebelIdentity) return req.__rebelIdentity;
  req.__rebelIdentity = (async () => {
    try {
      const pid = verifyNameSession(readCookie(req, NAME_SESSION_COOKIE));
      if (pid) {
        const name = pid.slice('name:'.length);
        return { via: 'name', playerId: pid, name, displayName: name, userId: null, balance: null };
      }
      const token = readCookie(req, ECONOMY_SESSION_COOKIE);
      if (!token) return null;
      const u = await resolveEconomySession(token);
      if (!u) return null;
      const displayName = u.displayName || 'Rebel';
      return { via: 'discord', playerId: 'rebel:' + u.userId, name: displayName, displayName, userId: u.userId, balance: u.balance };
    } catch (e) { warnOnce('identity', String((e && e.message) || e)); return null; }
  })();
  return req.__rebelIdentity;
}

// Same as rebelIdentity, plus the economy userId for name users. Cached.
//   -> null | { userId|null, displayName, via, playerId, name, balance }
function rebelUser(req){
  if (req.__rebelUser) return req.__rebelUser;
  req.__rebelUser = (async () => {
    const who = await rebelIdentity(req);
    if (!who) return null;
    if (who.via === 'name' && !who.userId) {
      const u = await resolveName(who.playerId);
      if (u) return { ...who, userId: u.userId, displayName: u.displayName || who.displayName, balance: u.balance };
    }
    return who;
  })();
  return req.__rebelUser;
}

// POST /api/internal/badges -> { ok, ready, awarded, counters } or null. Never throws.
async function badgeEvent(userId, body){
  if (!userId || !badgesOn()) { if (!badgesOn()) warnOnce('off', 'REBEL_BADGES_KEY not set - badges are off'); return null; }
  const payload = { userId: String(userId) };
  if (body && Array.isArray(body.award) && body.award.length) payload.award = body.award.slice(0, 40);
  if (body && Array.isArray(body.counters) && body.counters.length) payload.counters = body.counters.slice(0, 40);
  if (body && body.context) payload.context = body.context;
  if (!payload.award && !payload.counters) return null;
  const r = await call('/api/internal/badges', { method: 'POST', key: badgesKey(), body: payload });
  if (!r || r.status !== 200 || !r.json || r.json.ok === false) {
    warnOnce('badgeEvent', 'economy answered ' + (r ? r.status : 'nothing'));
    return null;
  }
  return r.json;
}

// GET /api/internal/badges?userId=&app=builder (userId "_" = catalog only). Never throws.
async function readBadges(userId){
  if (!badgesOn()) return null;
  const r = await call('/api/internal/badges?userId=' + encodeURIComponent(userId || '_') + '&app=' + APP, { key: badgesKey() });
  if (!r || r.status !== 200 || !r.json || r.json.ok === false) return null;
  return r.json;
}

// The `awarded` list to hand back to the page ([] when nothing / off)
function awardedOf(out){
  return (out && Array.isArray(out.awarded)) ? out.awarded.map(a => ({
    id: a.id, name: a.name, tier: a.tier, tierLabel: a.tierLabel, app: a.app
  })) : [];
}

// Convenience: badges for whoever is signed in on this request -> awarded[]
async function badgesFor(req, body){
  try {
    if (!badgesOn()) return [];
    const u = await rebelUser(req);
    if (!u || !u.userId) return [];
    return awardedOf(await badgeEvent(u.userId, body));
  } catch (e) { warnOnce('badgesFor', String((e && e.message) || e)); return []; }
}

// "name:<slug>" (just signed in, cookie not on this request yet) -> userId
async function userIdForPlayerId(playerId){
  try { const u = await resolveName(playerId); return u ? u.userId : null; } catch { return null; }
}

// "Commander on Deck" (build.signin) once per player: a KV marker keeps it to
// one economy call; the marker is set only once the economy answered.
async function signinBadge(userId){
  if (!userId || !badgesOn()) return [];
  try {
    const { kvGet, kvSet } = require('./redisAdapter');
    const mark = 'ra:badges:signin:' + userId;
    try { if (await kvGet(mark)) return []; } catch(_){}
    const out = await badgeEvent(userId, { award: ['build.signin'] });
    if (!out) return [];
    try { await kvSet(mark, 1); } catch(_){}
    return awardedOf(out);
  } catch (e) { warnOnce('signinBadge', String((e && e.message) || e)); return []; }
}

// Hour of the day in Eastern time (0-23)
function easternHour(d = new Date()){
  try {
    const h = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(d);
    return parseInt(h, 10) % 24;
  } catch { return -1; }
}

const isRebelAntsContract = (c) => REBEL_ANTS_CONTRACTS.includes(String(c || '').toLowerCase());

module.exports = {
  ECONOMY_SESSION_COOKIE, REBEL_ANTS_CONTRACTS, economyBase, badgesOn,
  rebelIdentity, rebelUser, badgeEvent, readBadges, awardedOf, badgesFor,
  userIdForPlayerId, signinBadge,
  easternHour, isRebelAntsContract, withTimeout
};
