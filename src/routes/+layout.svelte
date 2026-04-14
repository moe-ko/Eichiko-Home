<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import { getWeather, searchWeatherLocations, type WeatherLocation } from '$lib/api/weather';
  import { loadSettings, saveSettings } from '$lib/stores/settings';

  let { children } = $props();

  let settings = $state(loadSettings());
  let editMode = $state(false);
  let editingTitle = $state(false);
  let editingLocation = $state(false);
  let titleInput = $state('');
  let locationInput = $state('');

  function saveTitle() {
    if (titleInput.trim()) {
      settings = { ...settings, title: titleInput.trim().toUpperCase() };
      saveSettings(settings);
    }
    editingTitle = false;
  }

  function toggleTheme() {
    settings = { ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' };
    saveSettings(settings);
  }

  function saveLocation() {
    if (locationInput.trim()) {
      settings = { ...settings, location: locationInput.trim() };
      saveSettings(settings);
      loadWeather();
    }
    editingLocation = false;
    locationSearchResults = [];
  }

  let locationSearchResults = $state<WeatherLocation[]>([]);
  let locationSearchLoading = $state(false);
  let locationSearchTimeout: ReturnType<typeof setTimeout>;

  function onLocationInput() {
    clearTimeout(locationSearchTimeout);
    if (locationInput.length < 2) {
      locationSearchResults = [];
      return;
    }
    locationSearchLoading = true;
    locationSearchTimeout = setTimeout(async () => {
      locationSearchResults = await searchWeatherLocations(locationInput);
      locationSearchLoading = false;
    }, 300);
  }

  let weather: any = $state(null);
  let weatherError = $state('');
  let weatherPhrase = $state('');
  let now = $state(new Date());

  let clockInterval: ReturnType<typeof setInterval>;
  let phraseInterval: ReturnType<typeof setInterval>;

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

  const COUNTRY_NAMES: Record<string, string> = {
    GB: 'UK', US: 'USA', CA: 'Canada', AU: 'Australia', JP: 'Japan',
    DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy', NL: 'Netherlands',
  };

  function formatLocation(loc: string): string {
    const parts = loc.split(',');
    if (parts.length >= 2) {
      const city = parts[0].trim().toUpperCase();
      const country = parts[1].trim().toUpperCase();
      const countryName = COUNTRY_NAMES[country] || country;
      return `${city}, ${countryName}`;
    }
    return loc.toUpperCase();
  }

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

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  async function loadWeather() {
    try {
      weather = await getWeather(settings.location);
      weatherPhrase = pickPhrase(weather);
    } catch (e: any) {
      weatherError = e.message;
    }
  }

  onMount(() => {
    loadWeather();
    clockInterval = setInterval(() => { now = new Date(); }, 1000);
    phraseInterval = setInterval(() => {
      if (weather) weatherPhrase = pickPhrase(weather);
    }, 12000);
  });

  onDestroy(() => {
    clearInterval(clockInterval);
    clearInterval(phraseInterval);
  });

  const tabs = [
    { label: 'HOME', href: '/' },
    { label: 'F1', href: '/f1' },
  ];
</script>

<svelte:head>
  <title>Eichiko's Home</title>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="led-board" data-theme={settings.theme}>
  <!-- Header -->
  <div class="board-header">
    <div class="header-left">
      {#if editingTitle}
        <input
          class="title-input"
          type="text"
          bind:value={titleInput}
          onblur={saveTitle}
          onkeydown={(e) => e.key === 'Enter' && saveTitle()}
          placeholder="Enter title"
        />
      {:else if editMode}
        <button class="edit-title-btn" onclick={() => { titleInput = settings.title; editingTitle = true; }}>
          <span class="header-title">{settings.title}</span>
        </button>
      {:else}
        <span class="header-title">{settings.title}</span>
      {/if}
    </div>
    <div class="header-right">
      {#if editMode}
        <button class="edit-done-btn" onclick={() => { editMode = false; }}>DONE</button>
      {:else}
        <button class="theme-toggle-btn" onclick={toggleTheme} title="Toggle theme">{settings.theme === 'dark' ? '☀' : '☽'}</button>
        <button class="edit-toggle-btn" onclick={() => { editMode = true; }}>&#8942;</button>
      {/if}
      {#if editingLocation}
        <div class="location-search">
          <input
            class="title-input"
            type="text"
            bind:value={locationInput}
            oninput={onLocationInput}
            onblur={saveLocation}
            onkeydown={(e) => e.key === 'Enter' && saveLocation()}
            placeholder="Search location..."
          />
          {#if locationSearchResults.length > 0}
            <div class="location-search-results">
              {#each locationSearchResults as loc}
                <button class="search-result" onclick={() => { locationInput = loc.display; settings = { ...settings, location: loc.query }; saveSettings(settings); editingLocation = false; locationSearchResults = []; loadWeather(); }}>
                  {loc.display}
                </button>
              {/each}
            </div>
          {/if}
          {#if locationSearchLoading}
            <span class="search-loading">Searching...</span>
          {/if}
        </div>
      {:else if editMode}
        <button class="edit-title-btn" onclick={() => { locationInput = settings.location; editingLocation = true; }}>
          <span class="header-location">{formatLocation(settings.location)}</span>
        </button>
      {:else}
        <span class="header-location">{formatLocation(settings.location)}</span>
      {/if}
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

  <!-- Tab Bar -->
  <nav class="tab-bar">
    {#each tabs as tab}
      <a
        class="tab-link"
        class:active={page.url.pathname === tab.href}
        href={tab.href}
      >
        {tab.label}
      </a>
    {/each}
  </nav>

  {@render children()}
</div>

<style>
  /* ── Board Shell ── */
  .led-board {
    min-height: 100vh;
    background: var(--bg-primary);
    color: var(--text-primary);
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
    background: var(--bg-secondary);
    border-bottom: 3px solid var(--text-secondary);
    font-family: 'Share Tech Mono', monospace;
  }

  .header-left {
    display: flex;
    align-items: center;
  }

  .header-title {
    color: var(--text-secondary);
    font-size: 1.5rem;
    font-weight: bold;
    letter-spacing: 3px;
  }

  .edit-title-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .title-input {
    background: var(--bg-primary);
    border: 1px solid var(--text-secondary);
    color: var(--text-secondary);
    font-family: 'Share Tech Mono', monospace;
    font-size: 1.5rem;
    font-weight: bold;
    letter-spacing: 3px;
    padding: 4px 8px;
    border-radius: 4px;
    width: 200px;
  }

  .title-input::placeholder {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .location-search {
    position: relative;
  }

  .location-search-results {
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--bg-card);
    border: 1px solid var(--text-secondary);
    border-radius: 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
    width: 200px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .search-result {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--text-body);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.85rem;
    padding: 8px 12px;
    cursor: pointer;
  }

  .search-result:hover {
    background: var(--bg-card-alt);
    color: var(--text-secondary);
  }

  .search-loading {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .theme-toggle-btn, .edit-toggle-btn, .edit-done-btn {
    background: var(--bg-card);
    border: 1px solid var(--text-secondary);
    color: var(--text-secondary);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    font-weight: bold;
    letter-spacing: 1px;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
  }

  .theme-toggle-btn {
    font-size: 1rem;
    padding: 2px 8px;
  }

  .edit-toggle-btn {
    padding: 4px 8px;
  }

  .edit-done-btn {
    margin-right: 8px;
  }

  .header-right {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .header-location {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .header-time {
    color: var(--text-secondary);
    font-size: 1.2rem;
    font-weight: bold;
  }

  /* ── Weather Bar ── */
  .weather-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 24px;
    background: var(--bg-secondary);
    border-bottom: 2px solid var(--border-color);
    flex-wrap: wrap;
    font-family: 'Share Tech Mono', monospace;
  }

  .weather-icon {
    font-size: 1.6rem;
    color: var(--text-secondary);
  }

  .weather-temp {
    color: var(--text-body);
    font-size: 1.3rem;
    font-weight: bold;
  }

  .weather-desc {
    color: var(--text-body);
    font-size: 0.9rem;
  }

  .weather-sep {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .weather-pop {
    color: var(--text-body);
    font-size: 0.9rem;
  }

  .weather-phrase {
    color: var(--text-body);
    font-size: 0.9rem;
    text-transform: none;
  }

  .weather-error {
    color: var(--led-red);
    font-size: 0.85rem;
  }

  .weather-loading {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  /* ── Tab Bar ── */
  .tab-bar {
    display: flex;
    gap: 0;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--border-color);
    font-family: 'Share Tech Mono', monospace;
    padding: 0 24px;
  }

  .tab-link {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: bold;
    letter-spacing: 3px;
    text-decoration: none;
    padding: 12px 24px;
    border-bottom: 3px solid transparent;
    transition: color 0.2s, border-color 0.2s;
  }

  .tab-link:hover {
    color: var(--text-primary);
  }

  .tab-link.active {
    color: var(--text-secondary);
    border-bottom-color: var(--text-secondary);
  }

  /* ── Responsive ── */
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
    .tab-bar {
      padding: 0 12px;
    }
    .tab-link {
      padding: 10px 16px;
      font-size: 0.75rem;
    }
  }
</style>
