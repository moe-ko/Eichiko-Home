<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { dndzone } from 'svelte-dnd-action';
  import { getAllLineStatusByMode, getStopArrivals } from '$lib/api/tfl';
  import { getDepartures, type TrainService } from '$lib/api/rail';
  import { getUpcomingEvents, type CalendarEvent } from '$lib/api/calendar';
  import { TUBE_LINES } from '$lib/constants/lines';
  import { loadPanels, savePanels } from '$lib/stores/transport';
  import type { TransportPanel } from '$lib/types/transport';
  import AddStopModal from '$lib/components/AddStopModal.svelte';

  let tflStatuses: any[] = $state([]);
  let railStatuses: any[] = $state([]);
  let lineError = $state('');
  let railError = $state('');
  let lineStatusCollapsed = $state(true);
  let appointments: CalendarEvent[] = $state([]);
  let appointmentsError = $state('');
  let expandedEvents: Record<string, boolean> = $state({});

  function toggleEvent(key: string) {
    expandedEvents[key] = !expandedEvents[key];
  }

  let panels: TransportPanel[] = $state([]);
  let editMode = $state(false);
  let showAddModal = $state(false);

  let stopArrivals: Record<string, any[]> = $state({});
  let stopErrors: Record<string, string> = $state({});

  let trainData: Record<string, { departures: TrainService[]; error: string; loading: boolean; platforms: string[] }> = $state({});

  // Platform dropdown state
  let platformDropdownOpen: string | null = $state(null);

  let interval: ReturnType<typeof setInterval>;

  onMount(() => {
    panels = loadPanels();
    // Initialize data state for each panel
    for (const p of panels) {
      if (p.type === 'bus' && p.stopId) {
        stopArrivals[p.stopId] = [];
      } else if (p.type === 'train' && p.crs) {
        trainData[p.crs] = { departures: [], error: '', loading: true, platforms: [] };
      }
    }
    loadLineStatus();
    fetchAllData();
    interval = setInterval(fetchAllData, 30000);

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
  });

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
    const busPanels = panels.filter(p => p.type === 'bus' && p.stopId);
    await Promise.all(busPanels.map(async (panel) => {
      const stopId = panel.stopId!;
      try {
        const data = await getStopArrivals(stopId);
        stopArrivals[stopId] = data
          .sort((a: any, b: any) => a.timeToStation - b.timeToStation)
          .slice(0, 8);
        stopErrors[stopId] = '';
      } catch (e: any) {
        stopErrors[stopId] = e.message;
      }
    }));
  }

  async function fetchTrainDepartures() {
    const trainPanels = panels.filter(p => p.type === 'train' && p.crs);
    await Promise.all(trainPanels.map(async (panel) => {
      const crs = panel.crs!;
      try {
        const { departures, platforms } = await getDepartures(crs, 8, panel.platform ?? null);
        trainData[crs] = { departures, platforms, error: '', loading: false };
      } catch (e: any) {
        trainData[crs] = { departures: [], platforms: trainData[crs]?.platforms ?? [], error: e.message, loading: false };
      }
    }));
  }

  function addPanel(newPanel: Omit<TransportPanel, 'id'>) {
    const panel: TransportPanel = { ...newPanel, id: crypto.randomUUID() };
    panels = [...panels, panel];
    // Initialize data state
    if (panel.type === 'bus' && panel.stopId) {
      stopArrivals[panel.stopId] = [];
    } else if (panel.type === 'train' && panel.crs) {
      trainData[panel.crs] = { departures: [], error: '', loading: true, platforms: [] };
    }
    savePanels(panels);
    showAddModal = false;
    // Fetch data for the new panel immediately
    if (panel.type === 'bus' && panel.stopId) {
      getStopArrivals(panel.stopId).then(data => {
        stopArrivals[panel.stopId!] = data
          .sort((a: any, b: any) => a.timeToStation - b.timeToStation)
          .slice(0, 8);
      }).catch(() => {});
    } else if (panel.type === 'train' && panel.crs) {
      getDepartures(panel.crs, 8, panel.platform ?? null).then(({ departures, platforms }) => {
        trainData[panel.crs!] = { departures, platforms, error: '', loading: false };
      }).catch(() => {});
    }
  }

  function removePanel(id: string) {
    panels = panels.filter(p => p.id !== id);
    savePanels(panels);
    if (panels.length === 0) editMode = false;
  }

  function handleDndConsider(e: CustomEvent<{ items: TransportPanel[] }>) {
    panels = e.detail.items;
  }

  function handleDndFinalize(e: CustomEvent<{ items: TransportPanel[] }>) {
    panels = e.detail.items;
    savePanels(panels);
  }

  function changePlatform(panelId: string, platform: string | null) {
    panels = panels.map(p => p.id === panelId ? { ...p, platform } : p);
    savePanels(panels);
    platformDropdownOpen = null;
    // Re-fetch for that station
    const panel = panels.find(p => p.id === panelId);
    if (panel?.crs) {
      trainData[panel.crs] = { departures: [], platforms: trainData[panel.crs]?.platforms ?? [], error: '', loading: true };
      getDepartures(panel.crs, 8, platform).then(({ departures, platforms }) => {
        trainData[panel.crs!] = { departures, platforms, error: '', loading: false };
      }).catch((e: any) => {
        trainData[panel.crs!] = { departures: [], platforms: trainData[panel.crs!]?.platforms ?? [], error: e.message, loading: false };
      });
    }
  }

  const FLIP_DURATION_MS = 200;

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

  <!-- Transport Section -->
  <div class="transport-section grid-full">
  <div class="transport-header">
    <span class="transport-title">TRANSPORT</span>
    {#if editMode}
      <button class="edit-done-btn" onclick={() => { editMode = false; }}>DONE</button>
    {:else}
      <button class="edit-toggle-btn" onclick={() => { editMode = true; }}>&#8942;</button>
    {/if}
  </div>

  <!-- DnD Transport Panels -->
  <div
    class="transport-zone"
    use:dndzone={{ items: panels, flipDurationMs: FLIP_DURATION_MS, type: 'transport', dragDisabled: !editMode }}
    onconsider={handleDndConsider}
    onfinalize={handleDndFinalize}
  >
    {#each panels as panel (panel.id)}
      <div class="board-section" animate:flip={{ duration: FLIP_DURATION_MS }}>
        {#if panel.type === 'bus'}
          <!-- Bus Panel -->
          <div class="section-header">
            {#if editMode}
              <button class="remove-btn" onclick={() => removePanel(panel.id)}>&#10005;</button>
            {/if}
            <span class="section-type-badge badge-bus">BUS</span>
            {#if /\(stop [a-z0-9]+\)/i.test(panel.label)}
              <span class="section-type-badge badge-stop-letter">
                {panel.label.match(/\(stop ([a-z0-9]+)\)/i)?.[1].toUpperCase()}
              </span>
            {/if}
            <span class="section-label">{panel.label.replace(/\s*\(stop [a-z0-9]+\)/i, '').toUpperCase()}</span>
          </div>
          <div class="col-header-row col-header-yellow">
            <span class="col-route">ROUTE</span>
            <span class="col-dest">DESTINATION</span>
            <span class="col-mins">MINS</span>
          </div>
          {#if stopErrors[panel.stopId!]}
            <div class="led-row"><span class="error-text">{stopErrors[panel.stopId!]}</span></div>
          {:else if (stopArrivals[panel.stopId!] ?? []).length === 0}
            <div class="led-row"><span class="loading-text">AWAITING DATA...</span></div>
          {:else}
            {#each stopArrivals[panel.stopId!] as arrival, i}
              {@const mins = formatMins(arrival.timeToStation)}
              <div class="led-row" class:row-alt={i % 2 === 1}>
                <span class="col-route led-bold led-yellow">{arrival.lineName}</span>
                <span class="col-dest led-yellow">{(([arrival.towards, arrival.destinationName].find(v => v && v !== 'null')) || '—').toUpperCase()}</span>
                <span class="col-mins" class:due-blink={mins === 'DUE'} class:due-text={mins === 'DUE'}>{mins}</span>
              </div>
            {/each}
          {/if}
        {:else}
          <!-- Train Panel -->
          {@const td = trainData[panel.crs!] ?? { departures: [], error: '', loading: true }}
          <div class="section-header">
            {#if editMode}
              <button class="remove-btn" onclick={() => removePanel(panel.id)}>&#10005;</button>
            {/if}
            <span class="section-type-badge badge-train">TRAIN</span>
            <span class="section-label">{panel.label.toUpperCase()}</span>
            <span class="section-label-sep">—</span>
            <span class="platform-selector" style="position: relative;">
              <button class="platform-tap" onclick={() => { platformDropdownOpen = platformDropdownOpen === panel.id ? null : panel.id; }}>
                {panel.platform ? `PLATFORM ${panel.platform}` : 'ALL PLATFORMS'}
                <span class="platform-caret">&#9662;</span>
              </button>
              {#if platformDropdownOpen === panel.id}
                {@const knownPlatforms = trainData[panel.crs!]?.platforms ?? []}
                <div class="platform-dropdown">
                  <button class="plat-option" class:plat-active={panel.platform === null} onclick={() => changePlatform(panel.id, null)}>ALL</button>
                  {#each knownPlatforms as plat}
                    <button class="plat-option" class:plat-active={panel.platform === plat} onclick={() => changePlatform(panel.id, plat)}>{plat}</button>
                  {/each}
                </div>
              {/if}
            </span>
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
        {/if}
      </div>
    {/each}
  </div>

  <!-- Add Stop -->
  <button class="add-card" onclick={() => { showAddModal = true; }}>
    <span class="add-card-text">+ ADD STOP</span>
  </button>
  </div><!-- end transport-section -->
</div>

<!-- Add Stop Modal -->
{#if showAddModal}
  <AddStopModal onAdd={addPanel} onClose={() => { showAddModal = false; }} />
{/if}

<style>
  /* ── LED Blink Animation ── */
  @keyframes led-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .due-blink {
    animation: led-blink 1.5s ease-in-out infinite;
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

  .badge-stop-letter {
    background: #1a1200;
    color: #FFD600;
    border: 1px solid #3a2a00;
    flex-shrink: 0;
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
  }

  @media (max-width: 640px) {
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

  /* ── Transport Section Header ── */
  .transport-section {
    background: #0f0f0f;
    border: 1px solid #2a1a00;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 0 0 1px #000, 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 24px rgba(255, 106, 0, 0.04);
  }

  .transport-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 24px;
    background: #111;
    border-bottom: 1px solid #1a1200;
    font-family: 'Share Tech Mono', monospace;
  }

  .transport-title {
    color: #FFD600;
    font-size: 0.85rem;
    font-weight: bold;
    letter-spacing: 3px;
  }

  .edit-toggle-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 1.4rem;
    cursor: pointer;
    padding: 4px 10px;
    line-height: 1;
    letter-spacing: 0;
  }

  .edit-toggle-btn:hover {
    color: #FFD600;
  }

  .edit-done-btn {
    background: none;
    border: 1px solid #FFD600;
    color: #FFD600;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 2px;
    padding: 4px 14px;
    cursor: pointer;
    border-radius: 2px;
  }

  .edit-done-btn:hover {
    background: #1a1200;
  }

  /* ── Transport DnD Zone ── */
  .transport-zone {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 16px;
  }

  /* ── Remove Button ── */
  .remove-btn {
    background: none;
    border: none;
    color: #FF3333;
    font-size: 1rem;
    cursor: pointer;
    padding: 0 8px 0 0;
    line-height: 1;
    text-shadow: 0 0 8px rgba(255, 51, 51, 0.4);
    font-family: 'Share Tech Mono', monospace;
  }

  .remove-btn:hover {
    color: #FF6666;
  }

  /* ── Add Card ── */
  .add-card {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 18px 24px;
    border: none;
    border-top: 1px solid #1a1200;
    background: transparent;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-card:hover {
    background: #0a0a0a;
  }

  .add-card-text {
    color: #FFD600;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.85rem;
    font-weight: bold;
    letter-spacing: 3px;
    text-shadow: 0 0 8px rgba(255, 214, 0, 0.3);
  }

  /* ── Platform Selector ── */
  .section-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section-label-sep {
    flex-shrink: 0;
    margin: 0 4px;
  }

  .platform-selector {
    flex-shrink: 0;
  }

  .platform-tap {
    background: none;
    border: 1px solid #2a1a00;
    color: #FFD600;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 2px;
    padding: 3px 10px;
    cursor: pointer;
    border-radius: 2px;
    white-space: nowrap;
  }

  .platform-tap:hover {
    border-color: #FF6A00;
    background: #1a1200;
  }

  .platform-caret {
    font-size: 0.6rem;
    margin-left: 4px;
  }

  .platform-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: #111;
    border: 1px solid #2a1a00;
    border-radius: 4px;
    z-index: 100;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    min-width: 60px;
  }

  .plat-option {
    background: none;
    border: none;
    border-bottom: 1px solid #1a1200;
    color: #FF6A00;
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.8rem;
    letter-spacing: 2px;
    padding: 8px 14px;
    cursor: pointer;
    text-align: center;
  }

  .plat-option:last-child {
    border-bottom: none;
  }

  .plat-option:hover {
    background: #1a1200;
    color: #FFD600;
  }

  .plat-option.plat-active {
    color: #FFD600;
    background: #1a1200;
    text-shadow: 0 0 8px rgba(255, 214, 0, 0.4);
  }

  /* ── DnD visual feedback ── */
  :global(.transport-zone [aria-grabbed="true"]) {
    outline: 1px solid #FF6A00;
    opacity: 0.7;
    box-shadow: 0 0 20px rgba(255, 106, 0, 0.2);
  }

  /* ── Responsive overrides for transport zone ── */
  @media (max-width: 900px) {
    .transport-zone {
      grid-template-columns: 1fr;
    }
  }
</style>
