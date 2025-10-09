// Proxies a file upload to Vercel Blob.
// Requires BLOB_READ_WRITE_TOKEN in env.
// Client sends multipart/form-data with field "file".

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'method' });
    }
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return res.status(500).json({ error: 'blob-token-missing' });

    // Forward the original multipart body to Vercel Blob
    const upstream = await fetch('https://blob.vercel-storage.com/upload', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': req.headers['content-type'] || 'application/octet-stream'
      },
      body: req
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data); // { url, pathname, ... }
  } catch (e) {
    console.error('[upload]', e);
    return res.status(500).json({ error: 'server' });
  }
};
