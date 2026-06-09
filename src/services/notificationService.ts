import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { db, firebaseVapidKey, messaging } from '../lib/firebase';
import type { NotificationEventType, UserProfile } from '../types';

type NotificationInput = {
  type: NotificationEventType;
  actor: Pick<UserProfile, 'uid' | 'username' | 'displayName'>;
  targetUids: string[];
  title: string;
  body: string;
  url: string;
  includeActor?: boolean;
};

function appBaseUrl() {
  if (typeof window === 'undefined') return '';
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString().replace(/\/$/, '');
}

export function appNotificationUrl(hashPath: string) {
  const normalized = hashPath.startsWith('#/')
    ? hashPath
    : hashPath.startsWith('/#/')
      ? hashPath.slice(1)
      : `#/${hashPath.replace(/^\/+/, '')}`;
  return `${appBaseUrl()}/${normalized}`;
}

function normalizeNotificationUrl(url: string) {
  if (typeof window === 'undefined') return url;
  if (url.startsWith('/#/') || url.startsWith('#/')) return appNotificationUrl(url);
  if (url.startsWith('/')) return `${appBaseUrl()}${url}`;
  return url;
}

function tokenDocId(token: string) {
  return btoa(token).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function supportsPushNotifications() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export async function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}firebase-messaging-sw.js`);
}

export async function enablePushNotifications(user: UserProfile) {
  if (!supportsPushNotifications()) {
    throw new Error('Push notifications are not supported on this device/browser.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }
  const registration = await registerAppServiceWorker();
  const messagingInstance = await messaging();
  if (!registration || !messagingInstance) {
    throw new Error('Firebase Messaging is not supported here.');
  }
  const token = await getToken(messagingInstance, {
    ...(firebaseVapidKey ? { vapidKey: firebaseVapidKey } : {}),
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error('Could not create a push token for this device.');

  const tokensRef = collection(db, 'users', user.uid, 'notificationTokens');
  const existingTokens = await getDocs(tokensRef);
  await Promise.all(existingTokens.docs
    .filter((item) => item.id !== tokenDocId(token) && item.data().enabled !== false)
    .map((item) => setDoc(item.ref, {
      enabled: false,
      updatedAt: serverTimestamp(),
    }, { merge: true })));

  await setDoc(doc(db, 'users', user.uid, 'notificationTokens', tokenDocId(token)), {
    token,
    enabled: true,
    userAgent: navigator.userAgent,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return token;
}

export async function disableCurrentPushToken(user: UserProfile) {
  const messagingInstance = await messaging();
  if (!messagingInstance) return;
  const registration = await navigator.serviceWorker.getRegistration(`${import.meta.env.BASE_URL}firebase-messaging-sw.js`);
  const token = await getToken(messagingInstance, {
    ...(firebaseVapidKey ? { vapidKey: firebaseVapidKey } : {}),
    serviceWorkerRegistration: registration ?? undefined,
  }).catch(() => '');
  if (!token) return;
  await setDoc(doc(db, 'users', user.uid, 'notificationTokens', tokenDocId(token)), {
    enabled: false,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function listenForForegroundNotifications(onNotify: (payload: { title: string; body: string; url: string }) => void) {
  const messagingInstance = await messaging();
  if (!messagingInstance) return () => {};
  return onMessage(messagingInstance, (payload) => {
    onNotify({
      title: payload.notification?.title || payload.data?.title || 'Called It',
      body: payload.notification?.body || payload.data?.body || 'Something happened in Called It.',
      url: payload.data?.url || appNotificationUrl('/'),
    });
  });
}

export async function uidsForUsernames(usernames: string[]) {
  const unique = [...new Set(usernames.map((name) => name.trim().toLowerCase()).filter(Boolean))];
  const pairs = await Promise.all(unique.map(async (name) => {
    const snap = await getDoc(doc(db, 'usernames', name));
    return snap.exists() ? (snap.data() as { uid: string }).uid : null;
  }));
  return pairs.filter((uid): uid is string => Boolean(uid));
}

export async function createNotification(input: NotificationInput) {
  const targetUids = [...new Set(input.targetUids)]
    .filter((uid) => uid && (input.includeActor || uid !== input.actor.uid));
  if (targetUids.length === 0) return;
  await addDoc(collection(db, 'notifications'), {
    type: input.type,
    actorUid: input.actor.uid,
    actorUsername: input.actor.username,
    actorDisplayName: input.actor.displayName,
    targetUids,
    title: input.title,
    body: input.body,
    url: normalizeNotificationUrl(input.url),
    readBy: [],
    sentAt: null,
    createdAt: serverTimestamp(),
  });
}

export async function createTestPushNotification(user: UserProfile) {
  await createNotification({
    type: 'test_push',
    actor: user,
    targetUids: [user.uid],
    includeActor: true,
    title: 'Test push from Called It',
    body: 'If this arrived, the app, Firestore queue, VPS worker, FCM, and this device are connected.',
    url: '/#/me',
  });
}

export async function usersWhoPredictedBet(betId: string) {
  const snap = await getDocs(query(collection(db, 'predictions'), where('betId', '==', betId)));
  return [...new Set(snap.docs.map((item) => String(item.data().userId)).filter(Boolean))];
}
