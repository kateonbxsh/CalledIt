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

export const ALL_ENABLED_TARGET_UID = '__all_enabled__';

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

function getDeviceId() {
  const key = '__called_it_device_id__';
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
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

  // One doc per device, keyed by a stable device id. Enabling a device never
  // touches other devices, so multiple devices can each receive independently.
  const deviceId = getDeviceId();
  const thisDeviceDoc = doc(db, 'users', user.uid, 'notificationTokens', deviceId);
  const existingDoc = await getDoc(thisDeviceDoc);

  await setDoc(thisDeviceDoc, {
    token,
    enabled: true,
    userAgent: navigator.userAgent,
    ...(existingDoc.exists() ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return token;
}

export async function disableCurrentPushToken(user: UserProfile) {
  const deviceId = getDeviceId();
  await setDoc(doc(db, 'users', user.uid, 'notificationTokens', deviceId), {
    enabled: false,
    disabledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export type DevicePushState = 'enabled' | 'disabled' | 'unsupported' | 'none';

// Reports whether THIS device (by persistent deviceId) currently has an enabled
// token, so the UI can show real state instead of static buttons.
export async function getCurrentDevicePushState(user: UserProfile): Promise<DevicePushState> {
  if (!supportsPushNotifications()) return 'unsupported';
  const deviceId = getDeviceId();
  const snap = await getDoc(doc(db, 'users', user.uid, 'notificationTokens', deviceId));
  if (!snap.exists()) return 'none';
  return snap.data().enabled === true ? 'enabled' : 'disabled';
}

// Silently refreshes this device's FCM token on app load. FCM tokens rotate, and
// a stale token fails delivery without any error surfaced to the user. We only
// touch devices that previously opted in (token doc exists + enabled), so this
// never auto-subscribes a new device, and only writes when the token changed.
export async function refreshPushTokenIfEnabled(user: UserProfile) {
  if (!supportsPushNotifications()) return;
  if (Notification.permission !== 'granted') return;

  const deviceId = getDeviceId();
  const thisDeviceDoc = doc(db, 'users', user.uid, 'notificationTokens', deviceId);
  const existing = await getDoc(thisDeviceDoc);
  if (!existing.exists() || existing.data().enabled !== true) return;

  const registration = await registerAppServiceWorker();
  const messagingInstance = await messaging();
  if (!registration || !messagingInstance) return;

  try {
    const token = await getToken(messagingInstance, {
      ...(firebaseVapidKey ? { vapidKey: firebaseVapidKey } : {}),
      serviceWorkerRegistration: registration,
    });
    if (token && token !== existing.data().token) {
      await setDoc(thisDeviceDoc, {
        token,
        enabled: true,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  } catch {
    // Best-effort; a failed refresh must not break app startup.
  }
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
    title: 'Test push',
    body: 'If this arrived, the app, Firestore queue, VPS worker, FCM, and this device are connected.',
    url: '/#/me',
  });
}

export async function sendTestPushToAllUsers(actor: UserProfile) {
  await addDoc(collection(db, 'notifications'), {
    type: 'test_push',
    actorUid: actor.uid,
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    targetUids: [ALL_ENABLED_TARGET_UID],
    title: '🧪 Test notification from admin',
    body: `Test sent at ${new Date().toLocaleTimeString()}. If you received this, push notifications are working!`,
    url: '/#/minigames',
    readBy: [],
    sentAt: null,
    createdAt: serverTimestamp(),
  });

  return { sent: true, count: 0, allEnabled: true };
}

export async function usersWhoPredictedBet(betId: string) {
  const snap = await getDocs(query(collection(db, 'predictions'), where('betId', '==', betId)));
  return [...new Set(snap.docs.map((item) => String(item.data().userId)).filter(Boolean))];
}

export async function usersWhoCanSeeBet(betId: string) {
  const betSnap = await getDoc(doc(db, 'bets', betId));
  if (!betSnap.exists()) return [];
  const bet = betSnap.data() as any;

  const visibleUids = new Set<string>();

  // Add creator
  if (bet.creatorId) visibleUids.add(bet.creatorId);

  // Add all predictors
  const predictors = await usersWhoPredictedBet(betId);
  predictors.forEach(uid => visibleUids.add(uid));

  // Add invited users
  if (bet.invitedUsernames && Array.isArray(bet.invitedUsernames)) {
    const invitedUids = await uidsForUsernames(bet.invitedUsernames);
    invitedUids.forEach(uid => visibleUids.add(uid));
  }

  // Add group members if bet has a group
  if (bet.groupId) {
    const groupSnap = await getDoc(doc(db, 'friendGroups', bet.groupId));
    if (groupSnap.exists()) {
      const groupData = groupSnap.data() as any;
      if (groupData.memberUids && Array.isArray(groupData.memberUids)) {
        groupData.memberUids.forEach((uid: string) => visibleUids.add(uid));
      }
    }
  }

  return [...visibleUids].filter(Boolean);
}
