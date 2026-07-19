// api/shop/packages.js — APE -> $REBEL package catalog + payment info.
// Override defaults with RA_APE_PACKAGES env (JSON array of
// {id,name,ape,apeWei,rebel}). Treasury wallet from RA_TREASURY_ADDRESS.
const DEFAULTS = [
  { id: 'starter', name: 'Starter',  ape: '5',  apeWei: '5000000000000000000',  rebel: 500 },
  { id: 'builder', name: 'Builder',  ape: '12', apeWei: '12000000000000000000', rebel: 1500 },
  { id: 'warlord', name: 'Warlord',  ape: '25', apeWei: '25000000000000000000', rebel: 4000 }
];
module.exports = async (_req, res) => {
  let packages = DEFAULTS;
  try {
    const raw = process.env.RA_APE_PACKAGES;
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) packages = p; }
  } catch(_){}
  const treasury = (process.env.RA_TREASURY_ADDRESS || '').trim();
  return res.status(200).json({
    ok: true,
    enabled: /^0x[a-fA-F0-9]{40}$/.test(treasury),
    treasury,
    chainId: '0x8173',
    chainName: 'ApeChain',
    rpcUrl: 'https://apechain.calderachain.xyz/http',
    currency: { name: 'ApeCoin', symbol: 'APE', decimals: 18 },
    packages
  });
};
