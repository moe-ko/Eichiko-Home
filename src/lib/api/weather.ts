export async function getLondonWeather(): Promise<any> {
  const res = await fetch('/api/weather');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Weather API error: ${res.status}`);
  }
  return res.json();
}
