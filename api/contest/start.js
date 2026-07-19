// api/contest/start.js
const { setActiveContest } = require('../_lib/redisAdapter');

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => (s += c));
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  try {
    const { isAdminRequest } = require('../_lib/adminAuth');
    const hdr = String(req.headers['x-admin'] || '').trim();
    const legacyHdr = !!(process.env.RA_ADMIN_KEY && hdr && hdr === process.env.RA_ADMIN_KEY);
    if (!legacyHdr && !isAdminRequest(req)) {
      res.status(401).json({ ok:false, error:'unauthorized' }); return;
    }

    let name, prompt, durationDays;
    if (req.method === 'POST') {
      const body = await readJSON(req).catch(() => ({}));
      name = body.name; prompt = body.prompt; durationDays = body.durationDays;
    } else if (req.method === 'GET') {
      name = req.query.name; prompt = req.query.prompt; durationDays = req.query.days;
    } else {
      res.status(405).send('Method Not Allowed'); return;
    }

    const now = Date.now();
    const days = Math.max(1, parseInt(durationDays || 7, 10));
    const id = Math.random().toString(36).slice(2, 10);
    const meta = {
      id,
      name: (name || 'Rebel Ants Weekly Contest').toString(),
      prompt: (prompt || 'Share your best overlay combo!').toString(),
      startTs: now,
      endTs: now + days * 864e5
    };

    await setActiveContest(meta);
    res.status(200).json({ ok:true, contest: meta });
  } catch (e) {
    console.error('[start]', e);
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
};
