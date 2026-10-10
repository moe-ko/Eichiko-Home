// Normalize station names for exact matching (remove prefixes/suffixes)
export function normalizeStationName(name: string): string {
  return name
    .toUpperCase()
    .replace(/^LONDON\s+/, '')
    .replace(/\s+(UNDERGROUND|RAIL|DLR)\s+STATION$/, '')
    .replace(/\s+STATION$/, '')
    .replace(/\s+UNDERGROUND$/, '')
    .trim();
}
