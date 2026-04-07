export interface TrainService {
  std: string;
  etd: string;
  platform: string | null;
  operator: string;
  destination: string;
}

export async function getDepartures(crsCode: string, numRows: number = 8, platform: string | null = null): Promise<TrainService[]> {
  const res = await fetch(`/api/rail/departures/${crsCode}?numRows=${numRows}`);
  if (!res.ok) throw new Error(`Rail API error: ${res.status}`);
  const data = await res.json();

  return (data.trainServices ?? [])
    .filter((svc: any) => platform === null || svc.platform === platform)
    .map((svc: any) => ({
      std: svc.std,
      etd: svc.etd,
      platform: svc.platform ?? null,
      operator: svc.operator,
      destination: svc.destination?.map((d: any) => d.locationName).join(', ') ?? 'Unknown',
    }));
}
