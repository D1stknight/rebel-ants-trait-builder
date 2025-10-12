// api/contest/vote.js  (CommonJS)
exports.config = { runtime: 'nodejs' };

const crypto = require('crypto');
const {
  getActiveContestId,
  addVote,
  kvGet,
  kvSet,
} = require('../_lib/redisAdapter');

const ALLOWED = ['👍','❤️','🔥','😂','😮'];

// Small JSON body reader for Node.js API routes
function readJSON(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function clientFingerprint(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(ip + '|' + ua).digest('hex').slice(0, 16);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { entryId, emoji } = await readJSON(req);
    if (!entryId || !emoji) { res.status(400).json({ ok:false, error:'missing entryId/emoji' }); return; }
    if (!ALLOWED.includes(emoji)) { res.status(400).json({ ok:false, error:'bad emoji' }); return; }

    const contestId = await getActiveContestId();
    if (!contestId) { res.status(400).json({ ok:false, error:'no active contest' }); return; }

    // Server-side duplicate guard (1 per emoji per entry per client)
    const fp = clientFingerprint(req);
    const lockKey = `ra:contest:${contestId}:vote:${entryId}:${emoji}:${fp}`;
    if (await kvGet(lockKey)) {
      res.status(200).json({ ok:false, duplicate:true });
      return;
    }
    await kvSet(lockKey, 1); // no TTL needed; contestId changes for new contests

    const votes = await addVote(contestId, entryId, emoji);
    const score = Object.values(votes||{}).reduce((a,b)=>a+(b|0),0);
    res.status(200).json({ ok:true, votes, score });
  } catch (e) {
    console.error('[vote]', e);
    res.status(500).json({ ok:false, error: String(e && e.message || e) });
  }
};
