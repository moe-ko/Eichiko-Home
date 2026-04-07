import { json } from '@sveltejs/kit';
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

export const GET: RequestHandler = async ({ params, url, request }) => {
  if (!isAllowedOrigin(request)) return json({ error: 'Forbidden' }, { status: 403 });
  if (!/^[A-Za-z]{3}$/.test(params.crs)) return json({ error: 'Invalid CRS code' }, { status: 400 });

  const numRows = url.searchParams.get('numRows') ?? '8';
  const res = await fetch(
    `https://hux.azurewebsites.net/departures/${params.crs}/${numRows}?expand=false`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) return json({ error: `Rail API: ${res.status}` }, { status: res.status });
  return json(await res.json(), {
    headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' }
  });
};
