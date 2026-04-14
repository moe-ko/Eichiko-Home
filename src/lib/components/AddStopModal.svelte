<script lang="ts">
  import { searchBusStops, getStopDetails, type StopChild } from '$lib/api/search';
  import stations from '$lib/data/stations.json';
  import type { TransportPanel } from '$lib/types/transport';

  type NewPanel = Omit<TransportPanel, 'id'>;

  let { onAdd, onClose }: { onAdd: (panel: NewPanel) => void; onClose: () => void } = $props();

  let activeTab: 'bus' | 'train' = $state('bus');
  let query = $state('');
  let busResults: { id: string; name: string }[] = $state([]);
  let busLoading = $state(false);
  let busError = $state('');
  let busAdding = $state(false);
  let trainResults: { name: string; crs: string }[] = $state([]);
  let selectedStation: { name: string; crs: string } | null = $state(null);
  let stationPlatforms: string[] = $state([]);
  let platformsLoading = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = $state(null);

  // Bus stop direction picker (when a parent stop has multiple children)
  let busChildren: StopChild[] = $state([]);
  let busParentName = $state('');

  function handleQueryInput() {
    if (activeTab === 'bus') {
      debouncedBusSearch();
    } else {
      filterTrains();
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

  function filterTrains() {
    if (query.trim().length < 1) {
      trainResults = [];
      return;
    }
    const q = query.trim().toLowerCase();
    trainResults = (stations as { name: string; crs: string }[])
      .filter(s => s.name.toLowerCase().includes(q) || s.crs.toLowerCase() === q)
      .slice(0, 10);
  }

  function switchTab(tab: 'bus' | 'train') {
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

  async function selectTrainStation(station: { name: string; crs: string }) {
    selectedStation = station;
    stationPlatforms = [];
    platformsLoading = true;
    try {
      const res = await fetch(`/api/rail/departures/${station.crs}?numRows=20`);
      if (res.ok) {
        const data = await res.json();
        const seen = new Set<string>();
        for (const svc of data.trainServices ?? []) {
          if (svc.platform && !seen.has(svc.platform)) seen.add(svc.platform);
        }
        stationPlatforms = [...seen].sort((a, b) => {
          const na = parseInt(a), nb = parseInt(b);
          return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
        });
      }
    } catch { /* leave stationPlatforms empty — fallback handles it */ }
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
        class:tab-active-train={activeTab === 'train'}
        onclick={() => switchTab('train')}
      >
        <span class="tab-badge badge-train">TRAIN</span>
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
        <button class="back-btn" onclick={() => { selectedStation = null; stationPlatforms = []; platformsLoading = false; }}>&#8592; BACK TO RESULTS</button>
      </div>
    {:else}
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
        {:else}
          {#if query.trim().length < 1}
            <div class="result-msg">TYPE TO SEARCH STATIONS</div>
          {:else if trainResults.length === 0}
            <div class="result-msg">NO STATIONS FOUND</div>
          {:else}
            {#each trainResults as station, i}
              <button
                class="result-row"
                class:result-alt={i % 2 === 1}
                onclick={() => selectTrainStation(station)}
              >
                <span class="result-name">{station.name.toUpperCase()}</span>
                <span class="result-crs">{station.crs}</span>
              </button>
            {/each}
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

  .tab-active-train {
    border-bottom-color: #00AAFF;
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
  .tab-active-train .tab-badge {
    opacity: 1;
  }

  .badge-bus {
    background: var(--accent);
    color: #000;
  }

  .badge-train {
    background: #00AAFF;
    color: #000;
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
