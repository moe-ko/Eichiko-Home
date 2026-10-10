import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

const STOP_ID_RE = /^[A-Za-z0-9]{1,30}$/;

// Station-level stop types that return live arrivals (berths and bus stops do not)
const STATION_TYPES = new Set(['NaptanMetroStation', 'NaptanRailStation', 'NaptanFerryPort']);

const STATION_MODES = new Set([
  'tube',
  'dlr',
  'overground',
  'elizabeth-line',
  'tram',
  'river-bus',
  'cable-car',
  'national-rail',
]);

const MAX_DEPTH = 3;

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
    if (!res.ok) return upstreamError('tfl-stations', res.status);

    const data = await res.json();

    // TfL returns the whole hub tree even for a child ID, so walk it and keep every station
    const stations: { naptanId: string; name: string; modes: string[]; lines: string[] }[] = [];
    const seen = new Set<string>();
    const walk = (node: any, depth: number) => {
      if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return;
      const naptanId = node.naptanId;
      const modes = (Array.isArray(node.modes) ? node.modes : []).filter((m: any) => STATION_MODES.has(m));
      if (
        STATION_TYPES.has(node.stopType) &&
        modes.length > 0 &&
        typeof naptanId === 'string' &&
        STOP_ID_RE.test(naptanId) &&
        !seen.has(naptanId)
      ) {
        seen.add(naptanId);
        stations.push({
          naptanId,
          name: node.commonName ?? naptanId,
          modes,
          lines: (Array.isArray(node.lines) ? node.lines : [])
            .map((l: any) => l?.id)
            .filter((l: any) => typeof l === 'string'),
        });
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) walk(child, depth + 1);
      }
    };
    walk(data, 0);

    return json({ stations }, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800' }
    });
  } catch (e) {
    return upstreamError('tfl-stations', e);
  }
};
