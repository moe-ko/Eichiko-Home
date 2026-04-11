import type { Handle } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/security';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    const ip = event.getClientAddress();
    const { ok, retryAfter } = checkRateLimit(`${ip}:${event.url.pathname}`);
    if (!ok) {
      return json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter ?? 60),
            'Cache-Control': 'no-store',
          },
        }
      );
    }
  }
  return resolve(event);
};
