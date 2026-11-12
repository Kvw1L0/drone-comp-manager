import { get, put } from '@vercel/blob';

// Bumped to v9 to guarantee fresh clean start
const STATE_BLOB_PATH = 'state/competition-db-v9.json';

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

        // Safety verification: if stored state has old mock pilots (Matías Rojas / AeroTech) or more than 31 pilots, discard it
        const hasOldPilots = parsed?.participants?.some(
          (p) => p.companyOrTeam === 'AeroTech Chile' || p.fullName === 'Matías Rojas Valdés'
        ) || (parsed?.participants?.length && parsed?.participants?.length !== 31);

        if (hasOldPilots) {
          return res.status(200).json({ state: null });
        }

        return res.status(200).json({ state: parsed });
      } catch (err) {
        return res.status(200).json({ state: null });
      }
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const state = body?.state;

      if (!state || typeof state !== 'object') {
        return res.status(400).json({ error: 'Invalid state payload' });
      }

      // Never allow old mock pilots to be written
      const hasOldPilots = state.participants?.some(
        (p) => p.companyOrTeam === 'AeroTech Chile' || p.fullName === 'Matías Rojas Valdés'
      );
      if (hasOldPilots) {
        return res.status(400).json({ error: 'Cannot save legacy mock pilots' });
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
