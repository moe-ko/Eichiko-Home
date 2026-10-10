import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

const SEARCH_MODES = new Set([
  'bus',
  'tube',
  'dlr',
  'overground',
  'elizabeth-line',
  'tram',
  'river-bus',
  'cable-car',
]);

export const GET: RequestHandler = async ({ params, request, url: reqUrl }) => {
  if (!isAllowedOrigin(request)) return forbidden();

  const query = params.query?.trim() ?? '';
  if (!query || query.length < 2) return json({ matches: [] });
  if (query.length > 100) return json({ error: 'Invalid parameter' }, { status: 400 });

  // Optional mode filter, defaults to bus so existing callers are unchanged
  const rawModes = reqUrl.searchParams.get('modes') ?? 'bus';
  if (rawModes.length > 100 || rawModes.split(',').some((m) => !SEARCH_MODES.has(m))) {
    return json({ error: 'Invalid parameter' }, { status: 400 });
  }

  const url = new URL(`https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(query)}`);
  url.searchParams.set('modes', rawModes);
  url.searchParams.set('maxResults', '10');
  if (env.TFL_APP_KEY) url.searchParams.set('app_key', env.TFL_APP_KEY);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return upstreamError('tfl-search', res.status);

    const data = await res.json();
    const matches = (data.matches ?? []).map((m: any) => ({
      id: m.id,
      name: m.name,
      modes: m.modes ?? [],
    }));

    return json({ matches }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
    });
  } catch (e) {
    return upstreamError('tfl-search', e);
  }
};
