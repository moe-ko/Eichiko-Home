<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface Fixture {
    id: number;
    date: string;
    time: string;
    kickoff: string;
    competition: string;
    competitionCode: string;
    matchday: number | null;
    stage: string;
    status: string;
    munCrest: string;
    homeTeam: string;
    homeTeamShort: string;
    homeTeamTla: string;
    homeTeamCrest: string;
    awayTeam: string;
    awayTeamShort: string;
    awayTeamTla: string;
    awayTeamCrest: string;
    venue: string;
    isHome: boolean;
    opponent: string;
    opponentShort: string;
    opponentCrest: string;
  }

  interface PageData {
    fixtures: Fixture[];
  }

  let { data }: { data: PageData } = $props();

  let refreshInterval: ReturnType<typeof setInterval>;
  let loading = $state(false);
  let fixtures = $state<Fixture[]>([]);

  $effect(() => {
    fixtures = data.fixtures;
  });

  function isNextMatch(fixture: Fixture, index: number): boolean {
    if (fixture.status === 'FINISHED' || fixture.status === 'POSTPONED') return false;
    for (let i = 0; i < index; i++) {
      const f = fixtures[i];
      if (f.status !== 'FINISHED' && f.status !== 'POSTPONED') return false;
    }
    return true;
  }

  async function refresh() {
    loading = true;
    try {
      const res = await fetch('/api/mufc/fixtures');
      if (res.ok) {
        const data = await res.json();
        fixtures = data.matches
          .filter((m: { status: string }) => m.status === 'SCHEDULED' || m.status === 'TIMED')
          .map((m: any) => {
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
          .sort((a: Fixture, b: Fixture) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
      }
    } catch (e) {
      console.error('Failed to refresh fixtures:', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    refreshInterval = setInterval(refresh, 60000);
  });

  onDestroy(() => {
    clearInterval(refreshInterval);
  });

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  }

  function formatFullDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  }
</script>

<div class="mufc-fixtures">
  <div class="fixtures-header">
    <h1>MANCHESTER UNITED</h1>
    <span class="subtitle">FIXTURES 2025/26</span>
    {#if loading}
      <span class="refresh-indicator">REFreshing...</span>
    {:else}
      <span class="match-count">{fixtures.length} MATCHES</span>
    {/if}
  </div>

  {#if fixtures.length === 0}
    <div class="empty-state">
      <p>No upcoming fixtures found</p>
      <button onclick={refresh}>REFRESH</button>
    </div>
  {:else}
    <div class="fixtures-list">
      {#each fixtures as fixture, i}
        {@const next = isNextMatch(fixture, i)}
        <div class="fixture-card" class:fixture-next={next}>
          <div class="fixture-status">
            {#if next}
              <span class="status-badge badge-next">UP NEXT</span>
            {:else if fixture.matchday}
              <span class="status-badge badge-future">MD{fixture.matchday}</span>
            {/if}
          </div>

          <div class="fixture-main">
            <div class="fixture-teams">
              {#if fixture.isHome}
                <div class="team home-team">
                  {#if fixture.homeTeamCrest}
                    <img src={fixture.homeTeamCrest} alt="" class="team-crest" />
                  {/if}
                  <span class="team-name">MAN UTD</span>
                </div>
                <div class="vs">VS</div>
                <div class="team away-team">
                  {#if fixture.opponentCrest}
                    <img src={fixture.opponentCrest} alt="" class="team-crest" />
                  {/if}
                  <span class="team-name">{fixture.opponentShort.toUpperCase()}</span>
                </div>
              {:else}
                <div class="team home-team">
                  {#if fixture.opponentCrest}
                    <img src={fixture.opponentCrest} alt="" class="team-crest" />
                  {/if}
                  <span class="team-name">{fixture.opponentShort.toUpperCase()}</span>
                </div>
                <div class="vs">VS</div>
                <div class="team away-team">
                  {#if fixture.munCrest}
                    <img src={fixture.munCrest} alt="" class="team-crest" />
                  {/if}
                  <span class="team-name">MAN UTD</span>
                </div>
              {/if}
            </div>

            <div class="fixture-details">
              <span class="comp-badge">{fixture.competitionCode}</span>
              <span class="fixture-date">{formatDate(fixture.kickoff)}</span>
              <span class="fixture-time">{fixture.time}</span>
              <span class="fixture-venue">{fixture.isHome ? 'HOME' : 'AWAY'} • {fixture.venue}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .mufc-fixtures {
    padding: 16px;
    max-width: 800px;
    margin: 0 auto;
  }

  .fixtures-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color, #333);
  }

  .fixtures-header h1 {
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 1.4rem;
    color: #da291c;
    text-shadow: 0 0 10px rgba(218, 41, 28, 0.5);
    margin: 0;
    letter-spacing: 2px;
  }

  .subtitle {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: var(--text-secondary, #888);
    letter-spacing: 2px;
  }

  .refresh-indicator {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    color: #00ff88;
    animation: blink 1s infinite;
  }

  .match-count {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    color: var(--text-secondary, #666);
    margin-left: auto;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .empty-state {
    text-align: center;
    padding: 40px;
    color: var(--text-secondary, #888);
    font-family: 'Share Tech Mono', monospace;
  }

  .empty-state button {
    margin-top: 16px;
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--border-color, #333);
    color: var(--text-primary, #ccc);
    font-family: 'Share Tech Mono', monospace;
    cursor: pointer;
  }

  .fixture-card {
    background: var(--bg-card, #111);
    border: 1px solid var(--border-color, #222);
    padding: 16px;
    margin-bottom: 12px;
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }

  .fixture-card.fixture-next {
    border-color: var(--led-green);
    box-shadow: 0 0 20px var(--led-green-glow);
  }

  .fixture-card.fixture-next::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: var(--led-green);
  }

  .fixture-status {
    margin-bottom: 12px;
  }

  .status-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    padding: 3px 8px;
    border-radius: 2px;
    letter-spacing: 1px;
  }

  .badge-next {
    background: rgba(0, 255, 65, 0.15);
    color: #00FF41;
    border: 1px solid #00FF41;
    text-shadow: 0 0 8px rgba(0, 255, 65, 0.4);
    animation: pulse 2s infinite;
  }

  .badge-future {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-secondary, #666);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .fixture-main {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .fixture-teams {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .team {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  .home-team {
    justify-content: flex-start;
  }

  .away-team {
    justify-content: flex-end;
    text-align: right;
  }

  .team-crest {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }

  .team-name {
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 1rem;
    color: var(--text-primary);
    letter-spacing: 1px;
  }

  .vs {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: var(--text-secondary, #666);
    flex-shrink: 0;
  }

  .fixture-details {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color, #222);
  }

  .comp-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    background: rgba(218, 41, 28, 0.2);
    color: #da291c;
    padding: 2px 6px;
    border-radius: 2px;
    letter-spacing: 1px;
  }

  .fixture-date {
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  .fixture-time {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    color: var(--text-primary);
    font-weight: bold;
  }

  .fixture-venue {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    color: var(--text-secondary, #666);
    margin-left: auto;
  }

  @media (max-width: 500px) {
    .mufc-fixtures {
      padding: 10px;
    }

    .fixtures-header h1 {
      font-size: 1rem;
    }

    .team-name {
      font-size: 0.8rem;
    }

    .team-crest {
      width: 28px;
      height: 28px;
    }

    .fixture-details {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .fixture-venue {
      margin-left: 0;
    }
  }
</style>
