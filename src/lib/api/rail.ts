export interface TrainService {
  std: string;
  etd: string;
  platform: string | null;
  operator: string;
  destination: string;
}

export interface DeparturesResult {
  departures: TrainService[];
  platforms: string[];
}

export async function getDepartures(crsCode: string, numRows: number = 8, platform: string | null = null): Promise<DeparturesResult> {
  const res = await fetch(`/api/rail/departures/${crsCode}?numRows=${numRows}`);
  if (!res.ok) throw new Error(`Rail API error: ${res.status}`);
  const data = await res.json();

  const allServices: any[] = data.trainServices ?? [];

  // Extract all platforms from the raw (unfiltered) response
  const platforms = [...new Set(
    allServices.map((svc) => svc.platform).filter((p): p is string => !!p)
  )].sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
  });

  const departures = allServices
    .filter((svc) => platform === null || svc.platform === platform)
    .map((svc) => ({
      std: svc.std,
      etd: svc.etd,
      platform: svc.platform ?? null,
      operator: svc.operator,
      destination: svc.destination?.map((d: any) => d.locationName).join(', ') ?? 'Unknown',
    }));

  return { departures, platforms };
}
