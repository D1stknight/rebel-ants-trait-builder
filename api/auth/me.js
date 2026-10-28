// api/auth/me.js — current session + $REBEL balance + AI pricing info.
const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('../_lib/nameSession');
const { resolveByPlayerId, billingConfigured } = require('../_lib/economy');
const { adminNames } = require('../_lib/adminAuth');
const { kvGet } = require('../_lib/redisAdapter');
const { rebelIdentity, signinBadge, economyBase } = require('../_lib/rebel');

async function currentAiCost(){
  try {
    const v = await kvGet('ra:settings:aiCost');
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  } catch(_){}
  return Math.max(0, parseInt(process.env.REBEL_COST_PER_GEN || '25', 10) || 0);
}

module.exports = async (req, res) => {
  const costPerGen = await currentAiCost();
  const playerId = verifyNameSession(readCookie(req, NAME_SESSION_COOKIE));
  if (!playerId) {
    // Shared Rebel sign-in (Discord on economy.rebelants.io): stable playerId
    // "rebel:<economy userId>" so shelves/sharing/billing work the same way.
    const who = await rebelIdentity(req);
    if (who && who.via === 'discord') {
      const awarded = await signinBadge(who.userId);
      return res.status(200).json({
        ok: true, signedIn: true, via: 'discord', playerId: who.playerId,
        name: who.displayName, isAdmin: false,
        displayName: who.displayName, userId: who.userId,
        balance: who.balance,
        costPerGen, billing: billingConfigured(), awarded, economyUrl: economyBase()
      });
    }
    return res.status(200).json({ ok:true, signedIn:false, costPerGen, billing: billingConfigured(), economyUrl: economyBase() });
  }
  const user = await resolveByPlayerId(playerId);
  const awarded = user ? await signinBadge(user.userId) : [];
  return res.status(200).json({
    ok: true, signedIn: true, playerId,
    name: playerId.slice('name:'.length),
    isAdmin: adminNames().includes(playerId.slice('name:'.length)),
    displayName: (user && user.displayName) || null,
    balance: user ? user.balance : null,
    via: 'name', userId: user ? user.userId : null,
    costPerGen, billing: billingConfigured(), awarded, economyUrl: economyBase()
  });
};
