// GET /api/shop/open?return=<a path here> -> the Rebel points shop (packs by card, in APE or in ETH):
// the same shop as the Playground, The Underground and Rebel Universe. A signed-in player (Commander
// name or Discord) lands on it signed in (a 2-minute ticket from the economy); anyone else signs in
// there. The shop's Back link returns here. Points bought there go to the same Rebel account.
const { rebelUser, shopTicket, economyBase } = require('../_lib/rebel');

// a path on this site only (never another host)
function safePath(raw){
  const v = String(raw || '');
  return /^\/(?![\/\\])[A-Za-z0-9\-._~%&=+,:@\/?#]{0,500}$/.test(v) ? v : '/';
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }
  const origin = String(process.env.BUILDER_PUBLIC_ORIGIN || 'https://builder.rebelants.io').replace(/\/+$/, '');
  const q = (req.query && req.query.return) || '';
  const back = origin + safePath(q);
  let url = null;
  try {
    const who = await rebelUser(req);
    if (who && who.userId) url = await shopTicket(who.userId, back);
  } catch (_) { url = null; }
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.statusCode = 302;
  res.setHeader('Location', url || (economyBase() + '/shop?return=' + encodeURIComponent(back)));
  return res.end();
};
