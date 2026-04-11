import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

const CRS_RE = /^[A-Z]{3}$/i;
const NUM_ROWS_RE = /^\d{1,2}$/;

export const GET: RequestHandler = async ({ params, url, request }) => {
  if (!isAllowedOrigin(request)) return forbidden();

  const crs = params.crs?.toUpperCase() ?? '';
  if (!CRS_RE.test(crs)) {
    return json({ error: 'Invalid parameter' }, { status: 400 });
  }

  const numRows = url.searchParams.get('numRows') ?? '8';
  if (!NUM_ROWS_RE.test(numRows)) {
    return json({ error: 'Invalid parameter' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://hux.azurewebsites.net/departures/${crs}/${numRows}?expand=false`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return upstreamError('huxley', res.status);
    return json(await res.json(), {
      headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40' }
    });
  } catch (e) {
    return upstreamError('huxley', e);
  }
};
