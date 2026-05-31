/**
 * Service Worker for ICH 100L Class Board
 * Standard offline-ready installation & native device notification handler
 */

const CACHE_NAME = 'ich100l-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through behavior to ensure no stale files during continuous model/database updates
});

// Handle local browser lockscreen popup clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a browser/app tab is open, focus on it
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window pointing to the homepage
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
