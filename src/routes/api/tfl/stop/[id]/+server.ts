import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') ?? '';
  const referer = request.headers.get('referer') ?? '';
  const source = origin || referer;
  return (
    source === '' ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(source) ||
    /^https:\/\/[^/]+\.netlify\.app/.test(source)
  );
}

export const GET: RequestHandler = async ({ params, request }) => {
  if (!isAllowedOrigin(request)) return json({ error: 'Forbidden' }, { status: 403 });
  if (!/^[A-Za-z0-9]+$/.test(params.id)) return json({ error: 'Invalid stop ID' }, { status: 400 });

  const url = new URL(`https://api.tfl.gov.uk/StopPoint/${params.id}`);
  if (env.TFL_APP_KEY) url.searchParams.set('app_key', env.TFL_APP_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) return json({ error: `TFL API: ${res.status}` }, { status: res.status });

  const data = await res.json();

  // If this is a parent/group stop with children, return them so the user can pick the right one
  const children = (data.children ?? [])
    .filter((c: any) => c.stopType === 'NaptanPublicBusCoachTram' || c.stopType === 'NaptanOnstreetBusCoachStopPair' || c.modes?.includes('bus'))
    .map((c: any) => ({
      naptanId: c.naptanId ?? c.id,
      stopLetter: c.stopLetter ?? c.indicator ?? null,
      commonName: c.commonName ?? null,
      towards: c.additionalProperties?.find((p: any) => p.key === 'Towards')?.value ?? null,
    }));

  return json({
    stopLetter: data.stopLetter ?? data.indicator ?? null,
    commonName: data.commonName ?? null,
    naptanId: data.naptanId ?? params.id,
    children: children.length > 0 ? children : null,
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' }
  });
};
