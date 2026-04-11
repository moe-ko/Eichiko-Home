import { json } from '@sveltejs/kit';

export async function GET() {
  const res = await fetch('https://api.jolpi.ca/ergast/f1/2026/races.json');

  if (!res.ok) {
    return json({ error: `Jolpica API: ${res.status}` }, { status: res.status });
  }

  const data = await res.json();

  return json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
  });
}
