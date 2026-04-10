<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/state';
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import { getLondonWeather } from '$lib/api/weather';

  let { children } = $props();

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
      weather = await getLondonWeather();
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

  /* ── Tab Bar ── */
  .tab-bar {
    display: flex;
    gap: 0;
    background: #0a0a0a;
    border-bottom: 1px solid #222;
    font-family: 'Share Tech Mono', monospace;
    padding: 0 24px;
  }

  .tab-link {
    color: #888;
    font-size: 0.85rem;
    font-weight: bold;
    letter-spacing: 3px;
    text-decoration: none;
    padding: 12px 24px;
    border-bottom: 3px solid transparent;
    transition: color 0.2s, border-color 0.2s;
  }

  .tab-link:hover {
    color: #FF6A00;
  }

  .tab-link.active {
    color: #FFD600;
    border-bottom-color: #FFD600;
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
