/**
 * Service Worker for ICH 100L Class Board
 * Standard offline-ready installation, network pass-through, and Web Push notifications
 */

const CACHE_NAME = 'ich100l-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo-192.png',
  '/logo-512.png',
  '/logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[PWA SW] Resilient activation start. Pre-caching critical assets...');
      for (const url of ASSETS_TO_CACHE) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
            console.log(`[PWA SW] Cached successfully: ${url}`);
          } else {
            console.warn(`[PWA SW] Skip caching non-200 asset: ${url} (status: ${response.status})`);
          }
        } catch (err) {
          console.warn(`[PWA SW] Skip caching failed asset fetch: ${url}`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[PWA SW] Flushing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Bypass non-GET requests (e.g., POST/PUT/DELETE tracking and APIs)
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Bypass API calls, uploads, or hot-module-reload files
  if (
    url.pathname.startsWith('/api/') || 
    url.pathname.startsWith('/uploads/') || 
    url.pathname.includes('@vite') || 
    url.pathname.includes('node_modules') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('firebase')
  ) {
    return;
  }

  // Intercept standard layout & HTML navigation pages for Offline fallback
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match('/') || await cache.match('/index.html');
          return cachedResponse || Response.error();
        })
    );
    return;
  }

  // Let browser make standard request online, fallback to cache if offline (Cache first with Network update)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh version in background to update cache
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok && (event.request.destination === 'image' || event.request.destination === 'font')) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => Response.error());
    })
  );
});

// Handle real background Web Push events when the app is completely closed
self.addEventListener('push', (event) => {
  console.log('[PWA SW] Push event received:', event);

  let data = { 
    title: 'ICH 100L Alerts 🔔', 
    body: 'New live update from your Course Representative.' 
  };

  if (event.data) {
    try {
      data = event.data.json();
      console.log('[PWA SW] Parsed JSON push payload:', data);
    } catch (e) {
      // Fallback if payload is plain text
      data = { 
        title: 'ICH 100L Announcements 📢', 
        body: event.data.text() 
      };
      console.log('[PWA SW] Parsed plain text push payload:', data);
    }
  }

  const baseUrl = self.location.origin || '';
  const options = {
    body: data.body,
    icon: baseUrl + '/logo-192.png',
    badge: baseUrl + '/logo-192.png',
    vibrate: [200, 100, 200],
    tag: data.id || `ich-${Date.now()}`,
    data: {
      url: baseUrl + '/'
    }
  };

  console.log('[PWA SW] Triggering showNotification via self.registration instance. Title:', data.title, 'Options:', options);

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => {
        console.log('[PWA SW] showNotification completed successfully.');
      })
      .catch((err) => {
        console.error('[PWA SW] showNotification failed with error:', err);
      })
  );
});

// Handle lockscreen notification clicks in the background
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : self.location.origin + '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus on an existing open window tab matching the target URL
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // If any client window is open, navigate it to targetUrl and focus
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Otherwise launch a standalone new window/tab instance
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
