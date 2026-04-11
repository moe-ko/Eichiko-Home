import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

export const GET: RequestHandler = async ({ request }) => {
  if (!isAllowedOrigin(request)) return forbidden();

  try {
    const res = await fetch('https://api.jolpi.ca/ergast/f1/2026/constructorstandings/');
    if (!res.ok) return upstreamError('jolpica-f1', res.status);
    const data = await res.json();
    return json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
    });
  } catch (e) {
    return upstreamError('jolpica-f1', e);
  }
};