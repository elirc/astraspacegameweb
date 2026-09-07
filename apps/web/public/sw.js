const PRECACHE = self.__WB_ASSETS__ || ['/', '/crest.svg', '/icon-192.png', '/icon-512.png'];
const CACHE =
  'warband-shell-' +
  PRECACHE.join('|')
    .split('')
    .reduce((hash, c) => ((hash << 5) - hash + c.charCodeAt(0)) | 0, 0);
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('warband-shell-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api')
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // The shell and hashed bundles are installed atomically with this worker.
      // Serve them directly so offline navigation never depends on a failed fetch.
      const cached = await cache.match(event.request.mode === 'navigate' ? '/' : event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return new Response('You are offline. Reconnect to continue your campaign.', {
          status: 503,
        });
      }
    })(),
  );
});
self.addEventListener('push', (event) => {
  let data = { title: 'Warband', body: 'Your village has news.', tag: 'warband', url: '/' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/crest.svg',
      badge: '/crest.svg',
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(target.href);
        return existing.focus();
      }
      return clients.openWindow(target.href);
    }),
  );
});
