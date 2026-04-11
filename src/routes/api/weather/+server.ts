import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { isAllowedOrigin, forbidden, upstreamError } from '$lib/server/security';

export async function GET({ request }: { request: Request }) {
  if (!isAllowedOrigin(request)) return forbidden();

  const apiKey = env.OPENWEATHER_API_KEY;
  if (!apiKey) return json({ error: 'Missing OPENWEATHER_API_KEY' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });

  let weatherRes: Response;
  let forecastRes: Response;
  try {
    [weatherRes, forecastRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=Greenwich,GB&units=metric&appid=${apiKey}`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?q=Greenwich,GB&units=metric&cnt=2&appid=${apiKey}`),
    ]);
  } catch (e) {
    return upstreamError('openweather', e);
  }

  if (!weatherRes.ok) return upstreamError('openweather', weatherRes.status);

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
