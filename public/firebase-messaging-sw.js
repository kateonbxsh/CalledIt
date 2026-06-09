/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/11.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDymnsDBNkA56roJSyAvc1y7kTURXx7WYg',
  authDomain: 'kent3arf.firebaseapp.com',
  projectId: 'kent3arf',
  storageBucket: 'kent3arf.firebasestorage.app',
  messagingSenderId: '668831049351',
  appId: '1:668831049351:web:4259cd523ef2613156ba22',
});

const messaging = firebase.messaging();
const appIcon = new URL('icons/icon-192.png', self.registration.scope).href;
const appBadge = new URL('icons/icon-96.png', self.registration.scope).href;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  self.registration.showNotification(notification.title || data.title || 'Called It', {
    body: notification.body || data.body || 'Something happened in Called It.',
    icon: appIcon,
    badge: appBadge,
    data: {
      url: data.url || '/',
    },
  });
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
