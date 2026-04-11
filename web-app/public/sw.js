/**
 * ViralHub Service Worker
 *
 * Strategy:
 *   - App shell (HTML, JS, CSS, fonts, icons) → Cache-first
 *   - API requests                            → Network-first, cache fallback
 *   - Everything else                         → Network only
 *
 * Keeps things simple: caches just enough for instant reload without
 * risking stale dynamic data.
 */

const CACHE_NAME = 'viralhub-v1';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// ── Install: pre-cache the app shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ── Fetch: route requests to the right strategy ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, PATCH, DELETE, etc.)
  if (request.method !== 'GET') return;

  // Skip chrome-extension, websocket, and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // API requests → network-first
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (JS, CSS, fonts, images, icons) → cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests (HTML pages) → network-first so we always get
  // the latest index.html, but fall back to cache for offline support
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Everything else → network only
  event.respondWith(fetch(request));
});

// ── Helpers ──

function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|webp|ico|json)$/i.test(pathname);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not in cache — return a basic offline response
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Cache successful responses for offline fallback
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // For navigation requests, try to return the cached root page
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/');
      if (fallback) return fallback;
    }

    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}
