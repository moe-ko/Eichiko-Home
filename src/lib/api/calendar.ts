export interface CalendarEvent {
  start: string;
  end: string;
  summary: string;
  location: string;
  description: string;
}

export async function getUpcomingEvents(): Promise<CalendarEvent[]> {
  const res = await fetch('/api/calendar/upcoming');
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Calendar API error: ${res.status}`);
  }
  return res.json();
}
