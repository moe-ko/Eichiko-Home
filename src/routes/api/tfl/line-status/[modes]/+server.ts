import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

const ALLOWED_MODES = new Set([
  'tube',
  'bus',
  'overground',
  'elizabeth-line',
  'dlr',
  'national-rail',
  'tram',
  'river-bus',
  'tflrail',
]);

export const GET: RequestHandler = async ({ params, request }) => {
  if (!isAllowedOrigin(request)) return forbidden();

  const raw = params.modes ?? '';
  if (raw.length === 0 || raw.length > 100) {
    return json({ error: 'Invalid parameter' }, { status: 400 });
  }
  const modes = raw.split(',');
  if (modes.length === 0 || modes.some((m) => !ALLOWED_MODES.has(m))) {
    return json({ error: 'Invalid parameter' }, { status: 400 });
  }

  const url = new URL(`https://api.tfl.gov.uk/Line/Mode/${modes.join(',')}/Status`);
  if (env.TFL_APP_KEY) url.searchParams.set('app_key', env.TFL_APP_KEY);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return upstreamError('tfl-line-status', res.status);
    return json(await res.json(), {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
    });
  } catch (e) {
    return upstreamError('tfl-line-status', e);
  }
};
