// api/auth/me.js — current session + $REBEL balance + AI pricing info.
const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('../_lib/nameSession');
const { resolveByPlayerId, billingConfigured } = require('../_lib/economy');
const { adminNames } = require('../_lib/adminAuth');
const { kvGet } = require('../_lib/redisAdapter');

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
  if (!playerId) return res.status(200).json({ ok:true, signedIn:false, costPerGen, billing: billingConfigured() });
  const user = await resolveByPlayerId(playerId);
  return res.status(200).json({
    ok: true, signedIn: true, playerId,
    name: playerId.slice('name:'.length),
    isAdmin: adminNames().includes(playerId.slice('name:'.length)),
    displayName: (user && user.displayName) || null,
    balance: user ? user.balance : null,
    costPerGen, billing: billingConfigured()
  });
};
