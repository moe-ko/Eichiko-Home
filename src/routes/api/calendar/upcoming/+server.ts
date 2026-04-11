import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import ical from 'node-ical';
import type { RequestHandler } from './$types';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

export const GET: RequestHandler = async ({ request }) => {
  if (!isAllowedOrigin(request)) return forbidden();

  const icsUrl = env.GOOGLE_CALENDAR_ICS_URL;
  if (!icsUrl) {
    return json({ error: 'Calendar not configured' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  let res: Response;
  try {
    res = await fetch(icsUrl, { signal: AbortSignal.timeout(8000) });
  } catch (e) {
    return upstreamError('calendar', e);
  }

  if (!res.ok) return upstreamError('calendar', res.status);

  const text = await res.text();
  const parsed = ical.parseICS(text);

  const now = new Date();
  const events = Object.values(parsed)
    .filter((entry: any): entry is any => entry.type === 'VEVENT')
    .filter(ev => new Date(ev.start) >= now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 10)
    .map(ev => ({
      start: new Date(ev.start).toISOString(),
      end: new Date(ev.end).toISOString(),
      summary: ev.summary ?? '',
      location: ev.location ?? '',
      description: ev.description ?? ''
    }));

  return json(events, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
  });
};
