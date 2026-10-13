/* global self, caches, fetch, Headers, Response, URL */
/*
 * Cross-origin isolation for the voice, loaded into the service worker.
 *
 * The voice runs wasm on several threads, which needs SharedArrayBuffer, which
 * needs an isolated page. GitHub Pages cannot send the headers, so the service
 * worker adds them to the pages and workers it serves. It does so only once the
 * voice has been set up: until then the app stays exactly as it was.
 *
 * Registered before Workbox's own handlers, so it answers these requests first.
 */
const VOICE_CACHE = 'copista-voice-v1';

function isolate(response) {
  // An opaque response cannot be copied with new headers.
  if (response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** The page from the precache, as Workbox would serve it, and the network otherwise. */
async function serve(request) {
  // Every page of the app is index.html; Workbox keeps it with a revision in its address.
  const key =
    request.mode === 'navigate' ? new URL('index.html', self.registration.scope).href : request;
  const cached = await caches.match(key, { ignoreSearch: request.mode === 'navigate' });
  const response = cached ?? (await fetch(request));
  return (await caches.has(VOICE_CACHE)) ? isolate(response) : response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate' && request.destination !== 'worker') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(serve(request));
});
