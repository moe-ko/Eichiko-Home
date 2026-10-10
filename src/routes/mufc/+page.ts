import type { PageLoad } from './$types';

interface FootballDataMatch {
  utcDate: string;
  status: string;
  matchday: number | null;
  stage: string;
  group: string | null;
  competition: {
    id: number;
    name: string;
    code: string;
    emblem: string | null;
  };
  homeTeam: {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest: string;
  };
  awayTeam: {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest: string;
  };
  venue: string | null;
  score: {
    fullTime: { homeTeam: number | null; awayTeam: number | null };
    halfTime: { homeTeam: number | null; awayTeam: number | null };
  };
}

interface FootballDataResponse {
  filters: Record<string, unknown>;
  resultSet: {
    count: number;
    first: string;
    last: string;
  };
  matches: FootballDataMatch[];
}

export const load: PageLoad = async ({ fetch }) => {
  const res = await fetch('/api/mufc/fixtures');

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Failed to fetch fixtures');
  }

  const data: FootballDataResponse = await res.json();

  const fixtures = data.matches
    .filter((m) => m.status === 'SCHEDULED' || m.status === 'TIMED')
    .map((m) => {
      const kickoff = new Date(m.utcDate);
      const isHome = m.homeTeam.name.toLowerCase().includes('manchester united') ||
                     m.homeTeam.name.toLowerCase().includes('man utd') ||
                     m.homeTeam.tla === 'MUN';

      return {
        id: m.matchday ?? Math.random(),
        date: kickoff.toISOString().split('T')[0],
        time: kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }),
        kickoff: kickoff.toISOString(),
        competition: m.competition.name,
        competitionCode: m.competition.code,
        matchday: m.matchday,
        stage: m.stage,
        status: m.status,
        homeTeam: m.homeTeam.name,
        homeTeamShort: m.homeTeam.shortName,
        homeTeamTla: m.homeTeam.tla,
        homeTeamCrest: m.homeTeam.crest,
        awayTeam: m.awayTeam.name,
        awayTeamShort: m.awayTeam.shortName,
        awayTeamTla: m.awayTeam.tla,
        awayTeamCrest: m.awayTeam.crest,
        venue: m.venue ?? '',
        isHome,
        munCrest: isHome ? m.homeTeam.crest : m.awayTeam.crest,
        opponent: isHome ? m.awayTeam.name : m.homeTeam.name,
        opponentShort: isHome ? m.awayTeam.shortName : m.homeTeam.shortName,
        opponentCrest: isHome ? m.awayTeam.crest : m.homeTeam.crest,
      };
    })
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  return { fixtures };
};
