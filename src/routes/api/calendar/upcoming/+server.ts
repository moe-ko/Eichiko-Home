import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import ical from 'node-ical';
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

export const GET: RequestHandler = async ({ request }) => {
  if (!isAllowedOrigin(request)) return json({ error: 'Forbidden' }, { status: 403 });

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
  } catch {
    return json({ error: 'Failed to fetch calendar' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  if (!res.ok) {
    return json({ error: `Calendar fetch error: ${res.status}` }, {
      status: res.status,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

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
