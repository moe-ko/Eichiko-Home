import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') ?? '';
  const referer = request.headers.get('referer') ?? '';
  const source = origin || referer;
  if (source === '') return true; // same-origin SSR
  try {
    const u = new URL(source);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.protocol === 'https:') {
      if (env.ALLOWED_HOST && u.hostname === env.ALLOWED_HOST) return true;
      if (u.hostname.endsWith('.workers.dev') || u.hostname.endsWith('.pages.dev')) return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

export function forbidden() {
  return json({ error: 'Forbidden' }, { status: 403 });
}

export function upstreamError(context: string, detail?: unknown) {
  console.error(`[upstream:${context}]`, detail);
  return json(
    { error: 'Upstream service unavailable' },
    { status: 502, headers: { 'Cache-Control': 'no-store' } }
  );
}

// Best-effort in-memory rate limit. Sliding window, per-instance only.
// Serverless cold starts reset state, this is defense against trivial abuse,
// not a hardening measure against a determined attacker. Use Netlify DDoS
// protection + CDN for real volume.
const WINDOW_MS = 60_000;
const MAX_REQ_PER_WINDOW = 60;
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
  if (arr.length >= MAX_REQ_PER_WINDOW) {
    const oldest = arr[0];
    return { ok: false, retryAfter: Math.ceil((oldest + WINDOW_MS - now) / 1000) };
  }
  arr.push(now);
  buckets.set(key, arr);
  // Opportunistic cleanup to prevent unbounded growth
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v[v.length - 1] < now - WINDOW_MS) buckets.delete(k);
    }
  }
  return { ok: true };
}
