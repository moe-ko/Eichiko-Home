<script lang="ts">
  import { searchBusStops, getStopDetails, searchTflStops, getTflStations, type StopChild, type TflStation } from '$lib/api/search';
  import { getStopArrivals } from '$lib/api/tfl';
  import stations from '$lib/data/stations.json';
  import type { TransportPanel } from '$lib/types/transport';
  import { normalizeStationName } from '$lib/utils/stations';

  type NewPanel = Omit<TransportPanel, 'id'>;
  type RailStation = { name: string; crs: string };
  // One picker row per station and mode; rail is the stations.json match for a National Rail row
  type StationRow = { station: TflStation; mode: string; rail: RailStation | null };

  let { onAdd, onClose }: { onAdd: (panel: NewPanel) => void; onClose: () => void } = $props();

  let activeTab: 'bus' | 'trains' = $state('bus');
  let query = $state('');
  let busResults: { id: string; name: string }[] = $state([]);
  let busLoading = $state(false);
  let busError = $state('');
  let busAdding = $state(false);
  let trainResults: RailStation[] = $state([]);
  let selectedStation: RailStation | null = $state(null);
  let stationPlatforms: string[] = $state([]);
  let platformsLoading = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = $state(null);

  // Bus stop direction picker (when a parent stop has multiple children)
  let busChildren: StopChild[] = $state([]);
  let busParentName = $state('');

  // Trains tab: National Rail (stations.json, Huxley departures) plus TfL modes
  // (tube, DLR, Overground, Elizabeth line, tram, river bus, cable car)
  const RAIL_MODE = 'national-rail';
  const TFL_MODES = ['tube', 'dlr', 'overground', 'elizabeth-line', 'tram', 'river-bus', 'cable-car'];
  const TRAIN_CHIPS = [RAIL_MODE, ...TFL_MODES];
  const MODE_LABELS: Record<string, string> = {
    'tube': 'TUBE',
    'dlr': 'DLR',
    'overground': 'OVERGROUND',
    'elizabeth-line': 'ELIZABETH',
    'tram': 'TRAM',
    'river-bus': 'RIVER',
    'cable-car': 'CABLE CAR',
    'national-rail': 'RAIL',
  };
  let trainsMode: string | null = $state(null); // null = all modes; RAIL is not sent to TfL
  const showRail = $derived(trainsMode === null || trainsMode === RAIL_MODE);
  const showTfl = $derived(trainsMode !== RAIL_MODE);
  let tflResults: { id: string; name: string; modes: string[] }[] = $state([]);
  let tflLoading = $state(false);
  let tflError = $state('');
  let tflResolving = $state(false);
  let tflSearchSeq = 0;
  // Station picker (search result resolves to several stations, e.g. an interchange)
  let tflCandidates: StationRow[] = $state([]);
  let tflParentName = $state('');
  // TfL platform step
  let tflSelected: { station: TflStation; mode: string } | null = $state(null);
  let tflPlatforms: string[] = $state([]);
  let tflPlatformsLoading = $state(false);

  function handleQueryInput() {
    if (activeTab === 'bus') {
      debouncedBusSearch();
    } else {
      filterTrains();
      if (showTfl) debouncedTflSearch();
    }
  }

  function debouncedBusSearch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    busError = '';
    const searchQuery = query.replace(/\s*\([^)]*\)/g, '').trim();
    if (searchQuery.length < 2) {
      busResults = [];
      busLoading = false;
      return;
    }
    busLoading = true;
    debounceTimer = setTimeout(async () => {
      try {
        busResults = await searchBusStops(searchQuery);
        busLoading = false;
      } catch (e: any) {
        busError = e.message;
        busLoading = false;
      }
    }, 300);
  }

  // Collapse repeated letters so "canon" matches "Cannon"
  function squashRepeats(s: string): string {
    return s.replace(/(.)\1+/g, '$1');
  }

  function filterTrains() {
    if (query.trim().length < 1) {
      trainResults = [];
      return;
    }
    const q = query.trim().toLowerCase();
    const qs = squashRepeats(q);
    trainResults = (stations as RailStation[])
      .map(s => {
        const name = s.name.toLowerCase();
        const nameSq = squashRepeats(name);
        const crs = s.crs.toLowerCase();
        const exact = name.includes(q) || crs === q;
        if (!exact && !nameSq.includes(qs)) return null;
        const words = name.split(/[\s()]+/).filter(Boolean);
        const rank =
          name === q || crs === q ? 0
          : name.startsWith(q) || nameSq.startsWith(qs) ? 1
          : words.some(w => w.startsWith(q) || squashRepeats(w).startsWith(qs)) ? 2
          : 3;
        const london = name.startsWith('london ') || name.endsWith('(london)');
        return { s, exact, rank, london };
      })
      .filter(m => m !== null)
      // Exact matches before typo matches, then best match position, then London stations first
      .sort((a, b) =>
        Number(b.exact) - Number(a.exact) ||
        a.rank - b.rank ||
        Number(b.london) - Number(a.london) ||
        a.s.name.localeCompare(b.s.name))
      .map(m => m.s)
      .slice(0, 10);
  }

  function switchTab(tab: 'bus' | 'trains') {
    activeTab = tab;
    query = '';
    busResults = [];
    trainResults = [];
    busError = '';
    busLoading = false;
    busAdding = false;
    busChildren = [];
    busParentName = '';
    selectedStation = null;
    stationPlatforms = [];
    platformsLoading = false;
    tflSearchSeq++;
    trainsMode = null;
    tflResults = [];
    tflLoading = false;
    tflError = '';
    tflResolving = false;
    tflCandidates = [];
    tflParentName = '';
    tflSelected = null;
    tflPlatforms = [];
    tflPlatformsLoading = false;
  }

  function debouncedTflSearch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    tflError = '';
    tflResolving = false;
    const seq = ++tflSearchSeq;
    const searchQuery = query.trim();
    if (searchQuery.length < 2) {
      tflResults = [];
      tflLoading = false;
      return;
    }
    tflLoading = true;
    const modes = trainsMode ? [trainsMode] : TFL_MODES;
    debounceTimer = setTimeout(async () => {
      try {
        const results = await searchTflStops(searchQuery, modes);
        // A newer keystroke, chip change or tab switch superseded this search
        if (seq !== tflSearchSeq) return;
        tflResults = results;
        tflLoading = false;
      } catch (e: any) {
        if (seq !== tflSearchSeq) return;
        tflError = e.message;
        tflLoading = false;
      }
    }, 300);
  }

  function selectTrainsMode(mode: string | null) {
    trainsMode = mode;
    if (mode === RAIL_MODE) {
      // RAIL searches stations.json only: drop any pending TfL search or resolve
      if (debounceTimer) clearTimeout(debounceTimer);
      tflSearchSeq++;
      tflResults = [];
      tflLoading = false;
      tflError = '';
      tflResolving = false;
    } else if (query.trim().length >= 2) {
      debouncedTflSearch();
    }
  }

  // Exact normalised name match against stations.json; ambiguous or missing gives null
  function findRailStation(name: string): RailStation | null {
    // TfL writes "King's Cross", stations.json "Kings Cross"
    const railKey = (n: string) => normalizeStationName(n).replace(/['’]/g, '');
    const key = railKey(name);
    const matches = (stations as RailStation[]).filter(s => railKey(s.name) === key);
    return matches.length === 1 ? { name: matches[0].name, crs: matches[0].crs } : null;
  }

  function stationRow(station: TflStation, mode: string): StationRow {
    return { station, mode, rail: mode === RAIL_MODE ? findRailStation(station.name) : null };
  }

  function rowUsable(row: StationRow): boolean {
    return row.mode !== RAIL_MODE || row.rail !== null;
  }

  // A station listed once per mode gets the mode in its row label
  function tflCandidateLabel(row: StationRow): string {
    const name = tflLabel(row.station.name).toUpperCase();
    const repeated = tflCandidates.filter(r => r.station.naptanId === row.station.naptanId).length > 1;
    return repeated ? `${name} · ${MODE_LABELS[row.mode] ?? row.mode.toUpperCase()}` : name;
  }

  function tflLabel(name: string): string {
    return name.replace(/\s+(Underground|Rail|DLR) Station$/i, '');
  }

  async function selectTflResult(result: { id: string; name: string; modes: string[] }) {
    tflResolving = true;
    tflError = '';
    // A keystroke, chip change or tab switch while resolving bumps the sequence and discards this result
    const seq = tflSearchSeq;
    try {
      const stationList = await getTflStations(result.id);
      if (seq !== tflSearchSeq) return;
      const candidates: StationRow[] = [];
      for (const station of stationList) {
        if (trainsMode) {
          if (station.modes.includes(trainsMode)) candidates.push(stationRow(station, trainsMode));
          continue;
        }
        for (const mode of TFL_MODES.filter(m => station.modes.includes(m))) candidates.push(stationRow(station, mode));
        if (station.modes.includes(RAIL_MODE)) {
          const row = stationRow(station, RAIL_MODE);
          // Some hubs list one rail station under two NaPTANs (e.g. Wimbledon), keep one row per CRS
          if (!row.rail || !candidates.some(c => c.rail?.crs === row.rail!.crs)) candidates.push(row);
        }
      }
      const enabled = candidates.filter(rowUsable);
      tflResolving = false;

      // Exactly one usable station and mode: skip the picker
      if (enabled.length === 1) {
        selectCandidate(enabled[0]);
        return;
      }
      if (candidates.length === 0) {
        tflError = 'NO STATIONS WITH LIVE ARRIVALS FOUND';
        return;
      }
      tflCandidates = candidates;
      tflParentName = result.name;
    } catch (e: any) {
      if (seq !== tflSearchSeq) return;
      tflError = e.message;
      tflResolving = false;
    }
  }

  // RAIL rows go to the train platform picker, TfL rows to the TfL one
  function selectCandidate(row: StationRow) {
    if (row.mode === RAIL_MODE) {
      if (row.rail) selectTrainStation(row.rail);
    } else {
      selectTflStation(row.station, row.mode);
    }
  }

  async function selectTflStation(station: TflStation, mode: string) {
    tflSelected = { station, mode };
    tflPlatforms = [];
    tflPlatformsLoading = true;
    try {
      const arrivals = await getStopArrivals(station.naptanId);
      // User went back or picked another station or mode while this was loading
      if (tflSelected?.station.naptanId !== station.naptanId || tflSelected.mode !== mode) return;
      // A station can serve several modes, keep only this mode's platforms
      const names = arrivals
        .filter((a: any) => a.modeName === mode)
        .map((a: any) => a.platformName)
        .filter((n: any) => typeof n === 'string' && n.trim() !== '' && n !== 'null');
      tflPlatforms = [...new Set<string>(names)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } catch { /* leave tflPlatforms empty, ALL is still offered */ }
    tflPlatformsLoading = false;
  }

  function selectTflPlatform(platform: string | null) {
    if (!tflSelected) return;
    onAdd({
      type: 'tfl',
      label: tflLabel(tflSelected.station.name),
      stopId: tflSelected.station.naptanId,
      mode: tflSelected.mode,
      platform,
    });
  }

  function backFromTflPlatforms() {
    tflSelected = null;
    tflPlatforms = [];
    tflPlatformsLoading = false;
  }

  function backFromTflStations() {
    tflCandidates = [];
    tflParentName = '';
  }

  async function selectBusStop(stop: { id: string; name: string }) {
    busAdding = true;
    busError = '';
    try {
      const details = await getStopDetails(stop.id);

      // If parent stop with multiple children → show direction picker
      if (details.children && details.children.length > 1) {
        busChildren = details.children;
        busParentName = stop.name;
        busAdding = false;
        return;
      }

      // Single stop or no children — add directly
      const naptanId = details.children?.[0]?.naptanId ?? details.naptanId;
      const letter = details.children?.[0]?.stopLetter ?? details.stopLetter;
      const label = letter ? `${stop.name} (Stop ${letter})` : stop.name;
      onAdd({ type: 'bus', label, stopId: naptanId });
    } catch {
      onAdd({ type: 'bus', label: stop.name, stopId: stop.id });
    }
  }

  function selectBusChild(child: StopChild) {
    const letter = child.stopLetter;
    const label = letter ? `${busParentName} (Stop ${letter})` : busParentName;
    onAdd({ type: 'bus', label, stopId: child.naptanId });
  }

  function backToResults() {
    busChildren = [];
    busParentName = '';
    stationPlatforms = [];
    platformsLoading = false;
  }

  async function selectTrainStation(station: RailStation) {
    selectedStation = station;
    stationPlatforms = [];
    platformsLoading = true;
    let platforms: string[] = [];
    try {
      const res = await fetch(`/api/rail/departures/${station.crs}?numRows=20`);
      if (res.ok) {
        const data = await res.json();
        const seen = new Set<string>();
        for (const svc of data.trainServices ?? []) {
          if (svc.platform && !seen.has(svc.platform)) seen.add(svc.platform);
        }
        platforms = [...seen].sort((a, b) => {
          const na = parseInt(a), nb = parseInt(b);
          return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
        });
      }
    } catch { /* leave stationPlatforms empty — fallback handles it */ }
    // User went back or picked another station while this was loading
    if (selectedStation?.crs !== station.crs) return;
    stationPlatforms = platforms;
    platformsLoading = false;
  }

  function selectPlatform(platform: string | null) {
    if (!selectedStation) return;
    onAdd({
      type: 'train',
      label: selectedStation.name,
      crs: selectedStation.crs,
      platform,
    });
  }

  // Back to the station picker when the station came from it, else to the results
  function backFromTrainPlatforms() {
    selectedStation = null;
    stationPlatforms = [];
    platformsLoading = false;
  }

  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={handleOverlayClick} onkeydown={() => {}}>
  <div class="modal-content">
    <!-- Header -->
    <div class="modal-header">
      <span class="modal-title">ADD STOP</span>
      <button class="modal-close" onclick={onClose}>&#10005;</button>
    </div>

    <!-- Tabs -->
    <div class="modal-tabs">
      <button
        class="tab-btn"
        class:tab-active-bus={activeTab === 'bus'}
        onclick={() => switchTab('bus')}
      >
        <span class="tab-badge badge-bus">BUS</span>
      </button>
      <button
        class="tab-btn"
        class:tab-active-trains={activeTab === 'trains'}
        onclick={() => switchTab('trains')}
      >
        <span class="tab-badge badge-trains">TRAINS</span>
      </button>
    </div>

    <!-- Bus direction picker (parent stop with multiple children) -->
    {#if busChildren.length > 0}
      <div class="platform-picker">
        <div class="platform-label">SELECT STOP DIRECTION FOR {busParentName.toUpperCase()}</div>
        <div class="results-list">
          {#each busChildren as child, i}
            <button
              class="result-row"
              class:result-alt={i % 2 === 1}
              onclick={() => selectBusChild(child)}
            >
              <span class="result-name">
                {#if child.stopLetter}
                  <span class="child-letter">STOP {child.stopLetter}</span>
                {/if}
                {#if child.towards}
                  <span class="child-towards">&#8594; {child.towards.toUpperCase()}</span>
                {:else if child.commonName}
                  <span class="child-towards">{child.commonName.toUpperCase()}</span>
                {/if}
              </span>
              <span class="result-id">{child.naptanId}</span>
            </button>
          {/each}
        </div>
        <button class="back-btn" onclick={backToResults}>&#8592; BACK TO RESULTS</button>
      </div>

    <!-- Train platform picker -->
    {:else if selectedStation}
      <div class="platform-picker">
        <div class="platform-label">SELECT PLATFORM FOR {selectedStation.name.toUpperCase()}</div>
        <div class="platform-buttons">
          {#if platformsLoading}
            <span class="platform-label" style="font-size: 0.7rem; color: #888;">LOADING PLATFORMS...</span>
          {:else}
            <button class="plat-btn" onclick={() => selectPlatform(null)}>ALL</button>
            {#each stationPlatforms as plat}
              <button class="plat-btn" onclick={() => selectPlatform(plat)}>{plat}</button>
            {/each}
            {#if stationPlatforms.length === 0}
              <button class="plat-btn" onclick={() => selectPlatform('1')}>1</button>
              <button class="plat-btn" onclick={() => selectPlatform('2')}>2</button>
              <button class="plat-btn" onclick={() => selectPlatform('3')}>3</button>
              <button class="plat-btn" onclick={() => selectPlatform('4')}>4</button>
            {/if}
          {/if}
        </div>
        <button class="back-btn" onclick={backFromTrainPlatforms}>&#8592; {tflCandidates.length > 0 ? 'BACK TO STATIONS' : 'BACK TO RESULTS'}</button>
      </div>

    <!-- TfL platform picker -->
    {:else if tflSelected}
      <div class="platform-picker">
        <div class="platform-label">SELECT PLATFORM FOR {tflLabel(tflSelected.station.name).toUpperCase()}</div>
        <div class="platform-buttons">
          {#if tflPlatformsLoading}
            <span class="platform-label" style="font-size: 0.7rem; color: #888;">LOADING PLATFORMS...</span>
          {:else}
            <button class="plat-btn" onclick={() => selectTflPlatform(null)}>ALL</button>
            {#each tflPlatforms as plat}
              <button class="plat-btn" onclick={() => selectTflPlatform(plat)}>{plat.toUpperCase()}</button>
            {/each}
          {/if}
        </div>
        <button class="back-btn" onclick={backFromTflPlatforms}>&#8592; {tflCandidates.length > 0 ? 'BACK TO STATIONS' : 'BACK TO RESULTS'}</button>
      </div>

    <!-- Station picker (search result covers several stations, e.g. an interchange) -->
    {:else if tflCandidates.length > 0}
      <div class="platform-picker">
        <div class="platform-label">SELECT STATION FOR {tflParentName.toUpperCase()}</div>
        <div class="results-list">
          {#each tflCandidates as row, i}
            {@const usable = rowUsable(row)}
            <button
              class="result-row"
              class:result-alt={i % 2 === 1}
              class:result-disabled={!usable}
              disabled={!usable}
              onclick={() => selectCandidate(row)}
            >
              <span class="result-name">{tflCandidateLabel(row)}</span>
              {#if usable}
                <span class="mode-tags">
                  <span class="mode-tag">{MODE_LABELS[row.mode] ?? row.mode.toUpperCase()}</span>
                </span>
              {:else}
                <span class="result-hint">SEARCH WITH RAIL CHIP</span>
              {/if}
            </button>
          {/each}
        </div>
        <button class="back-btn" onclick={backFromTflStations}>&#8592; BACK TO RESULTS</button>
      </div>
    {:else}
      {#if activeTab === 'trains'}
        <!-- Mode filter (RAIL searches stations.json, the rest search TfL) -->
        <div class="mode-chips">
          <button class="mode-chip" class:mode-chip-active={trainsMode === null} onclick={() => selectTrainsMode(null)}>ALL</button>
          {#each TRAIN_CHIPS as m}
            <button class="mode-chip" class:mode-chip-active={trainsMode === m} onclick={() => selectTrainsMode(m)}>{MODE_LABELS[m]}</button>
          {/each}
        </div>
      {/if}

      <!-- Search input -->
      <div class="search-wrapper">
        <input
          class="search-input"
          type="text"
          placeholder={activeTab === 'bus' ? 'SEARCH BUS STOPS...' : 'SEARCH STATIONS BY NAME OR CRS...'}
          bind:value={query}
          oninput={handleQueryInput}
        />
      </div>

      <!-- Results -->
      <div class="results-list">
        {#if activeTab === 'bus'}
          {#if busAdding}
            <div class="result-msg">LOADING STOP...</div>
          {:else if busLoading}
            <div class="result-msg">SEARCHING...</div>
          {:else if busError}
            <div class="result-msg result-error">{busError}</div>
          {:else if query.trim().length < 2}
            <div class="result-msg">TYPE AT LEAST 2 CHARACTERS</div>
          {:else if busResults.length === 0}
            <div class="result-msg">NO STOPS FOUND</div>
          {:else}
            {#each busResults as stop, i}
              <button
                class="result-row"
                class:result-alt={i % 2 === 1}
                onclick={() => selectBusStop(stop)}
              >
                <span class="result-name">{stop.name.toUpperCase()}</span>
                <span class="result-id">{stop.id}</span>
              </button>
            {/each}
          {/if}
        {:else if tflResolving}
          <div class="result-msg">LOADING STOP...</div>
        {:else if query.trim().length < 1}
          <div class="result-msg">TYPE TO SEARCH STATIONS</div>
        {:else}
          {#if showRail}
            {#if showTfl}
              <div class="group-label">NATIONAL RAIL</div>
            {/if}
            {#if trainResults.length === 0}
              <div class="result-msg">NO RAIL STATIONS FOUND</div>
            {:else}
              {#each trainResults as station, i}
                <button
                  class="result-row"
                  class:result-alt={i % 2 === 1}
                  onclick={() => selectTrainStation(station)}
                >
                  <span class="result-name">{station.name.toUpperCase()}</span>
                  <span class="mode-tags">
                    <span class="mode-tag">{MODE_LABELS[RAIL_MODE]}</span>
                  </span>
                  <span class="result-crs">{station.crs}</span>
                </button>
              {/each}
            {/if}
          {/if}
          {#if showTfl}
            {#if showRail}
              <div class="group-label">TFL</div>
            {/if}
            {#if tflLoading}
              <div class="result-msg">SEARCHING TFL...</div>
            {:else if tflError}
              <div class="result-msg result-error">{tflError}</div>
            {:else if query.trim().length < 2}
              <div class="result-msg">TYPE AT LEAST 2 CHARACTERS</div>
            {:else if tflResults.length === 0}
              <div class="result-msg">NO TFL STOPS FOUND</div>
            {:else}
              {#each tflResults as stop, i}
                <button
                  class="result-row"
                  class:result-alt={i % 2 === 1}
                  onclick={() => selectTflResult(stop)}
                >
                  <span class="result-name">{stop.name.toUpperCase()}</span>
                  <span class="mode-tags">
                    {#each stop.modes.filter(m => TFL_MODES.includes(m)) as m}
                      <span class="mode-tag">{MODE_LABELS[m]}</span>
                    {/each}
                  </span>
                </button>
              {/each}
            {/if}
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-content {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    width: 100%;
    max-width: 520px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    font-family: 'Share Tech Mono', monospace;
  }

  .modal-title {
    color: var(--text-secondary);
    font-size: 0.95rem;
    font-weight: bold;
    letter-spacing: 3px;
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--led-red);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 4px 8px;
    font-family: 'Share Tech Mono', monospace;
    text-shadow: 0 0 8px var(--led-red-glow);
  }

  .modal-close:hover {
    color: var(--led-red);
    opacity: 0.7;
  }

  .modal-tabs {
    display: flex;
    gap: 0;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    padding: 0 20px;
  }

  .tab-btn {
    flex: 1;
    background: none;
    border: none;
    padding: 10px 0;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: border-color 0.2s;
  }

  .tab-active-bus {
    border-bottom-color: var(--accent);
  }

  .tab-active-trains {
    border-bottom-color: #DC241F;
  }

  .tab-badge {
    display: inline-block;
    padding: 3px 14px;
    font-size: 0.7rem;
    font-weight: bold;
    letter-spacing: 2px;
    border-radius: 2px;
    font-family: 'Share Tech Mono', monospace;
    opacity: 0.5;
    transition: opacity 0.2s;
  }

  .tab-active-bus .tab-badge,
  .tab-active-trains .tab-badge {
    opacity: 1;
  }

  .badge-bus {
    background: var(--accent);
    color: #000;
  }

  .badge-trains {
    background: #DC241F;
    color: #fff;
  }

  /* ── Trains mode filter chips ── */
  .mode-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px 20px 0 20px;
    background: var(--bg-primary);
  }

  .mode-chip {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-muted);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 1.5px;
    padding: 4px 10px;
    cursor: pointer;
    border-radius: 2px;
  }

  .mode-chip:hover {
    color: var(--text-secondary);
  }

  .mode-chip-active {
    color: var(--text-secondary);
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
  }

  .search-wrapper {
    padding: 14px 20px;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
  }

  .search-input {
    width: 100%;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 10px 14px;
    color: var(--text-primary);
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.9rem;
    letter-spacing: 2px;
    text-transform: uppercase;
    outline: none;
    box-sizing: border-box;
  }

  .search-input::placeholder {
    color: var(--text-muted);
    letter-spacing: 1.5px;
  }

  .search-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
  }

  .results-list {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 12px 20px;
    background: var(--bg-card);
    border: none;
    border-bottom: 1px solid var(--border-color);
    cursor: pointer;
    text-align: left;
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.85rem;
    letter-spacing: 2px;
    color: var(--led-yellow);
    text-shadow: 0 0 8px var(--led-yellow-glow);
    text-transform: uppercase;
  }

  .result-row:hover {
    background: var(--bg-card-alt);
  }

  .result-alt {
    background: var(--bg-card-alt);
  }

  .result-alt:hover {
    background: var(--bg-card-alt);
  }

  .result-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-id,
  .result-crs {
    flex-shrink: 0;
    color: var(--text-primary);
    font-size: 0.75rem;
    margin-left: 12px;
    text-shadow: 0 0 6px var(--accent-glow);
  }

  .mode-tags {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    margin-left: 12px;
  }

  .mode-tag {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    letter-spacing: 1px;
    padding: 1px 6px;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    color: var(--text-primary);
    text-shadow: none;
  }

  .result-disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .result-hint {
    flex-shrink: 0;
    margin-left: 12px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 1px;
    color: var(--text-muted);
    text-shadow: none;
  }

  .group-label {
    padding: 8px 20px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 2px;
    text-align: left;
  }

  .result-msg {
    padding: 20px;
    color: var(--text-muted);
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 0.8rem;
    letter-spacing: 2px;
    text-align: center;
    text-transform: uppercase;
  }

  .result-error {
    color: var(--led-red);
    text-shadow: 0 0 8px var(--led-red-glow);
  }

  .platform-picker {
    padding: 20px;
    text-align: center;
    flex: 1;
  }

  .platform-label {
    color: var(--text-secondary);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    letter-spacing: 2px;
    margin-bottom: 20px;
    text-shadow: 0 0 8px var(--led-yellow-glow);
  }

  .platform-buttons {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }

  .plat-btn {
    background: var(--bg-card-alt);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    font-family: 'LED Dot-Matrix', monospace;
    font-size: 1rem;
    letter-spacing: 2px;
    padding: 12px 20px;
    min-width: 60px;
    cursor: pointer;
    border-radius: 4px;
    text-shadow: 0 0 8px var(--led-yellow-glow);
    transition: background 0.15s, border-color 0.15s;
  }

  .plat-btn:hover {
    background: var(--bg-card-alt);
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
  }

  .back-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 2px;
    cursor: pointer;
    padding: 8px 16px;
    text-transform: uppercase;
  }

  .back-btn:hover {
    color: var(--text-secondary);
  }

  .child-letter {
    color: var(--text-primary);
    font-weight: bold;
    margin-right: 10px;
  }

  .child-towards {
    color: var(--text-secondary);
  }
</style>
