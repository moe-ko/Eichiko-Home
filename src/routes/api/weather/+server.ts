import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

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

export async function GET({ request }: { request: Request }) {
  if (!isAllowedOrigin(request)) return json({ error: 'Forbidden' }, { status: 403 });

  const apiKey = env.OPENWEATHER_API_KEY;
  if (!apiKey) return json({ error: 'Missing OPENWEATHER_API_KEY' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });

  const [weatherRes, forecastRes] = await Promise.all([
    fetch(`https://api.openweathermap.org/data/2.5/weather?q=Greenwich,GB&units=metric&appid=${apiKey}`),
    fetch(`https://api.openweathermap.org/data/2.5/forecast?q=Greenwich,GB&units=metric&cnt=2&appid=${apiKey}`),
  ]);

  if (!weatherRes.ok) return json({ error: `Weather API: ${weatherRes.status}` }, { status: weatherRes.status, headers: { 'Cache-Control': 'no-store' } });

  const current = await weatherRes.json();

  // pop (probability of precipitation) is 0-1, only in forecast endpoint
  let pop = 0;
  if (forecastRes.ok) {
    const forecast = await forecastRes.json();
    pop = forecast.list?.[0]?.pop ?? 0;
  }

  return json({ ...current, pop }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
  });
}
