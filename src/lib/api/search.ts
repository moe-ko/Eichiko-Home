export async function searchBusStops(query: string): Promise<{ id: string; name: string }[]> {
  if (!query || query.trim().length < 2) return [];
  const res = await fetch(`/api/tfl/search/${encodeURIComponent(query.trim())}`);
  if (!res.ok) throw new Error(`Search API error: ${res.status}`);
  const data = await res.json();
  return data.matches ?? [];
}

export interface StopChild {
  naptanId: string;
  stopLetter: string | null;
  commonName: string | null;
  towards: string | null;
}

export async function getStopDetails(stopId: string): Promise<{ stopLetter: string | null; commonName: string | null; naptanId: string; children: StopChild[] | null }> {
  const res = await fetch(`/api/tfl/stop/${encodeURIComponent(stopId)}`);
  if (!res.ok) throw new Error(`Stop details error: ${res.status}`);
  return res.json();
}
