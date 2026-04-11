export async function getWeather(location: string): Promise<any> {
  const res = await fetch(`/api/weather?location=${encodeURIComponent(location)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Weather API error: ${res.status}`);
  }
  return res.json();
}

export interface WeatherLocation {
  name: string;
  state?: string;
  country: string;
  display: string;
  query: string;
}

export async function searchWeatherLocations(query: string): Promise<WeatherLocation[]> {
  const res = await fetch(`/api/weather?search=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}
