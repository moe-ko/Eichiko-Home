<script lang="ts">
  import type { PageData } from './$types';

  interface Session {
    day: string;
    date: string;
    time: string;
    endTime: string;
  }

  interface Race {
    round: number;
    country: string;
    location: string;
    circuit: string;
    flag: string;
    date: string;
    sessions: Record<string, Session>;
    sprint: boolean;
  }

  interface DriverStanding {
    position: number;
    positionText: string;
    points: number;
    wins: number;
    driverId: string;
    code: string;
    givenName: string;
    familyName: string;
    nationality: string;
    constructor: string;
  }

  interface ConstructorStanding {
    position: number;
    positionText: string;
    points: number;
    wins: number;
    constructorId: string;
    name: string;
    nationality: string;
  }

  interface ExpandedPageData extends PageData {
    standings: DriverStanding[];
    constructorStandings: ConstructorStanding[];
  }

  const { data }: { data: ExpandedPageData } = $props();

  let activeTab = $state<'schedule' | 'standings' | 'constructors'>('schedule');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function isOver(race: Race): boolean {
    const raceDate = new Date(race.date);
    raceDate.setHours(23, 59, 59);
    return raceDate < today;
  }

  function isNext(race: Race, index: number): boolean {
    if (isOver(race)) return false;
    // Check if all previous races are over
    for (let i = 0; i < index; i++) {
      if (!isOver(data.races[i])) return false;
    }
    return true;
  }

  function formatDateRange(race: Race): string {
    const sessions = Object.values(race.sessions) as Session[];
    const dates = sessions.map(s => new Date(s.date));
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    const latest = new Date(Math.max(...dates.map(d => d.getTime())));
    const month = earliest.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
    const dayStart = earliest.getDate();
    const dayEnd = latest.getDate();
    return `${month} ${dayStart}-${dayEnd}`;
  }

  const SESSION_LABELS: Record<string, string> = {
    fp1: 'Practice 1',
    fp2: 'Practice 2',
    fp3: 'Practice 3',
    qualifying: 'Qualifying',
    race: 'Race',
    sprintQualifying: 'Sprint Qualifying',
    sprintRace: 'Sprint Race',
  };

  const DAY_ORDER = ['Friday', 'Saturday', 'Sunday'];

  function getSessionsByDay(race: Race): Record<string, { key: string; label: string; time: string; endTime: string }[]> {
    const byDay: Record<string, { key: string; label: string; time: string; endTime: string }[]> = {
      Friday: [],
      Saturday: [],
      Sunday: [],
    };
    for (const [key, session] of Object.entries(race.sessions)) {
      const s = session as Session;
      byDay[s.day]?.push({
        key,
        label: SESSION_LABELS[key] ?? key,
        time: s.time,
        endTime: s.endTime,
      });
    }
    return byDay;
  }

  function isSprint(key: string): boolean {
    return key === 'sprintQualifying' || key === 'sprintRace';
  }
</script>

<div class="f1-schedule">
  <div class="tab-bar">
    <button
      class="tab-btn"
      class:active={activeTab === 'schedule'}
      onclick={() => activeTab = 'schedule'}
    >
      SCHEDULE
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === 'standings'}
      onclick={() => activeTab = 'standings'}
    >
      STANDINGS
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === 'constructors'}
      onclick={() => activeTab = 'constructors'}
    >
      CONSTRUCTORS
    </button>
  </div>

  {#if activeTab === 'schedule'}
    <div class="schedule-header">
      <h2 class="schedule-title">F1 2026 SCHEDULE</h2>
      <span class="schedule-note">ALL TIMES UTC</span>
    </div>

    <div class="race-grid">
    {#each data.races as race, i}
        {@const over = isOver(race)}
        {@const next = isNext(race, i)}
        {@const byDay = getSessionsByDay(race)}
        <div class="race-card" class:race-over={over} class:race-next={next}>
          <!-- Card Header -->
          <div class="card-header">
            <div class="card-header-left">
              <span class="race-flag">{race.flag}</span>
              <span class="race-country">{race.country.toUpperCase()}</span>
              {#if race.sprint}
                <span class="sprint-badge">SPRINT</span>
              {/if}
            </div>
            <div class="card-header-right">
              {#if over}
                <span class="status-badge badge-over">OVER</span>
              {:else if next}
                <span class="status-badge badge-next">UP NEXT</span>
              {:else}
                <span class="status-badge badge-future">ROUND {race.round}</span>
              {/if}
            </div>
          </div>
          <div class="card-sub-header">
            <span class="race-location">{race.location.toUpperCase()}</span>
            <span class="race-dates">{formatDateRange(race)}</span>
          </div>

          <!-- Session Grid -->
          <div class="session-grid">
            {#each DAY_ORDER as day}
              <div class="session-day">
                <div class="day-header">{day.toUpperCase()}</div>
                <div class="day-sessions">
                  {#each byDay[day] as session}
                    <div class="session-item" class:session-sprint={isSprint(session.key)}>
                      <span class="session-name">{session.label.toUpperCase()}</span>
                      <span class="session-time">{session.time} - {session.endTime}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if activeTab === 'standings'}
    <div class="standings-header">
      <h2 class="standings-title">DRIVER STANDINGS</h2>
      <span class="standings-note">2026 CHAMPIONSHIP</span>
    </div>

    <div class="standings-table">
      <div class="standings-row header-row">
        <span class="col-pos">POS</span>
        <span class="col-driver">DRIVER</span>
        <span class="col-constructor">TEAM</span>
        <span class="col-points">PTS</span>
        <span class="col-wins">WINS</span>
      </div>
      {#each data.standings as driver}
        {@const isLeader = driver.position <= 3}
        <div class="standings-row" class:row-leader={isLeader}>
          <span class="col-pos">{driver.position}</span>
          <span class="col-driver">{driver.code} {driver.familyName.toUpperCase()}</span>
          <span class="col-constructor">{driver.constructor}</span>
          <span class="col-points">{driver.points}</span>
          <span class="col-wins">{driver.wins}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if activeTab === 'constructors'}
    <div class="standings-header">
      <h2 class="standings-title">CONSTRUCTOR STANDINGS</h2>
      <span class="standings-note">2026 CHAMPIONSHIP</span>
    </div>

    <div class="standings-table">
      <div class="standings-row header-row">
        <span class="col-pos">POS</span>
        <span class="col-driver">TEAM</span>
        <span class="col-constructor">NATIONALITY</span>
        <span class="col-points">PTS</span>
        <span class="col-wins">WINS</span>
      </div>
      {#each data.constructorStandings as team}
        {@const isLeader = team.position <= 3}
        <div class="standings-row" class:row-leader={isLeader}>
          <span class="col-pos">{team.position}</span>
          <span class="col-driver">{team.name.toUpperCase()}</span>
          <span class="col-constructor">{team.nationality}</span>
          <span class="col-points">{team.points}</span>
          <span class="col-wins">{team.wins}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .f1-schedule {
    padding: 20px;
    background: #050505;
    min-height: calc(100vh - 200px);
  }

  /* ── Sub Tab Bar ── */
  .tab-bar {
    display: flex;
    gap: 2px;
    margin-bottom: 20px;
    border-bottom: 1px solid #2a1a00;
  }

  .tab-btn {
    background: transparent;
    border: none;
    color: #666;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    font-weight: bold;
    letter-spacing: 3px;
    padding: 10px 20px;
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 2px solid transparent;
  }

  .tab-btn:hover {
    color: #888;
  }

  .tab-btn.active {
    color: #FFD600;
    border-bottom-color: #FFD600;
  }

  /* ── Standings ── */
  .standings-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 20px;
    padding: 0 4px;
  }

  .standings-title {
    color: #FFD600;
    font-family: 'Share Tech Mono', monospace;
    font-size: 1.1rem;
    font-weight: bold;
    letter-spacing: 3px;
    margin: 0;
  }

  .standings-note {
    color: #888;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 2px;
  }

  .standings-table {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .standings-row {
    display: grid;
    grid-template-columns: 50px 1fr 1fr 60px 50px;
    gap: 10px;
    padding: 10px 16px;
    background: #0f0f0f;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.85rem;
    align-items: center;
  }

  .header-row {
    background: #1a1200;
    color: #FFD600;
    font-weight: bold;
    letter-spacing: 2px;
    font-size: 0.75rem;
  }

  .row-leader {
    background: #151515;
  }

  .col-pos {
    color: #FF6A00;
    font-weight: bold;
  }

  .col-driver {
    color: #fff;
  }

  .col-constructor {
    color: #888;
  }

  .col-points {
    color: #00FF41;
    font-weight: bold;
    text-align: right;
  }

  .col-wins {
    color: #666;
    text-align: right;
  }

  .schedule-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 20px;
    padding: 0 4px;
  }

  .schedule-title {
    color: #FFD600;
    font-family: 'Share Tech Mono', monospace;
    font-size: 1.1rem;
    font-weight: bold;
    letter-spacing: 3px;
    margin: 0;
  }

  .schedule-note {
    color: #888;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 2px;
  }

  /* ── Race Grid ── */
  .race-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  /* ── Race Card ── */
  .race-card {
    background: #0f0f0f;
    border: 1px solid #2a1a00;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 0 0 1px #000, 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 24px rgba(255, 106, 0, 0.04);
  }

  .race-over {
    opacity: 0.4;
  }

  .race-next {
    border-color: #00FF41;
    box-shadow: 0 0 0 1px #000, 0 0 20px rgba(0, 255, 65, 0.15), 0 0 40px rgba(0, 255, 65, 0.08);
  }

  /* ── Card Header ── */
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px 4px;
    background: #111;
  }

  .card-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .card-header-right {
    flex-shrink: 0;
  }

  .race-flag {
    font-size: 1.2rem;
  }

  .race-country {
    color: #FFD600;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.9rem;
    font-weight: bold;
    letter-spacing: 2px;
  }

  .sprint-badge {
    background: #00D9FF;
    color: #000;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    font-weight: bold;
    letter-spacing: 1.5px;
    padding: 2px 8px;
    border-radius: 2px;
  }

  .card-sub-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 16px 10px;
    background: #111;
    border-bottom: 1px solid #1a1200;
  }

  .race-location {
    color: #888;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 2px;
  }

  .race-dates {
    color: #FF6A00;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 1px;
    font-weight: bold;
  }

  /* ── Status Badges ── */
  .status-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    font-weight: bold;
    letter-spacing: 2px;
    padding: 3px 10px;
    border-radius: 2px;
  }

  .badge-over {
    background: #333;
    color: #888;
  }

  .badge-next {
    background: rgba(0, 255, 65, 0.15);
    color: #00FF41;
    border: 1px solid #00FF41;
    text-shadow: 0 0 8px rgba(0, 255, 65, 0.4);
  }

  .badge-future {
    background: #1a1200;
    color: #FF6A00;
    border: 1px solid #2a1a00;
  }

  /* ── Session Grid ── */
  .session-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
  }

  .session-day {
    border-right: 1px solid #1a1200;
  }

  .session-day:last-child {
    border-right: none;
  }

  .day-header {
    background: #1a1200;
    color: #FFD600;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    font-weight: bold;
    letter-spacing: 2px;
    padding: 6px 10px;
    text-align: center;
  }

  .day-sessions {
    padding: 6px 0;
  }

  .session-item {
    padding: 5px 10px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .session-name {
    color: #FF6A00;
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.7rem;
    letter-spacing: 1px;
    text-shadow: 0 0 6px rgba(255, 106, 0, 0.3);
  }

  .session-time {
    color: #666;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 1px;
  }

  .session-sprint .session-name {
    color: #00D9FF;
    text-shadow: 0 0 6px rgba(0, 217, 255, 0.3);
  }

  .session-sprint .session-time {
    color: #4a7a8a;
  }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .race-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .f1-schedule {
      padding: 12px;
    }
    .schedule-header {
      flex-direction: column;
      gap: 4px;
    }
    .race-country {
      font-size: 0.75rem;
    }
    .card-header {
      padding: 10px 12px 4px;
    }
    .card-sub-header {
      padding: 2px 12px 8px;
    }
    .day-header {
      font-size: 0.5rem;
      padding: 4px 6px;
    }
    .session-name {
      font-size: 0.6rem;
    }
    .session-time {
      font-size: 0.5rem;
    }
    .session-item {
      padding: 4px 6px;
    }
  }
</style>
