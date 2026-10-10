export async function getAllLineStatusByMode(modes: string[]): Promise<any[]> {
  const res = await fetch(`/api/tfl/line-status/${modes.join(',')}`);
  if (!res.ok) throw new Error(`TFL API error: ${res.status}`);
  return res.json();
}

export async function getStopArrivals(stopId: string): Promise<any[]> {
  const res = await fetch(`/api/tfl/arrivals/${encodeURIComponent(stopId)}`);
  if (!res.ok) throw new Error(`TFL API error: ${res.status}`);
  return res.json();
}

export async function getStationDisruptions(): Promise<any[]> {
  const modes = 'tube,overground,elizabeth-line,dlr,bus,national-rail';
  const res = await fetch(`/api/tfl/stop-disruption/${modes}`);
  if (!res.ok) throw new Error(`TFL API error: ${res.status}`);
  return res.json();
}
