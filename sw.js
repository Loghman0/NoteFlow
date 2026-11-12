/**
 * sw.js — Service worker (Phase 6).
 *
 * Strategy:
 *   - HTML + JS files: network-first (try the network; fall back to cache
 *     if offline). This means users always get updated app code on their
 *     next online visit without waiting for the SW update cycle, which was
 *     the remaining gap from Phase 6 ("a second deploy with changed app code
 *     is picked up by returning users within one reload cycle").
 *
 *   - CSS + SVG/icon + manifest: cache-first (these change infrequently and
 *     the benefit of always fetching them from the network is low).
 *
 *   - AI API requests (perplexity.ai): never cached (always live network).
 *
 * The cache version in CACHE_NAME is bumped whenever the cached file list
 * changes. The 'activate' handler deletes stale caches automatically, so
 * old cache versions are cleaned up on every update.
 */

const CACHE_NAME = 'studynotes-v3';

// All paths that must be cached for offline use.
// Phase 6 acceptance criterion: every URL here must be a real file that exists
// at the listed path when served from the project root.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/src/styles/main.css',
  // ── Phase 3 new files ──────────────────────────────────────────────────────
  '/src/main.js',
  '/src/state/store.js',
  '/src/views/sidebar-view.js',
  '/src/views/editor-view.js',
  '/src/usecases/notes.js',
  '/src/usecases/courses.js',
  '/src/usecases/cleanup.js',
  '/src/utils/database.js',
  '/src/util/safe-markdown.js',
  '/src/util/html.js',
  '/src/components/editor.js',
  // ── Phase 8 new files ──────────────────────────────────────────────────────
  '/src/ai/provider.js',
  '/src/ai/providers/perplexity.js'
];

// Request types that should use a network-first strategy.
// HTML and JS changes need to propagate quickly; CSS/SVG can be cache-first.
function isNetworkFirst(url) {
  const parsed = new URL(url);
  return parsed.pathname.endsWith('.html') ||
    parsed.pathname.endsWith('.js') ||
    parsed.pathname === '/';
}

// ── Install: pre-cache all known URLs ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove all caches except the current version ───────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: tiered strategy by request type ────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Never intercept AI API calls — always live network.
  if (url.includes('api.perplexity.ai')) return;

  if (isNetworkFirst(url)) {
    // Network-first: try the network, fall back to cache on failure.
    // Phase 6 fix: HTML/JS now propagates on the first online visit
    // instead of being stuck behind the old cache-first strategy.
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request)
          .then(cached => cached || caches.match('/index.html'))
        )
    );
  } else {
    // Cache-first: serve from cache; update cache in the background.
    event.respondWith(
      caches.match(request)
        .then(cached => {
          const fetchPromise = fetch(request).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          });
          return cached || fetchPromise;
        })
        .catch(() => caches.match('/index.html'))
    );
  }
});
