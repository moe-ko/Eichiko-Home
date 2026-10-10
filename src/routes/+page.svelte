<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { dndzone } from 'svelte-dnd-action';
  import { getAllLineStatusByMode, getStopArrivals, getStationDisruptions } from '$lib/api/tfl';
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
  let lastUpdated = $state<Date | null>(null);
  let disruptions: any[] = $state([]);
  let disruptionsError = $state('');
  let alertPanelOverride: boolean | null = $state(null);
  const alertPanelCollapsed = $derived(alertPanelOverride ?? (disruptions.length === 0 && !disruptionsError));
  let alertSearchQuery = $state('');
  let alertSearchResults: any[] = $state([]);
  let alertSearchLoading = $state(false);
  let alertSearchSubmitted = $state('');
  let alertSuggestions: any[] = $state([]);
  let showAlertSuggestions = $state(false);
  let alertSuggestionIndex = $state(-1);
  let alertSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let expandedAlerts: Record<string, boolean> = $state({});

  // Client-side cache of the merged stop-disruption feed, shared by refresh, suggestions and search
  const DISRUPTION_FEED_TTL_MS = 5 * 60 * 1000;
  let disruptionFeed: { data: any[]; fetchedAt: number } | null = null;
  let disruptionFeedPending: Promise<any[]> | null = null;

  async function loadDisruptionFeed(): Promise<any[]> {
    if (disruptionFeed && Date.now() - disruptionFeed.fetchedAt < DISRUPTION_FEED_TTL_MS) {
      return disruptionFeed.data;
    }
    if (disruptionFeedPending) return disruptionFeedPending;
    disruptionFeedPending = (async () => {
      try {
        const data = await getStationDisruptions();
        disruptionFeed = { data, fetchedAt: Date.now() };
        return data;
      } finally {
        disruptionFeedPending = null;
      }
    })();
    return disruptionFeedPending;
  }

  function toggleEvent(key: string) {
    expandedEvents[key] = !expandedEvents[key];
  }

  function toggleAlert(key: string) {
    expandedAlerts[key] = !expandedAlerts[key];
  }

  function toggleAlertPanel() {
    alertPanelOverride = !alertPanelCollapsed;
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
    if (alertSearchDebounceTimer) clearTimeout(alertSearchDebounceTimer);
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
    await Promise.all([fetchBusArrivals(), fetchTrainDepartures(), loadLineStatus(), fetchAppointments(), fetchDisruptions()]);
    lastUpdated = new Date();
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

  async function fetchDisruptions() {
    try {
      const busPanels = panels.filter(p => p.type === 'bus' && p.stopId);
      const trainPanels = panels.filter(p => p.type === 'train' && p.crs);
      
      const busStopIds = busPanels.map(p => p.stopId!.toUpperCase());
      const trainLabels = trainPanels.map(p => normalizeStationName(p.label));
      
      const allDisruptions = await loadDisruptionFeed();

      const now = new Date();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      // Filter to relevant disruptions for user's stations
      const relevant = allDisruptions.filter((d: any) => {
        const mode = (d.mode || '').toLowerCase();
        // Bus items are always appearance Information, so filter bus by type instead
        if (mode === 'bus') {
          if (d.type !== 'Closure' && d.type !== 'Part Closure') return false;
        } else if (!['PlannedWork', 'RealTime'].includes(d.appearance)) {
          return false;
        }
        // Within next 7 days
        const fromDate = new Date(d.fromDate).getTime();
        if (fromDate > now.getTime() + sevenDays) return false;
        if (new Date(d.toDate).getTime() < now.getTime()) return false;
        
        const atco = (d.atcoCode || '').toUpperCase();
        const stationAtco = (d.stationAtcoCode || '').toUpperCase();
        const commonName = normalizeStationName(d.commonName || '');
        
        // Match bus stops: exact NaPTAN stop ID only
        if (mode === 'bus') {
          return busStopIds.some(id => atco === id || stationAtco === id);
        }
        
        // Match train stations: exact normalised station name
        if (mode === 'national-rail' || mode === 'tube' || mode === 'overground' || mode === 'dlr' || mode === 'elizabeth-line') {
          return commonName !== '' && trainLabels.includes(commonName);
        }
        
        return false;
      });
      
      const typeRank = (type: string) =>
        type === 'Closure' ? 0 : type === 'Part Closure' ? 1 : type === 'Interchange Message' ? 2 : 3;
      const fromTime = (d: any) => new Date(d.fromDate).getTime();

      // Group by station so tube and rail items for the same named station collapse into one
      const groups = new Map<string, any[]>();
      for (const d of relevant) {
        const key = (d.mode || '').toLowerCase() === 'bus'
          ? `bus:${(d.atcoCode || '').toUpperCase()}`
          : `train:${normalizeStationName(d.commonName || '')}`;
        const group = groups.get(key);
        if (group) group.push(d);
        else groups.set(key, [d]);
      }

      // One alert per station: latest started, else soonest upcoming. TfL DisruptedPoint
      // has no announcement timestamp, so fromDate is used.
      const chosen = [...groups.values()].map(group => {
        const started = group.filter(d => fromTime(d) <= now.getTime());
        if (started.length > 0) {
          return started.sort((a, b) => fromTime(b) - fromTime(a) || typeRank(a.type) - typeRank(b.type))[0];
        }
        return group.sort((a, b) => fromTime(a) - fromTime(b) || typeRank(a.type) - typeRank(b.type))[0];
      });

      // Latest first, most severe as tie-break
      chosen.sort((a: any, b: any) => fromTime(b) - fromTime(a) || typeRank(a.type) - typeRank(b.type));

      const next = chosen.slice(0, 10);
      if ((next.length === 0) !== (disruptions.length === 0)) alertPanelOverride = null;
      disruptions = next;
      disruptionsError = '';
    } catch (e: any) {
      disruptionsError = e.message;
      disruptions = [];
    }
  }

  // Normalize station names for exact matching (remove prefixes/suffixes)
  function normalizeStationName(name: string): string {
    return name
      .toUpperCase()
      .replace(/^LONDON\s+/, '')
      .replace(/\s+(UNDERGROUND|RAIL|DLR)\s+STATION$/, '')
      .replace(/\s+STATION$/, '')
      .replace(/\s+UNDERGROUND$/, '')
      .trim();
  }

  async function searchStationDisruptions(query: string) {
    if (!query.trim()) {
      alertSearchResults = [];
      alertSearchSubmitted = '';
      return;
    }
    alertSearchSubmitted = query.trim();
    alertSearchLoading = true;
    try {
      const allDisruptions = await loadDisruptionFeed();
      const q = query.trim().toUpperCase();
      // Search by station name, atcoCode, stationAtcoCode, or CRS code
      alertSearchResults = allDisruptions.filter((d: any) => {
        const name = (d.commonName || '').toUpperCase();
        const atco = (d.atcoCode || '').toUpperCase();
        const stationAtco = (d.stationAtcoCode || '').toUpperCase();
        return name.includes(q) || atco.includes(q) || stationAtco.includes(q);
      }).slice(0, 10);
      alertSearchLoading = false;
    } catch (e: any) {
      alertSearchLoading = false;
      alertSearchResults = [];
    }
  }

  function clearAlertSearch() {
    alertSearchQuery = '';
    alertSearchResults = [];
    alertSearchSubmitted = '';
    alertSuggestions = [];
    showAlertSuggestions = false;
    alertSuggestionIndex = -1;
  }

  function handleAlertSearchInput() {
    if (alertSearchDebounceTimer) clearTimeout(alertSearchDebounceTimer);
    
    const query = alertSearchQuery.trim();
    if (query.length < 2) {
      alertSuggestions = [];
      showAlertSuggestions = false;
      alertSuggestionIndex = -1;
      return;
    }
    
    alertSearchDebounceTimer = setTimeout(async () => {
      try {
        const allDisruptions = await loadDisruptionFeed();
        // A newer keystroke superseded this one
        if (alertSearchQuery.trim() !== query) return;
        const q = query.toUpperCase();
        const seen = new Set<string>();
        alertSuggestions = allDisruptions
          .filter((d: any) => {
            const name = (d.commonName || '').toUpperCase();
            const atco = (d.atcoCode || '').toUpperCase();
            const stationAtco = (d.stationAtcoCode || '').toUpperCase();
            const key = d.commonName + '|' + (d.atcoCode || d.stationAtcoCode);
            if (seen.has(key)) return false;
            seen.add(key);
            return name.includes(q) || atco.includes(q) || stationAtco.includes(q);
          })
          .slice(0, 8);
        showAlertSuggestions = alertSuggestions.length > 0;
        alertSuggestionIndex = -1;
      } catch (e) {
        alertSuggestions = [];
        showAlertSuggestions = false;
      }
    }, 300);
  }

  function handleAlertSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showAlertSuggestions && alertSuggestionIndex >= 0) {
        selectAlertSuggestion(alertSuggestions[alertSuggestionIndex]);
      } else {
        searchStationDisruptions(alertSearchQuery);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showAlertSuggestions && alertSuggestions.length > 0) {
        alertSuggestionIndex = (alertSuggestionIndex + 1) % alertSuggestions.length;
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showAlertSuggestions && alertSuggestions.length > 0) {
        alertSuggestionIndex = alertSuggestionIndex <= 0 ? alertSuggestions.length - 1 : alertSuggestionIndex - 1;
      }
    } else if (e.key === 'Escape') {
      showAlertSuggestions = false;
      alertSuggestionIndex = -1;
    }
  }

  function handleAlertSearchFocus() {
    if (alertSearchQuery.trim().length >= 2 && alertSuggestions.length > 0) {
      showAlertSuggestions = true;
    }
  }

  function handleAlertSearchBlur() {
    setTimeout(() => {
      showAlertSuggestions = false;
      alertSuggestionIndex = -1;
    }, 200);
  }

  function selectAlertSuggestion(s: any) {
    alertSearchQuery = s.commonName;
    showAlertSuggestions = false;
    alertSuggestionIndex = -1;
    searchStationDisruptions(alertSearchQuery);
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

  function formatDate(iso: string): string {
    const d = new Date(iso);
    const day = d.getDate().toString().padStart(2, '0');
    const mon = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${mon} ${hh}:${mm}`;
  }

  function formatLastUpdated(date: Date): string {
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
</script>

<!-- Grid layout for tablet -->
<div class="board-grid">
  <!-- Station Alerts (collapsible, hazard tape frame while alerts are active) -->
  <div class="board-section grid-full" class:alert-panel={disruptions.length > 0}>
    <button type="button" class="section-header section-toggle" aria-expanded={!alertPanelCollapsed} onclick={toggleAlertPanel}>
      <span class="section-title-group">
        <span>STATION ALERTS</span>
        <span class="tap-hint">{disruptions.length > 0 ? `${disruptions.length} ACTIVE` : disruptionsError ? 'ALERTS UNAVAILABLE' : 'NO ACTIVE ALERTS'} · TAP TO {alertPanelCollapsed ? 'EXPAND' : 'COLLAPSE'}</span>
      </span>
      <span class="toggle-icon">{alertPanelCollapsed ? '▶' : '▼'}</span>
    </button>
    {#if !alertPanelCollapsed}
      <div class="alert-content">
        <!-- Search Input with Suggestions -->
        <div class="alert-search">
          <div class="alert-search-field">
            <input
              type="text"
              class="alert-search-input"
              placeholder="SEARCH STATION... (NAME OR CODE e.g. NEH)"
              bind:value={alertSearchQuery}
              oninput={handleAlertSearchInput}
              onkeydown={handleAlertSearchKeydown}
              onfocus={handleAlertSearchFocus}
              onblur={handleAlertSearchBlur}
            />
            <span class="alert-search-icon">SEARCH</span>
          </div>

          <!-- Suggestions Dropdown -->
          {#if showAlertSuggestions && alertSuggestions.length > 0}
            <div class="alert-suggestions-dropdown">
              {#each alertSuggestions as s, i}
                <button
                  class="alert-suggestion-row"
                  class:alert-suggestion-active={i === alertSuggestionIndex}
                  class:result-alt={i % 2 === 1}
                  onclick={() => selectAlertSuggestion(s)}
                >
                  <span class="suggestion-name">{s.commonName.toUpperCase()}</span>
                  <span class="suggestion-code">{s.atcoCode || s.stationAtcoCode}</span>
                  <span class="suggestion-mode">{s.mode.toUpperCase()}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        {#if alertSearchSubmitted && !showAlertSuggestions}
          <div class="alert-search-results-header">
            <span class="alert-search-label">SEARCH RESULTS FOR: {alertSearchSubmitted.toUpperCase()}</span>
            <button class="alert-search-clear" onclick={clearAlertSearch}>CLEAR</button>
          </div>
        {/if}

        <div class="alert-list">
          {#each (alertSearchSubmitted ? alertSearchResults : disruptions) as d, i}
            {@const alertKey = `${d.atcoCode}|${d.fromDate}|${d.description}`}
            {@const isExpanded = expandedAlerts[alertKey] === true}
            <div class="alert-item" class:alert-planned={d.appearance === 'PlannedWork'} class:alert-realtime={d.appearance === 'RealTime'} class:alert-information={d.appearance === 'Information'}>
              <button type="button" class="alert-meta alert-toggle" aria-expanded={isExpanded} onclick={() => toggleAlert(alertKey)}>
                <span class="alert-station">{d.commonName?.toUpperCase()}</span>
                <span class="alert-type">{d.type?.toUpperCase()}</span>
                <span class="alert-mode">{d.mode?.toUpperCase()}</span>
                <span class="alert-chevron">{isExpanded ? '▼' : '▶'}</span>
              </button>
              {#if isExpanded}
                <div class="alert-detail">
                  <div class="alert-desc">{d.description}</div>
                  <div class="alert-dates">
                    <span class="alert-from">FROM: {formatDate(d.fromDate)}</span>
                    <span class="alert-to">TO: {formatDate(d.toDate)}</span>
                    <span class="alert-code">{d.atcoCode || d.stationAtcoCode}</span>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
          {#if alertSearchSubmitted && !alertSearchLoading && alertSearchResults.length === 0}
            <div class="alert-empty">
              <span class="alert-empty-icon">SEARCH</span>
              <span>NO DISRUPTIONS FOUND FOR "{alertSearchSubmitted.toUpperCase()}"</span>
            </div>
          {:else if !alertSearchSubmitted && disruptionsError}
            <div class="led-row"><span class="error-text">ALERTS UNAVAILABLE: {disruptionsError}</span></div>
          {:else if !alertSearchSubmitted && disruptions.length === 0}
            <div class="alert-empty">
              <span class="alert-empty-icon">OK</span>
              <span>NO ACTIVE ALERTS FOR YOUR STATIONS</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>

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
    {#if lastUpdated}
      <span class="last-updated">UPDATED {formatLastUpdated(lastUpdated)}</span>
    {/if}
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
                <span class="col-dest led-yellow">{(([arrival.destinationName, arrival.towards].find(v => v && v !== 'null')) || '—').toUpperCase()}</span>
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
    background: var(--bg-card-alt);
  }

  .grid-full {
    grid-column: 1 / -1;
  }

  /* ── Sections (Card Style) ── */
  .board-section {
    margin: 0;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .section-header {
    background: var(--bg-secondary);
    padding: 10px 24px;
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: bold;
    letter-spacing: 3px;
    font-family: 'Share Tech Mono', monospace;
    border-bottom: 1px solid var(--border-color);
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
    background: var(--accent);
    color: #000;
  }

  .badge-train {
    background: #00AAFF;
    color: #000;
  }

  .badge-stop-letter {
    background: var(--bg-card-alt);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
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
    color: var(--text-muted);
    font-size: 0.65rem;
    letter-spacing: 1.5px;
    font-weight: normal;
  }

  .toggle-icon {
    color: var(--text-secondary);
    font-size: 0.75rem;
  }

  .section-toggle:hover {
    background: var(--bg-card-alt);
  }

  /* ── Column Headers ── */
  .col-header-row {
    display: flex;
    padding: 8px 24px;
    background: var(--bg-card-alt);
    color: var(--text-primary);
    font-size: 0.7rem;
    font-weight: bold;
    letter-spacing: 2px;
    font-family: 'Share Tech Mono', monospace;
  }

  .col-header-yellow {
    background: var(--bg-card-alt);
    color: var(--text-secondary);
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
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
    padding: 10px 24px;
    font-family: 'LED Dot-Matrix', monospace;
    text-transform: uppercase;
    letter-spacing: 2px;
    display: flex;
    font-size: 1rem;
    color: var(--text-primary);
    text-shadow: 0 0 8px var(--accent-glow);
  }

  .led-row.row-alt {
    background: var(--bg-card-alt);
  }

  .board-section .led-row:last-child {
    border-bottom: none;
  }

  .led-bold {
    font-weight: bold;
  }

  /* ── Yellow LED text for route/destination ── */
  .led-yellow {
    color: var(--led-yellow) !important;
    text-shadow: 0 0 8px var(--led-yellow-glow) !important;
  }

  /* ── Line Status Columns (with dot leaders) ── */
  .led-row .col-line {
    flex-shrink: 0;
  }

  .line-dots {
    flex: 1;
    border-bottom: 1px dotted var(--border-color);
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
    color: var(--led-red) !important;
    text-shadow: 0 0 8px var(--led-red-glow) !important;
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
    color: var(--led-green) !important;
    text-shadow: 0 0 8px var(--led-green-glow) !important;
  }

  .status-delay {
    color: var(--led-red) !important;
    text-shadow: 0 0 8px var(--led-red-glow) !important;
  }

  .error-text {
    color: var(--led-red);
    font-size: 0.8rem;
    text-shadow: 0 0 8px var(--led-red-glow);
  }

  .loading-text {
    color: var(--text-muted);
    font-size: 0.8rem;
    text-shadow: none;
    font-family: 'LED Dot-Matrix', monospace;
    letter-spacing: 2px;
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
    border-right: 1px solid var(--border-color);
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
      border-bottom: 1px solid var(--border-color);
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
    border-bottom: 1px solid var(--border-color);
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    align-items: center;
  }

  .event-row:hover {
    background: var(--bg-card-alt);
  }

  .event-row.row-alt:hover {
    background: var(--bg-card-alt);
  }

  .event-chevron {
    flex-shrink: 0;
    width: 24px;
    text-align: right;
    color: var(--text-secondary);
    font-size: 0.75rem;
    text-shadow: 0 0 6px var(--led-yellow-glow);
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
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
    padding: 8px 24px 14px 24px;
    font-family: 'LED Dot-Matrix', monospace;
    letter-spacing: 2px;
    font-size: 0.9rem;
    color: var(--text-primary);
    text-shadow: 0 0 8px var(--accent-glow);
    text-transform: none;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 6px;
  }

  .led-sub-row.row-alt {
    background: var(--bg-card-alt);
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
    color: var(--text-secondary);
    text-shadow: 0 0 6px var(--led-yellow-glow);
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
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .transport-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 24px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    font-family: 'Share Tech Mono', monospace;
  }

  .transport-title {
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: bold;
    letter-spacing: 3px;
  }

  .last-updated {
    color: var(--text-muted);
    font-size: 0.65rem;
    letter-spacing: 1px;
    margin-left: auto;
    margin-right: 16px;
  }

  .edit-toggle-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.4rem;
    cursor: pointer;
    padding: 4px 10px;
    line-height: 1;
    letter-spacing: 0;
  }

  .edit-toggle-btn:hover {
    color: var(--text-secondary);
  }

  .edit-done-btn {
    background: none;
    border: 1px solid var(--text-secondary);
    color: var(--text-secondary);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 2px;
    padding: 4px 14px;
    cursor: pointer;
    border-radius: 2px;
  }

  .edit-done-btn:hover {
    background: var(--bg-card-alt);
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
    color: var(--led-red);
    font-size: 1rem;
    cursor: pointer;
    padding: 0 8px 0 0;
    line-height: 1;
    text-shadow: 0 0 8px var(--led-red-glow);
    font-family: 'Share Tech Mono', monospace;
  }

  .remove-btn:hover {
    color: var(--led-red);
    opacity: 0.7;
  }

  /* ── Add Card ── */
  .add-card {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 18px 24px;
    border: none;
    border-top: 1px solid var(--border-color);
    background: transparent;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-card:hover {
    background: var(--bg-card-alt);
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

  /* ── Alert Panel: hazard tape frame while alerts are active ── */
  .alert-panel {
    padding: 6px;
    border: 0;
    background: repeating-linear-gradient(
      -45deg,
      #000 0,
      #000 6px,
      #FFD600 6px,
      #FFD600 12px
    );
  }

  .alert-content {
    padding: 16px 24px;
    background: #0a0a0a;
  }

  .alert-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .alert-item {
    background: #0d0d0d;
    border: 1px solid #1a1200;
    border-radius: 4px;
    padding: 10px 18px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.3s, box-shadow 0.3s;
  }

  .alert-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: #FFD600;
  }

  .alert-planned::before {
    background: linear-gradient(180deg, #FFD600, #FF6A00);
    box-shadow: 0 0 8px #FFD600;
  }

  .alert-realtime::before {
    background: linear-gradient(180deg, #FF4444, #FF0000);
    box-shadow: 0 0 8px #FF4444;
  }

  .alert-item:hover {
    border-color: #3a2a00;
    box-shadow: 0 0 16px rgba(255, 214, 0, 0.1);
  }

  .alert-meta {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 0;
    flex-wrap: wrap;
  }

  .alert-toggle {
    width: 100%;
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .alert-chevron {
    margin-left: auto;
    color: #FFD600;
    font-size: 0.7rem;
  }

  .alert-detail {
    margin-top: 10px;
  }

  .alert-station {
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.95rem;
    font-weight: bold;
    letter-spacing: 2px;
    color: #FFD600;
    text-shadow: 0 0 8px rgba(255, 214, 0, 0.5);
  }

  .alert-type {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 1.5px;
    padding: 2px 8px;
    border-radius: 2px;
    background: #1a1200;
    color: #FF6A00;
    border: 1px solid #2a1a00;
  }

  .alert-planned .alert-type {
    background: #2a1a00;
    color: #FFD600;
    border-color: #3a2a00;
  }

  .alert-realtime .alert-type {
    background: #2a0000;
    color: #FF4444;
    border-color: #4a0000;
  }

  .alert-desc {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    color: #ccc;
    letter-spacing: 0.5px;
    text-transform: none;
    margin-bottom: 8px;
  }

  .alert-dates {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 1px;
    color: #888;
  }

  .alert-from,
  .alert-to {
    background: #111;
    padding: 2px 8px;
    border: 1px solid #1a1200;
    border-radius: 2px;
  }

  /* Search styles */
  .alert-search {
    position: relative;
    margin-bottom: 16px;
  }

  .alert-search-field {
    position: relative;
  }

  .alert-search-input {
    width: 100%;
    background: #0d0d0d;
    border: 2px solid #1a1200;
    border-radius: 4px;
    padding: 12px 48px 12px 16px;
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.85rem;
    letter-spacing: 2px;
    color: #FFD600;
    text-transform: uppercase;
    outline: none;
    transition: border-color 0.3s, box-shadow 0.3s;
  }

  .alert-search-input::placeholder {
    color: #4a3a00;
    letter-spacing: 1px;
  }

  .alert-search-input:focus {
    border-color: #FFD600;
    box-shadow: 0 0 16px rgba(255, 214, 0, 0.3);
  }

  .alert-search-icon {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: #4a3a00;
    font-size: 1rem;
    pointer-events: none;
  }

  .alert-search-input:focus + .alert-search-icon {
    color: #FFD600;
  }

  .alert-search-results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #2a1a00;
  }

  .alert-search-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 2px;
    color: #FF6A00;
  }

  .alert-search-clear {
    background: none;
    border: 1px solid #2a1a00;
    color: #FF6A00;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 1.5px;
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 2px;
    transition: all 0.2s;
  }

  .alert-search-clear:hover {
    background: #1a1200;
    border-color: #FF6A00;
    color: #FFD600;
  }

  /* Suggestions dropdown */
  .alert-suggestions-dropdown {
    position: relative;
    margin-top: 4px;
    background: #0d0d0d;
    border: 1px solid #2a1a00;
    border-radius: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 214, 0, 0.1);
    z-index: 100;
    overflow: hidden;
    animation: suggestion-dropdown-in 0.15s ease-out;
  }

  @keyframes suggestion-dropdown-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .alert-suggestion-row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 16px;
    background: none;
    border: none;
    border-bottom: 1px solid #1a1200;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .alert-suggestion-row:last-child {
    border-bottom: none;
  }

  .alert-suggestion-row:hover,
  .alert-suggestion-row.alert-suggestion-active {
    background: #1a1200;
  }

  .suggestion-name {
    flex: 1;
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.8rem;
    letter-spacing: 1.5px;
    color: #FFD600;
    text-shadow: 0 0 6px rgba(255, 214, 0, 0.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .suggestion-code {
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.65rem;
    letter-spacing: 1px;
    color: #FF6A00;
    background: #111;
    padding: 2px 8px;
    border: 1px solid #2a1a00;
    border-radius: 2px;
    white-space: nowrap;
  }

  .suggestion-mode {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    letter-spacing: 1px;
    padding: 2px 8px;
    border-radius: 2px;
    background: #111;
    color: #888;
    border: 1px solid #1a1200;
    white-space: nowrap;
  }

  .alert-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px;
    text-align: center;
    color: #00AAFF;
  }

  .alert-empty-icon {
    font-size: 2rem;
  }

  .alert-empty span {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 2px;
  }

  .alert-mode {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    letter-spacing: 1px;
    padding: 1px 6px;
    border-radius: 2px;
    background: #111;
    color: #888;
    border: 1px solid #1a1200;
  }

  .alert-code {
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.65rem;
    letter-spacing: 1px;
    color: #666;
    background: #111;
    padding: 1px 6px;
    border: 1px solid #1a1200;
    border-radius: 2px;
  }

  .alert-information {
    border-left-color: #00AAFF;
  }

  .alert-information::before {
    background: linear-gradient(180deg, #00AAFF, #0088CC);
    box-shadow: 0 0 8px #00AAFF;
  }

  .alert-information .alert-type {
    background: #001a2a;
    color: #00AAFF;
    border-color: #002a4a;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .alert-content {
      padding: 12px 16px;
    }
    .alert-station {
      font-size: 0.8rem;
    }
    .alert-desc {
      font-size: 0.7rem;
    }
    .alert-dates {
      gap: 8px;
      font-size: 0.55rem;
    }
  }
</style>
