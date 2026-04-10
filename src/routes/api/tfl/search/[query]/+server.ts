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

  const query = params.query?.trim();
  if (!query || query.length < 2) return json({ matches: [] });

  const url = new URL(`https://api.tfl.gov.uk/StopPoint/Search/${encodeURIComponent(query)}`);
  url.searchParams.set('modes', 'bus');
  url.searchParams.set('maxResults', '10');
  if (env.TFL_APP_KEY) url.searchParams.set('app_key', env.TFL_APP_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) return json({ error: `TFL API: ${res.status}` }, { status: res.status });

  const data = await res.json();
  const matches = (data.matches ?? []).map((m: any) => ({
    id: m.id,
    name: m.name,
  }));

  return json({ matches }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
  });
};
