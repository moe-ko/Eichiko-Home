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

async function fetchModeDisruptions(mode: string): Promise<unknown[]> {
  const url = new URL(`https://api.tfl.gov.uk/StopPoint/Mode/${mode}/Disruption`);
  if (env.TFL_APP_KEY) url.searchParams.set('app_key', env.TFL_APP_KEY);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Response is not an array');
  return data;
}

export const GET: RequestHandler = async ({ params, request }) => {
  if (!isAllowedOrigin(request)) return forbidden();

  const raw = params.modes ?? '';
  if (raw.length === 0 || raw.length > 100) {
    return json({ error: 'Invalid parameter' }, { status: 400 });
  }
  const modes = [...new Set(raw.split(','))];
  if (modes.length === 0 || modes.some((m) => !ALLOWED_MODES.has(m))) {
    return json({ error: 'Invalid parameter' }, { status: 400 });
  }

  // TfL silently returns only bus results when several modes share one request, so fetch each mode separately.
  const results = await Promise.allSettled(modes.map(fetchModeDisruptions));

  const merged: unknown[] = [];
  const failures: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      merged.push(...result.value);
    } else {
      console.error('[tfl:stop-disruption]', modes[i], result.reason);
      failures.push(`${modes[i]}: ${String(result.reason)}`);
    }
  });

  if (failures.length === modes.length) {
    return upstreamError('tfl-stop-disruption', failures.join('; '));
  }

  return json(merged, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
  });
};
