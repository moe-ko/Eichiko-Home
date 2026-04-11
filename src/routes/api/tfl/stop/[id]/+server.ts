import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

const STOP_ID_RE = /^[A-Za-z0-9]{1,30}$/;

export const GET: RequestHandler = async ({ params, request }) => {
  if (!isAllowedOrigin(request)) return forbidden();

  const id = params.id ?? '';
  if (!STOP_ID_RE.test(id)) {
    return json({ error: 'Invalid parameter' }, { status: 400 });
  }

  const url = new URL(`https://api.tfl.gov.uk/StopPoint/${id}`);
  if (env.TFL_APP_KEY) url.searchParams.set('app_key', env.TFL_APP_KEY);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return upstreamError('tfl-stop', res.status);

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
      naptanId: data.naptanId ?? id,
      children: children.length > 0 ? children : null,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' }
    });
  } catch (e) {
    return upstreamError('tfl-stop', e);
  }
};
