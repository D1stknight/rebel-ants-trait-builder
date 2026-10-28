// api/badges/me.js — the Builder's badge list for whoever is signed in
// (Commander name + PIN or Discord), or the catalog only (userId "_").
// GET -> { ok, enabled, signedIn, userId, displayName, wallUrl, badges, toGo, catalog }
const { rebelUser, readBadges, badgesOn, economyBase } = require('../_lib/rebel');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }
  const wallBase = economyBase() + '/badges/';
  if (!badgesOn()) return res.status(200).json({ ok: true, enabled: false, signedIn: false, badges: [], toGo: {}, catalog: [], wallUrl: economyBase() + '/badges?from=builder' });
  let who = null;
  try { who = await rebelUser(req); } catch (_) {}
  const userId = (who && who.userId) || null;
  const data = await readBadges(userId || '_');
  if (!data) return res.status(200).json({ ok: false, enabled: true, error: 'economy_unavailable', signedIn: !!who });
  return res.status(200).json({
    ok: true, enabled: true, artBase: economyBase(),
    signedIn: !!who, userId,
    displayName: (who && who.displayName) || null,
    wallUrl: userId ? (wallBase + encodeURIComponent(userId) + '?from=builder') : (economyBase() + '/badges?from=builder'),
    badges: userId ? (Array.isArray(data.badges) ? data.badges : []) : [],
    toGo: userId ? (data.toGo || {}) : {},
    catalog: Array.isArray(data.catalog) ? data.catalog : []
  });
};
