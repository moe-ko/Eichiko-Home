import type { PageLoad } from './$types';

interface JolpicaSession {
  date: string;
  time: string;
}

interface JolpicaRace {
  round: string;
  raceName: string;
  Circuit: {
    circuitName: string;
    Location: {
      locality: string;
      country: string;
    };
  };
  date: string;
  time?: string;
  FirstPractice?: JolpicaSession;
  SecondPractice?: JolpicaSession;
  ThirdPractice?: JolpicaSession;
  Qualifying?: JolpicaSession;
  Sprint?: JolpicaSession;
  SprintQualifying?: JolpicaSession;
}

const COUNTRY_FLAGS: Record<string, string> = {
  'Australia': '🇦🇺',
  'China': '🇨🇳',
  'Japan': '🇯🇵',
  'Bahrain': '🇧🇭',
  'Saudi Arabia': '🇸🇦',
  'USA': '🇺🇸',
  'United States': '🇺🇸',
  'Italy': '🇮🇹',
  'Monaco': '🇲🇨',
  'Spain': '🇪🇸',
  'Canada': '🇨🇦',
  'Austria': '🇦🇹',
  'UK': '🇬🇧',
  'United Kingdom': '🇬🇧',
  'Hungary': '🇭🇺',
  'Belgium': '🇧🇪',
  'Netherlands': '🇳🇱',
  'Singapore': '🇸🇬',
  'Azerbaijan': '🇦🇿',
  'Mexico': '🇲🇽',
  'Brazil': '🇧🇷',
  'UAE': '🇦🇪',
  'United Arab Emirates': '🇦🇪',
  'Qatar': '🇶🇦',
  'France': '🇫🇷',
  'Germany': '🇩🇪',
  'Portugal': '🇵🇹',
};

const SESSION_DURATIONS: Record<string, number> = {
  fp1: 60,
  fp2: 60,
  fp3: 60,
  qualifying: 60,
  race: 120,
  sprintQualifying: 45,
  sprintRace: 60,
};

function getDay(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}

function formatTime(timeStr: string): string {
  return timeStr.replace('Z', '').slice(0, 5);
}

function sessionEndTime(timeStr: string, durationMins: number): string {
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  const total = h * 60 + m + durationMins;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

function addSession(
  sessions: Record<string, { day: string; date: string; time: string; endTime: string }>,
  key: string,
  s: JolpicaSession | undefined
) {
  if (!s) return;
  const time = formatTime(s.time);
  sessions[key] = {
    day: getDay(s.date),
    date: s.date,
    time,
    endTime: sessionEndTime(s.time, SESSION_DURATIONS[key] ?? 60),
  };
}

export const load: PageLoad = async ({ fetch }) => {
  const res = await fetch('/api/f1/schedule');
  const json = await res.json();
  const jolpicaRaces: JolpicaRace[] = json.MRData.RaceTable.Races;

  const races = jolpicaRaces.map((r) => {
    const country = r.Circuit.Location.country;
    const isSprint = !!(r.Sprint || r.SprintQualifying);
    const sessions: Record<string, { day: string; date: string; time: string; endTime: string }> = {};

    addSession(sessions, 'fp1', r.FirstPractice);

    if (isSprint) {
      addSession(sessions, 'sprintQualifying', r.SprintQualifying ?? r.SecondPractice);
      addSession(sessions, 'sprintRace', r.Sprint);
    } else {
      addSession(sessions, 'fp2', r.SecondPractice);
      addSession(sessions, 'fp3', r.ThirdPractice);
    }

    addSession(sessions, 'qualifying', r.Qualifying);
    addSession(sessions, 'race', { date: r.date, time: r.time ?? '14:00:00Z' });

    return {
      round: parseInt(r.round),
      country,
      location: r.Circuit.Location.locality,
      circuit: r.Circuit.circuitName,
      flag: COUNTRY_FLAGS[country] ?? '🏁',
      date: r.date,
      sessions,
      sprint: isSprint,
    };
  });

  return { races };
};
