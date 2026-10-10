export interface TransportPanel {
  id: string;
  type: 'bus' | 'train' | 'tfl';
  label: string;
  stopId?: string;      // NaPTAN ID (bus), station NaPTAN ID (tfl)
  crs?: string;         // CRS code (train)
  mode?: string;        // TfL mode (tfl)
  platform?: string | null; // null = ALL (train, tfl)
}
