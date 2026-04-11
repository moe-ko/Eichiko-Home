import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

const STOP_ID_RE = /^[A-Za-z0-9]{1,30}$/;

export const GET: RequestHandler = async ({ params, request }) => {
  if (!isAllowedOrigin(request)) return forbidden();

  const stopId = params.stopId ?? '';
  if (!STOP_ID_RE.test(stopId)) {
    return json({ error: 'Invalid parameter' }, { status: 400 });
  }

  const url = new URL(`https://api.tfl.gov.uk/StopPoint/${stopId}/Arrivals`);
  if (env.TFL_APP_KEY) url.searchParams.set('app_key', env.TFL_APP_KEY);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return upstreamError('tfl-arrivals', res.status);
    return json(await res.json(), {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' }
    });
  } catch (e) {
    return upstreamError('tfl-arrivals', e);
  }
};
