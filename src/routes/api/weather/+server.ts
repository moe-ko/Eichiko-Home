import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { isAllowedOrigin, forbidden, upstreamError, checkRateLimit } from '$lib/server/security';

async function fetchWeather(location: string, apiKey: string) {
  const [weatherRes, forecastRes] = await Promise.all([
    fetch(`https://api.openweathermap.org/data/2.5/weather?q=${location}&units=metric&appid=${apiKey}`),
    fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${location}&units=metric&cnt=2&appid=${apiKey}`),
  ]);

  if (!weatherRes.ok) throw new Error(`Weather API error: ${weatherRes.status}`);

  const current = await weatherRes.json();
  let pop = 0;
  if (forecastRes.ok) {
    const forecast = await forecastRes.json();
    pop = forecast.list?.[0]?.pop ?? 0;
  }

  return { ...current, pop };
}

export async function GET({ request, url }: { request: Request; url: URL }) {
  if (!isAllowedOrigin(request)) return forbidden();

  const apiKey = env.OPENWEATHER_API_KEY;
  if (!apiKey) return json({ error: 'Missing OPENWEATHER_API_KEY' }, { status: 500 });

  const location = url.searchParams.get('location');
  const search = url.searchParams.get('search');

  if (search) {
    // Rate limit geocoding searches
    const rateLimit = checkRateLimit(request.headers.get('cf-connecting-ip') ?? 'unknown');
    if (!rateLimit.ok) {
      return json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } });
    }
    // Input validation: limit search length
    const safeSearch = search.length > 100 ? search.slice(0, 100) : search;
    const geoRes = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(safeSearch)}&limit=5&appid=${apiKey}`
    );
    if (!geoRes.ok) return upstreamError('openweather', geoRes.status);
    const geo = await geoRes.json();
    const results = geo.map((g: any) => ({
      name: g.name,
      state: g.state,
      country: g.country,
      display: `${g.name}${g.state ? ', ' + g.state : ''}, ${g.country}`,
      query: `${g.name},${g.country}`,
    }));
    return json({ results });
  }

  if (!location) {
    return json({ error: 'Missing location param' }, { status: 400 });
  }

  try {
    const data = await fetchWeather(location, apiKey);
    return json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
    });
  } catch (e) {
    return upstreamError('openweather', e);
  }
}
