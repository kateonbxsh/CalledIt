/* global firebase */
importScripts('https://www.gstatic.com/firebasejs/11.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.9.0/firebase-messaging-compat.js');

const appIcon = new URL('icons/icon-192.png', self.registration.scope).href;
const appBadge = new URL('icons/icon-96.png', self.registration.scope).href;
let messagingPromise = null;
const seenNotificationIds = new Map();
const seenTtlMs = 60 * 1000;

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

function pruneSeen(nowMs) {
  for (const [id, seenAt] of seenNotificationIds.entries()) {
    if (nowMs - seenAt > seenTtlMs) seenNotificationIds.delete(id);
  }
}

function payloadData(payload) {
  return payload?.data || {};
}

function notificationIdentity(payload) {
  const data = payloadData(payload);
  if (data.notificationId) return String(data.notificationId);
  const title = payload?.notification?.title || data.title || '';
  const body = payload?.notification?.body || data.body || '';
  const url = data.url || '';
  return `${title}::${body}::${url}`;
}

async function showPayloadNotification(payload) {
  const data = payloadData(payload);
  const notification = payload?.notification || {};
  const id = notificationIdentity(payload);
  const nowMs = Date.now();
  pruneSeen(nowMs);
  if (seenNotificationIds.has(id)) return;
  seenNotificationIds.set(id, nowMs);
  await self.registration.showNotification(notification.title || data.title || 'Called It', {
    body: notification.body || data.body || 'Something happened in Called It.',
    icon: data.icon || notification.icon || appIcon,
    badge: data.badge || notification.badge || appBadge,
    tag: id,
    data: {
      url: data.url || '/',
    },
  });
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
      showPayloadNotification(payload).catch(() => {});
    });
  })
  .catch((error) => {
    console.error('Firebase messaging service worker could not start.', error);
  });

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    if (!event.data) return;
    let raw = null;
    try {
      raw = event.data.json();
    } catch {
      try {
        raw = JSON.parse(event.data.text());
      } catch {
        raw = null;
      }
    }
    if (!raw) return;
    const payload = {
      notification: raw.notification || {},
      data: raw.data || raw,
    };
    await showPayloadNotification(payload);
  })());
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
