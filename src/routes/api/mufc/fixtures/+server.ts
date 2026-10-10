import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

const MAN_UTD_TEAM_ID = 66;
const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

export const GET: RequestHandler = async ({ request, url }) => {
  if (!isAllowedOrigin(request)) return forbidden();

  const apiKey = env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return json({ error: 'Missing FOOTBALL_DATA_API_KEY' }, { status: 500 });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 3);
    const dateTo = futureDate.toISOString().split('T')[0];

    const fetchUrl = `${FOOTBALL_DATA_BASE}/teams/${MAN_UTD_TEAM_ID}/matches?dateFrom=${today}&dateTo=${dateTo}&limit=50`;

    const res = await fetch(fetchUrl, {
      headers: {
        'X-Auth-Token': apiKey,
      },
    });

    if (!res.ok) {
      console.error('[mufc:fixtures] API error:', res.status, await res.text());
      return upstreamError('football-data', res.status);
    }

    const data = await res.json();
    return json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
    });
  } catch (e) {
    console.error('[mufc:fixtures]', e);
    return upstreamError('football-data', e);
  }
};
