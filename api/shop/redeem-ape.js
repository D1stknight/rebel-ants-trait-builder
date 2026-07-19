// api/shop/redeem-ape.js — verify an ApeChain payment tx and credit $REBEL.
// POST { txHash, packageId } (signed-in commander required).
// Verifies on-chain: to == treasury, value >= package price, receipt success.
// Idempotent per txHash (ra:apetx:<hash> in KV).
const { kvGet, kvSet } = require('../_lib/redisAdapter');
const { verifyNameSession, readCookie, NAME_SESSION_COOKIE } = require('../_lib/nameSession');
const { resolveByPlayerId, credit, billingConfigured } = require('../_lib/economy');

const RPCS = [process.env.RA_APE_RPC, 'https://apechain.calderachain.xyz/http', 'https://rpc.apechain.com/http'].filter(Boolean);

async function rpc(method, params){
  for (const url of RPCS){
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });
      const j = await r.json().catch(() => null);
      if (j && 'result' in j) return j.result;
    } catch(_){}
  }
  return null;
}
async function getPackages(){
  let packages = [
    { id: 'starter', name: 'Starter',  ape: '5',  apeWei: '5000000000000000000',  rebel: 500 },
    { id: 'builder', name: 'Builder',  ape: '12', apeWei: '12000000000000000000', rebel: 1500 },
    { id: 'warlord', name: 'Warlord',  ape: '25', apeWei: '25000000000000000000', rebel: 4000 }
  ];
  try {
    const raw = process.env.RA_APE_PACKAGES;
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) packages = p; }
  } catch(_){}
  return packages;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok:false, error:'method_not_allowed' }); }
  const playerId = verifyNameSession(readCookie(req, NAME_SESSION_COOKIE));
  if (!playerId) return res.status(401).json({ ok:false, error:'sign_in_required' });
  if (!billingConfigured()) return res.status(503).json({ ok:false, error:'economy_not_configured' });
  const treasury = (process.env.RA_TREASURY_ADDRESS || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(treasury)) return res.status(503).json({ ok:false, error:'treasury_not_configured' });

  let body = {};
  try { body = (typeof req.body === 'string') ? JSON.parse(req.body) : (req.body || {}); } catch(_){}
  const txHash = String(body.txHash || '').trim().toLowerCase();
  const packageId = String(body.packageId || '').trim();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) return res.status(400).json({ ok:false, error:'bad_tx_hash' });
  const pkg = (await getPackages()).find(p => p.id === packageId);
  if (!pkg) return res.status(400).json({ ok:false, error:'unknown_package' });

  // Idempotency
  const usedKey = 'ra:apetx:' + txHash;
  const used = await kvGet(usedKey);
  if (used) return res.status(409).json({ ok:false, error:'tx_already_redeemed' });

  const tx = await rpc('eth_getTransactionByHash', [txHash]);
  if (!tx) return res.status(200).json({ ok:false, pending:true, error:'tx_not_found_yet' });
  if (String(tx.to || '').toLowerCase() !== treasury) return res.status(400).json({ ok:false, error:'wrong_recipient' });
  if (BigInt(tx.value || '0x0') < BigInt(pkg.apeWei)) return res.status(400).json({ ok:false, error:'insufficient_amount' });

  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt) return res.status(200).json({ ok:false, pending:true, error:'awaiting_confirmation' });
  if (receipt.status !== '0x1') return res.status(400).json({ ok:false, error:'tx_failed' });

  const user = await resolveByPlayerId(playerId);
  if (!user) return res.status(502).json({ ok:false, error:'economy_unreachable' });

  // Mark used BEFORE credit to close the double-spend race; roll back if credit fails.
  await kvSet(usedKey, { playerId, packageId, ts: Date.now() });
  const c = await credit({
    userId: user.userId, amount: pkg.rebel, type: 'ape_purchase',
    reason: 'APE package ' + pkg.name + ' (' + pkg.ape + ' APE)',
    idempotencyKey: 'apetx-' + txHash,
    metadata: { txHash, packageId, playerId }
  });
  if (!c.ok) {
    try { await kvSet(usedKey, null); } catch(_){}
    return res.status(502).json({ ok:false, error:'credit_failed' });
  }
  return res.status(200).json({ ok:true, credited: pkg.rebel, newBalance: (c.balance != null && !Number.isNaN(c.balance)) ? c.balance : (user.balance + pkg.rebel) });
};
