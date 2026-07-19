// api/auth/me.js — current session + $REBEL balance + AI pricing info.
const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('../_lib/nameSession');
const { resolveByPlayerId, billingConfigured } = require('../_lib/economy');

module.exports = async (req, res) => {
  const costPerGen = Math.max(0, parseInt(process.env.REBEL_COST_PER_GEN || '25', 10) || 0);
  const playerId = verifyNameSession(readCookie(req, NAME_SESSION_COOKIE));
  if (!playerId) return res.status(200).json({ ok:true, signedIn:false, costPerGen, billing: billingConfigured() });
  const user = await resolveByPlayerId(playerId);
  return res.status(200).json({
    ok: true, signedIn: true, playerId,
    name: playerId.slice('name:'.length),
    displayName: (user && user.displayName) || null,
    balance: user ? user.balance : null,
    costPerGen, billing: billingConfigured()
  });
};
