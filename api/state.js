import { get, put } from '@vercel/blob';

const STATE_BLOB_PATH = 'state/competition-db-v4.json';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(503).json({
      error: 'BLOB_READ_WRITE_TOKEN not configured',
      state: null,
    });
  }

  try {
    if (req.method === 'GET') {
      try {
        const result = await get(STATE_BLOB_PATH, {
          access: 'public',
          useCache: false,
          token,
        });

        if (!result || result.statusCode !== 200 || !result.stream) {
          return res.status(200).json({ state: null });
        }

        const text = await new Response(result.stream).text();
        const parsed = JSON.parse(text);
        return res.status(200).json({ state: parsed });
      } catch (err) {
        if (err && (err.name === 'BlobNotFoundError' || String(err.message).includes('not found'))) {
          return res.status(200).json({ state: null });
        }
        return res.status(200).json({ state: null });
      }
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const state = body?.state;

      if (!state || typeof state !== 'object') {
        return res.status(400).json({ error: 'Invalid state payload' });
      }

      await put(STATE_BLOB_PATH, JSON.stringify(state), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 0,
        token,
      });

      return res.status(200).json({
        ok: true,
        lastUpdatedAt: state.lastUpdatedAt || Date.now(),
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error in /api/state:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
