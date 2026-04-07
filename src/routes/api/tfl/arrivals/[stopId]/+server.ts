import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') ?? '';
  const referer = request.headers.get('referer') ?? '';
  const source = origin || referer;
  return (
    source === '' || // same-origin SSR requests
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(source) ||
    /^https:\/\/[^/]+\.netlify\.app/.test(source)
  );
}

export const GET: RequestHandler = async ({ params, request }) => {
  if (!isAllowedOrigin(request)) return json({ error: 'Forbidden' }, { status: 403 });
  if (!/^[A-Za-z0-9]+$/.test(params.stopId)) return json({ error: 'Invalid stop ID' }, { status: 400 });

  const url = new URL(`https://api.tfl.gov.uk/StopPoint/${params.stopId}/Arrivals`);
  if (env.TFL_APP_KEY) url.searchParams.set('app_key', env.TFL_APP_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) return json({ error: `TFL API: ${res.status}` }, { status: res.status });
  return json(await res.json(), {
    headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' }
  });
};
