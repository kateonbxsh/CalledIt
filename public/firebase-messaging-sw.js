/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/11.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.9.0/firebase-messaging-compat.js');

const appIcon = new URL('icons/icon-192.png', self.registration.scope).href;
const appBadge = new URL('icons/icon-96.png', self.registration.scope).href;
let messagingPromise = null;

async function messaging() {
  if (!messagingPromise) {
    messagingPromise = fetch(new URL('firebase-config.json', self.registration.scope))
      .then((response) => {
        if (!response.ok) throw new Error('Missing Firebase config.');
        return response.json();
      })
      .then((config) => {
        firebase.initializeApp(config);
        return firebase.messaging();
      });
  }
  return messagingPromise;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

messaging()
  .then((instance) => {
    instance.onBackgroundMessage((payload) => {
      const notification = payload.notification || {};
      const data = payload.data || {};
      // If FCM already carries a notification payload, browsers show it.
      // Avoid calling showNotification again to prevent duplicate pushes.
      if (payload.notification) return;
      self.registration.showNotification(notification.title || data.title || 'Called It', {
        body: notification.body || data.body || 'Something happened in Called It.',
        icon: appIcon,
        badge: appBadge,
        data: {
          url: data.url || '/',
        },
      });
    });
  })
  .catch((error) => {
    console.error('Firebase messaging service worker could not start.', error);
  });

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(url);
        return;
      }
      return self.clients.openWindow(url);
    }),
  );
});
