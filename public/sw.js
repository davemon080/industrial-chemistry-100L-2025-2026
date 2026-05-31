/**
 * Service Worker for ICH 100L Class Board
 * Standard offline-ready installation, network pass-through, and Web Push notifications
 */

const CACHE_NAME = 'ich100l-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let the browser handle standard requests online, fallback to cache if offline
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// Handle real background Web Push events when the app is completely closed
self.addEventListener('push', (event) => {
  let data = { 
    title: 'ICH 100L Alerts 🔔', 
    body: 'New live update from your Course Representative.' 
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      // Fallback if payload is plain text
      data = { 
        title: 'ICH 100L Announcements 📢', 
        body: event.data.text() 
      };
    }
  }

  const options = {
    body: data.body,
    icon: '/logo.svg',
    badge: '/logo.svg',
    vibrate: [200, 100, 200],
    tag: data.id || `ich-${Date.now()}`,
    data: {
      url: '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle lockscreen notification clicks in the background
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus on an existing open window tab if possible
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise launch a standalone new screen instance
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
