export interface TransportPanel {
  id: string;
  type: 'bus' | 'train';
  label: string;
  stopId?: string;      // NaPTAN ID (bus)
  crs?: string;         // CRS code (train)
  platform?: string | null; // null = ALL
}
