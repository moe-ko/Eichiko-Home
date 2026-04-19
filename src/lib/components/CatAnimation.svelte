<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // 4px per art-pixel; canvas = 12×12 art px = 48×48 CSS px
  const PX = 4;
  const W = 12 * PX;
  const H = 12 * PX;

  // Single theme colour — amber to match the LED board
  const AMBER = '#FFD600';
  const GREY = '#BBB8B9';
  const BROWN = '#8B4513';
  const AMBER_DIM = '#997E00';

  const PAL: (string | null)[] = [
    null,       // 0 transparent
    AMBER,      // 1 main
    BROWN,      // 2 (eyes/bell — same colour, shape defines it)
    GREY,      // 3 (collar)
    AMBER,      // 4 (ear)
    AMBER_DIM,  // 5 shadow/ground
  ];

  // ─── Sitting frames (12w × 12h) ───────────────────────────────
  const F_SIT_A: number[][] = [
    [0,0,1,4,0,0,0,4,1,0,0,0], // ears with pink inner tips
    [0,1,1,1,1,0,0,1,1,1,1,0], // ear bases
    [0,1,1,1,1,1,1,1,1,1,1,0], // head top
    [1,1,1,2,1,1,1,2,1,1,1,1], // eyes open (yellow at col 3,7)
    [1,1,1,1,1,1,1,1,1,1,1,1], // face
    [1,3,3,3,3,2,3,3,3,3,3,1], // collar + bell (yellow at col 5)
    [0,1,1,1,1,1,1,1,1,1,1,0], // chest
    [0,1,1,1,1,1,1,1,1,1,1,1], // body + tail starts
    [0,1,1,1,1,1,1,1,1,1,0,1], // body + tail
    [0,0,1,1,1,1,1,1,1,0,1,1], // paws + tail
    [0,0,1,1,1,1,1,0,0,1,1,0], // paws bottom + tail curl
    [0,0,5,1,1,5,0,0,1,1,0,0], // shadow + tail end
  ];

  // Tail wagged to a higher position
  const F_SIT_B: number[][] = [
    [0,0,1,4,0,0,0,4,1,0,0,0],
    [0,1,1,1,1,0,0,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,2,1,1,1,2,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,3,3,3,3,2,3,3,3,3,3,1],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,0], // tail hidden (wagged high)
    [0,1,1,1,1,1,1,1,1,1,1,1], // tail reappears right
    [0,0,1,1,1,1,1,1,0,0,0,1], // paws + tail high-right
    [0,0,1,1,1,1,1,0,0,0,1,1],
    [0,0,5,1,1,5,0,0,0,1,1,0],
  ];

  // Blink: eyes shut
  const F_SIT_BLINK: number[][] = [
    [0,0,1,4,0,0,0,4,1,0,0,0],
    [0,1,1,1,1,0,0,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1], // eyes closed
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,3,3,3,3,2,3,3,3,3,3,1],
    [0,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,1,0,1],
    [0,0,1,1,1,1,1,1,1,0,1,1],
    [0,0,1,1,1,1,1,0,0,1,1,0],
    [0,0,5,1,1,5,0,0,1,1,0,0],
  ];

  // Cycle: A A B A A B A blink — natural idle
  const SIT_CYCLE = [F_SIT_A, F_SIT_A, F_SIT_B, F_SIT_A, F_SIT_A, F_SIT_B, F_SIT_A, F_SIT_BLINK];

  // ─── Walking LEFT frames (12w × 9h, bottom-aligned in 12×12 canvas) ──
  // Head is at the left cols → cat faces left. Mirrored = faces right.
  const F_WALK_L_0: number[][] = [
    [0,0,1,0,1,0,0,0,0,0,0,0], // ear peaks (side view)
    [0,1,1,1,1,1,0,0,0,0,0,0], // head
    [0,1,2,1,2,1,1,0,0,0,0,0], // eyes
    [0,1,1,1,1,1,1,0,0,0,0,0], // face
    [0,3,3,3,3,3,3,0,0,0,0,1], // collar + tail tip far right
    [0,1,1,1,1,1,1,1,1,1,0,1], // body + tail
    [0,1,1,1,1,1,1,1,1,0,0,1], // body lower + tail
    [0,1,0,0,1,0,1,0,0,0,1,0], // legs: front, mid, rear + tail base
    [0,5,0,0,5,0,5,0,0,0,5,0], // shadows
  ];

  const F_WALK_L_1: number[][] = [
    [0,0,1,0,1,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,0,0,0,0,0,0],
    [0,1,2,1,2,1,1,0,0,0,0,0],
    [0,1,1,1,1,1,1,0,0,0,0,0],
    [0,3,3,3,3,3,3,0,0,1,1,0], // tail at different arc
    [0,1,1,1,1,1,1,1,1,1,0,0], // body
    [0,1,1,1,1,1,1,1,0,0,0,0], // body lower
    [0,0,1,0,1,0,0,1,0,0,0,0], // legs swapped
    [0,0,5,0,5,0,0,5,0,0,0,0],
  ];

  function mirrorFrame(f: number[][]): number[][] {
    return f.map(row => [...row].reverse());
  }

  const WALK_L_CYCLE = [F_WALK_L_0, F_WALK_L_1];
  const WALK_R_CYCLE = WALK_L_CYCLE.map(mirrorFrame);

  // ─── State ────────────────────────────────────────────────────
  type Mode = 'walkR' | 'walkL' | 'sit';

  let canvas: HTMLCanvasElement;
  let stageEl: HTMLDivElement;
  let posX = $state(0);
  let mode = $state<Mode>('walkR');
  let fidx = 0;
  let pauseTicks = 0;
  let maxX = 300;

  const SPEED = 1.5;
  const MS = 160;

  function cycleFor(m: Mode) {
    if (m === 'sit') return SIT_CYCLE;
    return m === 'walkR' ? WALK_R_CYCLE : WALK_L_CYCLE;
  }

  function draw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const cycle = cycleFor(mode);
    const frame = cycle[fidx % cycle.length];
    const yOff = (12 - frame.length) * PX; // bottom-align walk frames
    for (let r = 0; r < frame.length; r++) {
      for (let c = 0; c < frame[r].length; c++) {
        const col = PAL[frame[r][c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(c * PX, yOff + r * PX, PX, PX);
      }
    }
  }

  function choosePause(edge: 'r' | 'l') {
    if (Math.random() < 0.45) {
      mode = edge === 'r' ? 'walkL' : 'walkR';
    } else {
      mode = 'sit';
      pauseTicks = 12 + Math.floor(Math.random() * 30);
    }
    fidx = 0;
  }

  function tick() {
    fidx++;

    if (mode === 'walkR') {
      posX = Math.min(posX + SPEED, maxX);
      if (posX >= maxX) {
        choosePause('r');
      } else if (Math.random() < 0.01) {
        mode = 'sit';
        pauseTicks = 8 + Math.floor(Math.random() * 14);
        fidx = 0;
      }
    } else if (mode === 'walkL') {
      posX = Math.max(posX - SPEED, 0);
      if (posX <= 0) {
        choosePause('l');
      } else if (Math.random() < 0.01) {
        mode = 'sit';
        pauseTicks = 8 + Math.floor(Math.random() * 14);
        fidx = 0;
      }
    } else {
      pauseTicks--;
      if (pauseTicks <= 0) {
        mode = posX > maxX / 2 ? 'walkL' : 'walkR';
        fidx = 0;
      }
    }

    draw();
  }

  let timer: ReturnType<typeof setInterval>;
  let ro: ResizeObserver;

  onMount(() => {
    maxX = Math.max(stageEl.clientWidth - W, 0);
    posX = Math.random() * Math.min(maxX * 0.3, 80);
    ro = new ResizeObserver(() => { maxX = Math.max(stageEl.clientWidth - W, 0); });
    ro.observe(stageEl);
    draw();
    timer = setInterval(tick, MS);
  });

  onDestroy(() => { clearInterval(timer); ro?.disconnect(); });
</script>

<div class="stage" bind:this={stageEl}>
  <canvas
    bind:this={canvas}
    width={W}
    height={H}
    class="cat"
    style="left: {posX}px"
  ></canvas>
</div>

<style>
  .stage {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    height: 100%;
    display: flex;
    align-items: center;
  }

  .cat {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    pointer-events: none;
    user-select: none;
    transition: left 0.16s linear;
    filter: drop-shadow(0 0 4px rgba(255,214,0,0.25));
  }
</style>
