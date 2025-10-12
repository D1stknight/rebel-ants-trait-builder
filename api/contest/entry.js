// api/contest/entry.js
const crypto = require('crypto');
const { getActiveContestId, saveEntry } = require('../_lib/redisAdapter');

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let s=''; req.on('data', c => (s+=c));
    req.on('end', () => { try{ resolve(JSON.parse(s || '{}')); } catch(e){ reject(e); } });
    req.on('error', reject);
  });
}

async function readBuffer(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

    const contestId = await getActiveContestId();
    if (!contestId) { res.status(400).json({ ok:false, error:'no active contest' }); return; }

    const ct = (req.headers['content-type'] || '').toLowerCase();
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2,10);

    let name = (req.query.name || '').toString().slice(0,48) || 'Anonymous';
    let caption = (req.query.caption || '').toString().slice(0,140);
    let url = '';

    if (ct.startsWith('image/')) {
      // Builder sends raw image -> upload to Vercel Blob
      const buf = await readBuffer(req);
      const { put } = await import('@vercel/blob');
      const filename = `contests/${contestId}/${id}.png`;
      const blob = await put(filename, buf, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: 'image/png',
        addRandomSuffix: false
      });
      url = blob.url;
    } else {
      const body = await readJSON(req).catch(() => ({}));
      name = (body.name || name).slice(0,48);
      caption = (body.caption || caption).slice(0,140);
      url = (body.imageUrl || body.url || '').toString();
      if (!url) { res.status(400).json({ ok:false, error:'missing imageUrl/url' }); return; }
    }

    const entry = { id, name, caption, url, ts: Date.now(), votes: {} };
    await saveEntry(contestId, entry);
    res.status(200).json({ ok:true, id, url });
  } catch (e) {
    console.error('[entry]', e);
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
};
