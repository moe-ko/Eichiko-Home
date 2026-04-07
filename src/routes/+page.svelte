<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getLondonWeather } from '$lib/api/weather';
  import { getAllLineStatusByMode, getStopArrivals } from '$lib/api/tfl';
  import { getDepartures, type TrainService } from '$lib/api/rail';
  import { getUpcomingEvents, type CalendarEvent } from '$lib/api/calendar';
  import { TUBE_LINES } from '$lib/constants/lines';

  let weather: any = $state(null);
  let tflStatuses: any[] = $state([]);
  let railStatuses: any[] = $state([]);
  let weatherError = $state('');
  let lineError = $state('');
  let railError = $state('');
  let lineStatusCollapsed = $state(true);
  let appointments: CalendarEvent[] = $state([]);
  let appointmentsError = $state('');
  let expandedEvents: Record<string, boolean> = $state({});

  function toggleEvent(key: string) {
    expandedEvents[key] = !expandedEvents[key];
  }

  const BUS_STOPS = [
    { label: 'Bexley Road / Glenesk Road (Stop AF)', id: '490007227W' },
    { label: 'Southend Crescent / Wythens Walk (Stop B)', id: '490012279S1' },
  ];

  let stopArrivals: Record<string, any[]> = $state(Object.fromEntries(BUS_STOPS.map(s => [s.id, []])));
  let stopErrors: Record<string, string> = $state({});

  const TRAIN_STATIONS = [
    { label: 'New Eltham Station', crs: 'NEH', platform: '1' },
    { label: 'Eltham Station', crs: 'ELW', platform: '1' },
  ];

  let trainData: Record<string, { departures: TrainService[]; error: string; loading: boolean }> = $state({
    NEH: { departures: [], error: '', loading: true },
    ELW: { departures: [], error: '', loading: true },
  });

  let interval: ReturnType<typeof setInterval>;
  let now = $state(new Date());
  let clockInterval: ReturnType<typeof setInterval>;
  let phraseInterval: ReturnType<typeof setInterval>;
  let weatherPhrase = $state('');

  const WEATHER_PHRASES: Record<string, string[]> = {
    hot: [
      "love, it's roasting out there please put on some suncream",
      "oh my god it's so hot today wear something light ok",
      "seriously don't forget water it's way too hot out there",
      "going out? you won't need a jacket trust me it's boiling",
    ],
    sunny: [
      "it's actually really nice out today",
      "proper lovely weather you should go for a walk",
      "sunshine all day enjoy it while it lasts",
      "you should get out today it's beautiful",
    ],
    cloudy: [
      "bit grey out but should stay dry so you'll be fine",
      "cloudy but no rain nothing to worry about",
      "not the nicest day but at least it's dry",
      "a bit dull out there but no need for an umbrella",
    ],
    drizzle: [
      "just a little drizzle out maybe throw a jacket on",
      "spitting a bit out there not too bad though",
      "bit damp a light coat should be enough",
      "might want to grab a hoodie just in case",
    ],
    rain: [
      "love, seriously take your umbrella today",
      "don't even think about leaving without an umbrella",
      "it's proper raining out there you'll get soaked",
      "take your umbrella I'm not gonna say it twice",
    ],
    heavyrain: [
      "it is absolutely pouring out there umbrella is not optional",
      "you will get completely drenched without an umbrella please take one",
      "it's really bad out there umbrella and a waterproof if you have one",
      "love, please take an umbrella it's chucking it down",
    ],
    thunderstorm: [
      "there's a proper storm out there please be careful",
      "lightning and everything out there try to stay indoors if you can",
      "seriously wild weather today please take care",
      "love, it's really rough out there stay safe ok",
    ],
    snow: [
      "love, it's snowing out there wrap up warm",
      "snow on the ground watch your step it might be slippery",
      "it's actually snowing dress warm and take it slow",
      "proper winter weather today make sure you're all wrapped up",
    ],
    fog: [
      "really foggy out there take it easy on the road",
      "can barely see anything out there be careful",
      "visibility is terrible this morning drive safe",
      "so misty out there hopefully it'll clear up soon",
    ],
  };

  function getWeatherCategory(w: any): string {
    const id = w.weather[0].id as number;
    const temp = w.main.temp;
    if (id >= 200 && id < 300) return 'thunderstorm';
    if (id >= 300 && id < 400) return 'drizzle';
    if (id >= 500 && id < 502) return 'rain';
    if (id >= 502 && id < 600) return 'heavyrain';
    if (id >= 600 && id < 700) return 'snow';
    if (id >= 700 && id < 800) return 'fog';
    if (id === 800) return temp >= 25 ? 'hot' : 'sunny';
    return 'cloudy';
  }

  function pickPhrase(w: any): string {
    const cat = getWeatherCategory(w);
    const phrases = WEATHER_PHRASES[cat];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  onMount(() => {
    loadWeather();
    loadLineStatus();
    fetchAllData();
    interval = setInterval(fetchAllData, 30000);
    clockInterval = setInterval(() => { now = new Date(); }, 1000);
    phraseInterval = setInterval(() => {
      if (weather) weatherPhrase = pickPhrase(weather);
    }, 12000);

    function handleVisibility() {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        fetchAllData();
        interval = setInterval(fetchAllData, 30000);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  });

  onDestroy(() => {
    clearInterval(interval);
    clearInterval(clockInterval);
    clearInterval(phraseInterval);
  });

  async function loadWeather() {
    try {
      weather = await getLondonWeather();
      weatherPhrase = pickPhrase(weather);
    } catch (e: any) {
      weatherError = e.message;
    }
  }

  async function loadLineStatus() {
    await Promise.all([
      getAllLineStatusByMode(['tube', 'elizabeth-line', 'overground', 'dlr'])
        .then(data => { tflStatuses = data.sort((a: any, b: any) => a.name.localeCompare(b.name)); })
        .catch((e: any) => { lineError = e.message; }),
      getAllLineStatusByMode(['national-rail'])
        .then(data => {
          const LONDON_OPERATORS = new Set([
            'Avanti West Coast', 'c2c', 'Chiltern Railways', 'East Midlands Railway',
            'Gatwick Express', 'Grand Central', 'Great Northern', 'Greater Anglia',
            'Great Western Railway', 'Heathrow Express', 'Hull Trains', 'LNER',
            'Lumo', 'Southeastern', 'Southern', 'South Western Railway', 'Thameslink',
          ]);
          railStatuses = data
            .filter((l: any) => LONDON_OPERATORS.has(l.name))
            .sort((a: any, b: any) => a.name.localeCompare(b.name));
        })
        .catch((e: any) => { railError = e.message; }),
    ]);
  }

  async function fetchAllData() {
    await Promise.all([fetchBusArrivals(), fetchTrainDepartures(), loadLineStatus(), fetchAppointments()]);
  }

  async function fetchBusArrivals() {
    await Promise.all(BUS_STOPS.map(async (stop) => {
      try {
        const data = await getStopArrivals(stop.id);
        stopArrivals[stop.id] = data
          .sort((a: any, b: any) => a.timeToStation - b.timeToStation)
          .slice(0, 8);
        stopErrors[stop.id] = '';
      } catch (e: any) {
        stopErrors[stop.id] = e.message;
      }
    }));
  }

  async function fetchTrainDepartures() {
    await Promise.all(TRAIN_STATIONS.map(async (station) => {
      try {
        const data = await getDepartures(station.crs, 8, station.platform);
        trainData[station.crs] = { departures: data, error: '', loading: false };
      } catch (e: any) {
        trainData[station.crs] = { departures: [], error: e.message, loading: false };
      }
    }));
  }

  async function fetchAppointments() {
    try {
      appointments = await getUpcomingEvents();
      appointmentsError = '';
    } catch (e: any) {
      appointmentsError = e.message;
    }
  }

  function formatMins(seconds: number): string {
    const m = Math.floor(seconds / 60);
    return m <= 0 ? 'DUE' : `${m}`;
  }

  function getLineColor(lineId: string): string {
    const line = TUBE_LINES.find(l => l.id === lineId || l.name.toLowerCase() === lineId.toLowerCase());
    return line?.color ?? '#aaaaaa';
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatEventTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    if (diffDays < 7) {
      const dow = d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
      return `${dow} ${hh}:${mm}`;
    }
    const day = d.getDate().toString().padStart(2, '0');
    const mon = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
    return `${day} ${mon} ${hh}:${mm}`;
  }
</script>

<svelte:head>
  <title>Eichiko's Home</title>
</svelte:head>

<div class="led-board">
  <!-- Header -->
  <div class="board-header">
    <div class="header-left">
      <span class="header-title">EICHIKO'S HOME</span>
    </div>
    <div class="header-right">
      <span class="header-location">GREENWICH, UK</span>
      <span class="header-time">{formatTime(now)}</span>
    </div>
  </div>

  <!-- Weather Bar -->
  <div class="weather-bar">
    {#if weather}
      <span class="weather-icon">
        {#if weather.weather[0].main === 'Clouds'}&#9729;{:else if weather.weather[0].main === 'Rain'}&#9730;{:else if weather.weather[0].main === 'Clear'}&#9728;{:else if weather.weather[0].main === 'Snow'}&#10052;{:else if weather.weather[0].main === 'Thunderstorm'}&#9928;{:else}&#9729;{/if}
      </span>
      <span class="weather-temp">{Math.round(weather.main.temp)}°C</span>
      <span class="weather-desc">{weather.weather[0].description.toUpperCase()}</span>
      <span class="weather-sep">|</span>
      <span class="weather-pop">&#9748; {Math.round((weather.pop ?? 0) * 100)}% rain</span>
      <span class="weather-sep">|</span>
      <span class="weather-phrase">{weatherPhrase}</span>
    {:else if weatherError}
      <span class="weather-error">{weatherError}</span>
    {:else}
      <span class="weather-loading">LOADING WEATHER...</span>
    {/if}
  </div>

  <!-- Grid layout for tablet -->
  <div class="board-grid">
    <!-- Line Status (collapsible) -->
    <div class="board-section grid-full">
      <button class="section-header section-toggle" onclick={() => lineStatusCollapsed = !lineStatusCollapsed}>
        <span class="section-title-group">
          <span>LINE STATUS</span>
          <span class="tap-hint">TAP TO {lineStatusCollapsed ? 'EXPAND' : 'COLLAPSE'}</span>
        </span>
        <span class="toggle-icon">{lineStatusCollapsed ? '▶' : '▼'}</span>
      </button>
      {#if !lineStatusCollapsed}
        <div class="line-status-grid">
          <!-- TFL Lines -->
          <div class="line-status-col">
            <div class="col-header-row col-header-tfl">
              <span class="col-line">TFL LINE</span>
              <span class="col-status">STATUS</span>
            </div>
            {#if lineError}
              <div class="led-row"><span class="error-text">{lineError}</span></div>
            {:else if tflStatuses.length === 0}
              <div class="led-row"><span class="loading-text">LOADING...</span></div>
            {:else}
              {#each tflStatuses as line, i}
                {@const status = line.lineStatuses?.[0]?.statusSeverityDescription ?? 'Unknown'}
                <div class="led-row" class:row-alt={i % 2 === 1}>
                  <span class="col-line line-name" style="color: {getLineColor(line.id)}">{line.name.toUpperCase()}</span>
                  <span class="line-dots"></span>
                  <span class="col-status" class:status-good={status === 'Good Service'} class:status-delay={status !== 'Good Service' && status !== 'Unknown'}>{status.toUpperCase()}</span>
                </div>
              {/each}
            {/if}
          </div>
          <!-- National Rail -->
          <div class="line-status-col">
            <div class="col-header-row col-header-rail">
              <span class="col-line">NATIONAL RAIL</span>
              <span class="col-status">STATUS</span>
            </div>
            {#if railError}
              <div class="led-row"><span class="error-text">{railError}</span></div>
            {:else if railStatuses.length === 0}
              <div class="led-row"><span class="loading-text">LOADING...</span></div>
            {:else}
              {#each railStatuses as line, i}
                {@const status = line.lineStatuses?.[0]?.statusSeverityDescription ?? 'Unknown'}
                <div class="led-row" class:row-alt={i % 2 === 1}>
                  <span class="col-line" style="color: #ccc">{line.name.toUpperCase()}</span>
                  <span class="line-dots"></span>
                  <span class="col-status" class:status-good={status === 'Good Service'} class:status-delay={status !== 'Good Service' && status !== 'Unknown'}>{status.toUpperCase()}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Appointments -->
    <div class="board-section grid-full appointments">
      <div class="section-header">
        <span class="section-type-badge badge-calendar">APPOINTMENTS</span>
        <span class="tap-hint">TAP AN EVENT FOR DETAILS</span>
      </div>
      <div class="col-header-row col-header-yellow">
        <span class="col-time">TIME</span>
        <span class="col-event">EVENT</span>
      </div>
      {#if appointmentsError}
        <div class="led-row"><span class="error-text">{appointmentsError}</span></div>
      {:else if appointments.length === 0}
        <div class="led-row"><span class="loading-text">NO UPCOMING EVENTS</span></div>
      {:else}
        {#each appointments as evt, i}
          {@const hasDetails = !!(evt.location || evt.description)}
          {@const isExpanded = expandedEvents[evt.start] === true}
          {#if hasDetails}
            <button
              type="button"
              class="led-row event-row"
              class:row-alt={i % 2 === 1}
              onclick={() => toggleEvent(evt.start)}
            >
              <span class="col-time led-yellow">{formatEventTime(evt.start)}</span>
              <span class="col-event led-yellow">{evt.summary.toUpperCase()}</span>
              <span class="event-chevron">{isExpanded ? '▼' : '▶'}</span>
            </button>
          {:else}
            <div class="led-row" class:row-alt={i % 2 === 1}>
              <span class="col-time led-yellow">{formatEventTime(evt.start)}</span>
              <span class="col-event led-yellow">{evt.summary.toUpperCase()}</span>
            </div>
          {/if}
          {#if hasDetails && isExpanded}
            <div class="led-sub-row" class:row-alt={i % 2 === 1}>
              {#if evt.location}
                <div class="sub-line">
                  <span class="sub-label">LOCATION:</span>
                  <span class="sub-value sub-value-upper">{evt.location}</span>
                </div>
              {/if}
              {#if evt.description}
                <div class="sub-line">
                  <span class="sub-label">DESCRIPTION:</span>
                  <span class="sub-value">{evt.description}</span>
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      {/if}
    </div>

    <!-- Bus Arrivals -->
    {#each BUS_STOPS as stop}
      <div class="board-section grid-half">
        <div class="section-header">
          <span class="section-type-badge badge-bus">BUS</span>
          <span>{stop.label.toUpperCase()}</span>
        </div>
        <div class="col-header-row col-header-yellow">
          <span class="col-route">ROUTE</span>
          <span class="col-dest">DESTINATION</span>
          <span class="col-mins">MINS</span>
        </div>
        {#if stopErrors[stop.id]}
          <div class="led-row"><span class="error-text">{stopErrors[stop.id]}</span></div>
        {:else if stopArrivals[stop.id].length === 0}
          <div class="led-row"><span class="loading-text">AWAITING DATA...</span></div>
        {:else}
          {#each stopArrivals[stop.id] as arrival, i}
            {@const mins = formatMins(arrival.timeToStation)}
            <div class="led-row" class:row-alt={i % 2 === 1}>
              <span class="col-route led-bold led-yellow">{arrival.lineName}</span>
              <span class="col-dest led-yellow">{(arrival.towards ?? arrival.destinationName).toUpperCase()}</span>
              <span class="col-mins" class:due-blink={mins === 'DUE'} class:due-text={mins === 'DUE'}>{mins}</span>
            </div>
          {/each}
        {/if}
      </div>
    {/each}

    <!-- Train Departures -->
    {#each TRAIN_STATIONS as station}
      {@const td = trainData[station.crs]}
      <div class="board-section grid-half">
        <div class="section-header">
          <span class="section-type-badge badge-train">TRAIN</span>
          <span>{station.label.toUpperCase()}{station.platform ? ` — PLATFORM ${station.platform}` : ''}</span>
        </div>
        <div class="col-header-row col-header-yellow">
          <span class="col-time">TIME</span>
          <span class="col-train-dest">DESTINATION</span>
          <span class="col-train-status">STATUS</span>
          <span class="col-plat">PLAT</span>
        </div>
        {#if td.error}
          <div class="led-row"><span class="error-text">{td.error}</span></div>
        {:else if td.loading}
          <div class="led-row"><span class="loading-text">AWAITING DATA...</span></div>
        {:else if td.departures.length === 0}
          <div class="led-row"><span class="loading-text">NO DEPARTURES</span></div>
        {:else}
          {#each td.departures as svc, i}
            <div class="led-row" class:row-alt={i % 2 === 1}>
              <span class="col-time led-yellow">{svc.std}</span>
              <span class="col-train-dest led-yellow">{svc.destination.toUpperCase()}</span>
              <span class="col-train-status" class:status-good={svc.etd === 'On time'} class:status-delay={svc.etd !== 'On time'}>{svc.etd.toUpperCase()}</span>
              <span class="col-plat">{svc.platform ?? '-'}</span>
            </div>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  /* ── LED Blink Animation ── */
  @keyframes led-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .due-blink {
    animation: led-blink 1.5s ease-in-out infinite;
  }

  /* ── Board Shell ── */
  .led-board {
    min-height: 100vh;
    background: #0a0a0a;
    color: #FF6A00;
    font-family: 'LED Dot-Matrix', monospace;
    text-transform: uppercase;
    letter-spacing: 2px;
    padding: 0;
  }

  /* ── Header ── */
  .board-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: #111;
    border-bottom: 3px solid #FFD600;
    font-family: 'Share Tech Mono', monospace;
  }

  .header-left {
    display: flex;
    align-items: center;
  }

  .header-title {
    color: #FFD600;
    font-size: 1.5rem;
    font-weight: bold;
    letter-spacing: 3px;
  }

  .header-right {
    display: flex;
    gap: 24px;
    align-items: center;
  }

  .header-location {
    color: #FFD600;
    font-size: 0.9rem;
  }

  .header-time {
    color: #FFD600;
    font-size: 1.2rem;
    font-weight: bold;
  }

  /* ── Weather Bar ── */
  .weather-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 24px;
    background: #111;
    border-bottom: 2px solid #222;
    flex-wrap: wrap;
    font-family: 'Share Tech Mono', monospace;
  }

  .weather-icon {
    font-size: 1.6rem;
    color: #FFD600;
  }

  .weather-temp {
    color: #FFFFFF;
    font-size: 1.3rem;
    font-weight: bold;
  }

  .weather-desc {
    color: #E0E0E0;
    font-size: 0.9rem;
  }

  .weather-sep {
    color: #444;
    font-size: 0.9rem;
  }

  .weather-pop {
    color: #E0E0E0;
    font-size: 0.9rem;
  }

  .weather-phrase {
    color: #E0E0E0;
    font-size: 0.9rem;
    text-transform: none;
  }

  .weather-error {
    color: #FF3333;
    font-size: 0.85rem;
  }

  .weather-loading {
    color: #888;
    font-size: 0.85rem;
  }

  /* ── Grid Layout ── */
  .board-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    padding: 20px;
    background: #050505;
  }

  .grid-full {
    grid-column: 1 / -1;
  }

  .grid-half {
    grid-column: span 1;
  }

  /* ── Sections (Card Style) ── */
  .board-section {
    margin: 0;
    background: #0f0f0f;
    border: 1px solid #2a1a00;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 0 0 1px #000, 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 24px rgba(255, 106, 0, 0.04);
  }

  .section-header {
    background: #111;
    padding: 10px 24px;
    color: #FFD600;
    font-size: 0.85rem;
    font-weight: bold;
    letter-spacing: 3px;
    font-family: 'Share Tech Mono', monospace;
    border-bottom: 1px solid #1a1200;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* ── Section Type Badges ── */
  .section-type-badge {
    display: inline-block;
    padding: 2px 10px;
    font-size: 0.7rem;
    font-weight: bold;
    letter-spacing: 2px;
    border-radius: 2px;
  }

  .badge-bus {
    background: #FF6A00;
    color: #000;
  }

  .badge-train {
    background: #00AAFF;
    color: #000;
  }

  /* ── Collapsible Toggle ── */
  .section-toggle {
    width: 100%;
    border: none;
    cursor: pointer;
    justify-content: space-between;
    text-transform: uppercase;
  }

  .section-title-group {
    display: flex;
    align-items: baseline;
    gap: 14px;
  }

  .tap-hint {
    color: #888;
    font-size: 0.65rem;
    letter-spacing: 1.5px;
    font-weight: normal;
  }

  .toggle-icon {
    color: #FFD600;
    font-size: 0.75rem;
  }

  .section-toggle:hover {
    background: #1a1a1a;
  }

  /* ── Column Headers ── */
  .col-header-row {
    display: flex;
    padding: 8px 24px;
    background: #1a1200;
    color: #FF6A00;
    font-size: 0.7rem;
    font-weight: bold;
    letter-spacing: 2px;
    font-family: 'Share Tech Mono', monospace;
  }

  .col-header-yellow {
    background: #1a1500;
    color: #FFD600;
  }

  .col-header-tfl {
    background: #001a2e;
    color: #00AAFF;
  }

  .col-header-rail {
    background: #0d1a00;
    color: #88CC00;
  }

  /* ── Data Rows (LED effect) ── */
  .led-row {
    background: #0f0f0f;
    border-bottom: 1px solid #1a1200;
    padding: 10px 24px;
    font-family: 'LED Dot-Matrix', monospace;
    text-transform: uppercase;
    letter-spacing: 2px;
    display: flex;
    font-size: 1rem;
    color: #FF6A00;
    text-shadow: 0 0 8px rgba(255, 106, 0, 0.4);
  }

  .led-row.row-alt {
    background: #0a0a0a;
  }

  .board-section .led-row:last-child {
    border-bottom: none;
  }

  .led-bold {
    font-weight: bold;
  }

  /* ── Yellow LED text for route/destination ── */
  .led-yellow {
    color: #FFD600 !important;
    text-shadow: 0 0 8px rgba(255, 214, 0, 0.4) !important;
  }

  /* ── Line Status Columns (with dot leaders) ── */
  .led-row .col-line {
    flex-shrink: 0;
  }

  .line-dots {
    flex: 1;
    border-bottom: 1px dotted #3a1a00;
    margin: 0 8px;
    align-self: center;
    height: 0;
  }

  .led-row .col-status {
    flex-shrink: 0;
    text-align: right;
  }

  .col-header-row .col-line {
    flex: 1;
    min-width: 0;
  }

  .col-header-row .col-status {
    flex: 0 0 auto;
    text-align: right;
  }

  /* ── Bus Columns ── */
  .col-route {
    width: 80px;
    flex-shrink: 0;
  }

  .col-dest {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-mins {
    width: 60px;
    text-align: right;
    flex-shrink: 0;
    font-weight: bold;
    font-size: 1.1rem;
  }

  .due-text {
    color: #FF3333 !important;
    text-shadow: 0 0 8px rgba(255, 51, 51, 0.4) !important;
  }

  /* ── Train Columns ── */
  .col-time {
    width: 70px;
    flex-shrink: 0;
    font-weight: bold;
  }

  .col-train-dest {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-train-status {
    width: 120px;
    text-align: right;
    flex-shrink: 0;
  }

  .col-plat {
    width: 50px;
    text-align: right;
    flex-shrink: 0;
  }

  /* ── Status Colors (LED green / red) ── */
  .status-good {
    color: #00FF41 !important;
    text-shadow: 0 0 8px rgba(0, 255, 65, 0.4) !important;
  }

  .status-delay {
    color: #FF3333 !important;
    text-shadow: 0 0 8px rgba(255, 51, 51, 0.4) !important;
  }

  .error-text {
    color: #FF3333;
    font-size: 0.8rem;
    text-shadow: 0 0 8px rgba(255, 51, 51, 0.4);
  }

  .loading-text {
    color: #7a3500;
    font-size: 0.8rem;
    text-shadow: none;
  }

  /* ── Low-contrast line name boost ── */
  .line-name {
    text-shadow: 0 0 4px currentColor;
    font-weight: bold;
  }

  /* ── Line Status 2-col split ── */
  .line-status-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .line-status-col {
    border-right: 1px solid #2a1a00;
  }

  .line-status-col:last-child {
    border-right: none;
  }

  /* ── Responsive — tablet (Galaxy Tab S11: 1600x2560 / ~1200px CSS width) ── */
  @media (max-width: 900px) {
    .board-grid {
      grid-template-columns: 1fr;
    }
    .grid-half {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 640px) {
    .board-header {
      flex-direction: column;
      gap: 8px;
      text-align: center;
    }
    .header-right {
      justify-content: center;
    }
    .header-title {
      font-size: 1.1rem;
    }
    .weather-bar {
      justify-content: center;
      text-align: center;
      padding: 10px 12px;
    }
    .led-row {
      font-size: 0.8rem;
      padding: 8px 12px;
    }
    .col-header-row {
      font-size: 0.6rem;
      padding: 6px 12px;
    }
    .section-header {
      padding: 8px 12px;
      font-size: 0.7rem;
      letter-spacing: 2px;
    }
    .col-route { width: 50px; }
    .col-mins { width: 45px; font-size: 0.9rem; }
    .col-time { width: 50px; }
    .col-train-status { width: 80px; }
    .col-plat { width: 36px; }
    .appointments .col-time { width: 100px; }
    .led-sub-row {
      padding: 6px 12px 10px 12px;
      font-size: 0.75rem;
    }
    .sub-label { width: 110px; }
    .sub-line { gap: 8px; }
    .line-status-grid {
      grid-template-columns: 1fr;
    }
    .line-status-col {
      border-right: none;
      border-bottom: 1px solid #2a1a00;
    }
    .line-status-col:last-child {
      border-bottom: none;
    }
  }

  /* ── Appointments ── */
  .badge-calendar {
    background: #00D9FF;
    color: #000;
    padding: 4px 14px;
    font-size: 0.8rem;
    letter-spacing: 2px;
  }

  .event-row {
    width: 100%;
    border: none;
    border-bottom: 1px solid #1a1200;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    align-items: center;
  }

  .event-row:hover {
    background: #1a1200;
  }

  .event-row.row-alt:hover {
    background: #14100a;
  }

  .event-chevron {
    flex-shrink: 0;
    width: 24px;
    text-align: right;
    color: #FFD600;
    font-size: 0.75rem;
    text-shadow: 0 0 6px rgba(255, 214, 0, 0.4);
  }

  .col-event {
    flex: 1;
    min-width: 0;
  }

  /* Wider time column for appointments, no wrap */
  .appointments .col-time {
    width: 130px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .appointments .led-row {
    gap: 16px;
  }

  .appointments .col-header-row {
    gap: 16px;
  }

  .led-sub-row {
    background: #0f0f0f;
    border-bottom: 1px solid #1a1200;
    padding: 8px 24px 14px 24px;
    font-family: 'LED Dot-Matrix', monospace;
    letter-spacing: 2px;
    font-size: 0.9rem;
    color: #FF6A00;
    text-shadow: 0 0 8px rgba(255, 106, 0, 0.4);
    text-transform: none;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 6px;
  }

  .led-sub-row.row-alt {
    background: #0a0a0a;
  }

  .sub-line {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    line-height: 1.5;
    width: 100%;
    text-align: left;
  }

  .sub-label {
    flex-shrink: 0;
    width: 140px;
    color: #FFD600;
    text-shadow: 0 0 6px rgba(255, 214, 0, 0.4);
    text-transform: uppercase;
  }

  .sub-value {
    flex: 1;
    min-width: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    text-transform: none;
  }

  .sub-value-upper {
    text-transform: uppercase;
  }
</style>
