const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, '.env'));

const projectId = process.env.FIREBASE_PROJECT_ID || 'kent3arf';
const batchSize = Number(process.env.NOTIFICATION_BATCH_SIZE || 20);
const dryRun = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const publicAppUrl = (process.env.PUBLIC_APP_URL || 'https://kateonbxsh.github.io/CalledIt').replace(/\/$/, '');
const deadlineLookaheadMs = Number(process.env.DEADLINE_LOOKAHEAD_MS || 24 * 60 * 60 * 1000);
const deadlineScanIntervalMs = Number(process.env.DEADLINE_SCAN_INTERVAL_MS || 10 * 60 * 1000);
const quotaBackoffMs = Number(process.env.QUOTA_BACKOFF_MS || 15 * 60 * 1000);
const rewardCycleMs = Number(process.env.REWARD_CYCLE_MS || 6 * 60 * 60 * 1000);
const betBonusReminder = String(process.env.BET_BONUS_REMINDER || 'true').toLowerCase() === 'true';
const allEnabledTargetUid = '__all_enabled__';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
});

const db = admin.firestore();
const messaging = admin.messaging();
let stopping = false;
let lastDeadlineScanMs = 0;
let firestoreBackoffUntilMs = 0;
let deadlineRunning = false;
let notificationRunning = false;
let unsubscribeNotifications = null;
let notificationRetryTimer = null;
const notificationQueue = new Map();

function log(message, extra = {}) {
  const suffix = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
}

function appUrl(hashPath = '/') {
  const normalized = hashPath.startsWith('#/')
    ? hashPath
    : hashPath.startsWith('/#/')
      ? hashPath.slice(1)
      : `#/${String(hashPath).replace(/^\/+/, '')}`;
  return `${publicAppUrl}/${normalized}`;
}

function unique(values) {
  return [...new Set(values)].filter(Boolean);
}

function todayUtcKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function uidsForUsernames(usernames = []) {
  const normalized = unique(usernames.map((name) => String(name || '').trim().toLowerCase()));
  const pairs = await Promise.all(normalized.map(async (username) => {
    const snap = await db.collection('usernames').doc(username).get();
    return snap.exists ? snap.data().uid : null;
  }));
  return unique(pairs);
}

async function predictionUserIdsForBet(betId) {
  const snap = await db.collection('predictions').where('betId', '==', betId).get();
  return unique(snap.docs.map((doc) => doc.data().userId));
}

async function createSystemNotification(id, data) {
  const ref = db.collection('notifications').doc(id);
  const snap = await ref.get();
  if (snap.exists) return false;
  const targetUids = unique(data.targetUids || []);
  if (targetUids.length === 0) return false;
  await ref.set({
    type: data.type,
    actorUid: 'system',
    actorUsername: 'calledit',
    actorDisplayName: 'Called It',
    targetUids,
    title: data.title,
    body: data.body,
    url: data.url,
    readBy: [],
    sentAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return true;
}

async function tokensForUser(uid) {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('notificationTokens')
    .where('enabled', '==', true)
    .get();

  // One doc per device; send to every enabled device, de-duped by token value
  // so an orphaned doc sharing a token can't cause a double send. Dead tokens
  // are disabled by sendNotification when FCM rejects them.
  const seen = new Set();
  const out = [];
  for (const doc of snap.docs) {
    const token = doc.data().token;
    if (token && !seen.has(token)) {
      seen.add(token);
      out.push({ ref: doc.ref, token });
    }
  }
  return out;
}

async function allEnabledTokenEntries() {
  const snap = await db
    .collectionGroup('notificationTokens')
    .where('enabled', '==', true)
    .get();
  const seen = new Set();
  const out = [];
  for (const doc of snap.docs) {
    const token = doc.data().token;
    if (token && !seen.has(token)) {
      seen.add(token);
      out.push({ ref: doc.ref, token });
    }
  }
  return out;
}

async function claimNotification(ref) {
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return null;
    const data = snap.data();
    if (data.sentAt || data.processingAt) return null;
    transaction.update(ref, {
      processingAt: admin.firestore.FieldValue.serverTimestamp(),
      processingBy: 'vps-worker',
    });
    return { id: snap.id, ref, data };
  });
}

async function sendNotification(notification) {
  const data = notification.data;
  const requestedTargetUids = [...new Set(data.targetUids || [])].filter(Boolean);
  const broadcastAllEnabled = requestedTargetUids.includes(allEnabledTargetUid);
  const targetUids = requestedTargetUids.filter((uid) => uid !== allEnabledTargetUid);
  if (!broadcastAllEnabled && targetUids.length === 0) {
    await notification.ref.update({
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      sentCount: 0,
      failedCount: 0,
      processingAt: admin.firestore.FieldValue.delete(),
      processingBy: admin.firestore.FieldValue.delete(),
    });
    return;
  }

  const tokenEntries = broadcastAllEnabled
    ? await allEnabledTokenEntries()
    : (await Promise.all(targetUids.map(tokensForUser))).flat();
  if (tokenEntries.length === 0) {
    await notification.ref.update({
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      sentCount: 0,
      failedCount: 0,
      processingAt: admin.firestore.FieldValue.delete(),
      processingBy: admin.firestore.FieldValue.delete(),
    });
    log('No tokens for notification', { id: notification.id, targetUids });
    return;
  }

  const title = data.title || 'Called It';
  const body = data.body || 'Something happened in Called It.';
  const url = data.url || '/';
  const iconUrl = `${publicAppUrl}/icons/icon-192.png`;
  const badgeUrl = `${publicAppUrl}/icons/icon-96.png`;

  if (dryRun) {
    await notification.ref.update({
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      sentCount: tokenEntries.length,
      failedCount: 0,
      dryRun: true,
      processingAt: admin.firestore.FieldValue.delete(),
      processingBy: admin.firestore.FieldValue.delete(),
    });
    log('Dry-run notification', { id: notification.id, title, tokens: tokenEntries.length });
    return;
  }

  const response = await messaging.sendEachForMulticast({
    tokens: tokenEntries.map((entry) => entry.token),
    data: {
      title,
      body,
      url,
      type: data.type || 'update',
      notificationId: notification.id,
      icon: iconUrl,
      badge: badgeUrl,
    },
    webpush: {
      fcmOptions: { link: url },
    },
  });

  const cleanup = response.responses
    .map((result, index) => ({ result, ref: tokenEntries[index].ref }))
    .filter(({ result }) => {
      const code = result.error?.code || '';
      return code.includes('registration-token-not-registered') || code.includes('invalid-registration-token');
    })
    .map(({ ref }) => ref.update({
      enabled: false,
      disabledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }));

  await Promise.all([
    ...cleanup,
    notification.ref.update({
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      sentCount: response.successCount,
      failedCount: response.failureCount,
      processingAt: admin.firestore.FieldValue.delete(),
      processingBy: admin.firestore.FieldValue.delete(),
    }),
  ]);
  log('Sent notification', {
    id: notification.id,
    success: response.successCount,
    failed: response.failureCount,
  });
}

async function scanBetDeadlines() {
  const nowMs = Date.now();
  const soonMs = nowMs + deadlineLookaheadMs;
  const snap = await db
    .collection('bets')
    .where('status', '==', 'open')
    .where('deadline', '<=', admin.firestore.Timestamp.fromMillis(soonMs))
    .limit(100)
    .get();
  let created = 0;

  for (const doc of snap.docs) {
    const bet = { id: doc.id, ...doc.data() };
    const deadlineMs = bet.deadline?.toMillis?.();
    if (!deadlineMs || deadlineMs > soonMs) continue;

    const targetUids = unique([
      bet.creatorId,
      ...(await predictionUserIdsForBet(bet.id)),
      ...(await uidsForUsernames(bet.invitedUsernames || [])),
    ]);
    const title = String(bet.title || 'A bet');
    if (deadlineMs <= nowMs) {
      await doc.ref.update({
        status: 'locked',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
      const didCreate = await createSystemNotification(`bet_${bet.id}_deadline_passed`, {
        type: 'bet_deadline_passed',
        targetUids,
        title: 'Bet awaiting resolve',
        body: `${title} passed its deadline and is ready to resolve.`,
        url: appUrl(`bets/${bet.id}`),
      });
      if (didCreate) created += 1;
    } else {
      const didCreate = await createSystemNotification(`bet_${bet.id}_deadline_24h`, {
        type: 'bet_deadline_soon',
        targetUids,
        title: 'Bet deadline soon',
        body: `${title} closes in less than 24 hours.`,
        url: appUrl(`bets/${bet.id}`),
      });
      if (didCreate) created += 1;
    }
  }

  return created;
}

async function scanWagerDeadlines() {
  const nowMs = Date.now();
  const soonMs = nowMs + deadlineLookaheadMs;
  const snap = await db
    .collection('challenges')
    .where('status', '==', 'open')
    .where('deadline', '<=', admin.firestore.Timestamp.fromMillis(soonMs))
    .limit(100)
    .get();
  let created = 0;

  for (const doc of snap.docs) {
    const wager = { id: doc.id, ...doc.data() };
    if (wager.type !== 'wager') continue;
    const deadlineMs = wager.deadline?.toMillis?.();
    if (!deadlineMs || deadlineMs > soonMs) continue;

    const targetUids = unique([
      wager.creatorId,
      ...(await uidsForUsernames([
        ...(wager.targetUsername ? [wager.targetUsername] : []),
        ...(wager.invitedUsernames || []),
      ])),
    ]);
    const title = String(wager.title || 'A wager');
    if (deadlineMs <= nowMs) {
      const didCreate = await createSystemNotification(`wager_${wager.id}_deadline_passed`, {
        type: 'wager_deadline_passed',
        targetUids,
        title: 'Wager deadline passed',
        body: `${title} passed its deadline. The creator can close it if no one completed it.`,
        url: appUrl('challenges'),
      });
      if (didCreate) created += 1;
    } else {
      const didCreate = await createSystemNotification(`wager_${wager.id}_deadline_24h`, {
        type: 'wager_deadline_soon',
        targetUids,
        title: 'Wager deadline soon',
        body: `${title} closes in less than 24 hours.`,
        url: appUrl('challenges'),
      });
      if (didCreate) created += 1;
    }
  }

  return created;
}

async function scanRewardAvailability() {
  const snap = await db
    .collection('users')
    .limit(100)
    .get();
  let created = 0;
  const now = Date.now();
  const todayKey = todayUtcKey();

  for (const doc of snap.docs) {
    const user = { id: doc.id, ...doc.data() };
    const lastDaily = user.lastDailyForecastAt?.toMillis?.() ?? 0;
    const lastWheel = user.lastWheelSpinAt?.toMillis?.() ?? 0;

    // Forecast available again (6h cycle passed since last claim).
    // Keyed off the last-claim cycle so each claim earns exactly one reminder.
    if (lastDaily && now - lastDaily > rewardCycleMs) {
      const forecastNotifId = `user_${user.id}_forecast_available_${Math.floor(lastDaily / rewardCycleMs)}`;
      const didCreate = await createSystemNotification(forecastNotifId, {
        type: 'reward_available',
        targetUids: [user.id],
        title: '💰 Forecast ready!',
        body: 'Your 6-hour forecast is available. Tap to claim coins.',
        url: appUrl('minigames'),
      });
      if (didCreate) created += 1;
    }

    // Wheel spin available again (6h cycle passed since last spin).
    if (lastWheel && now - lastWheel > rewardCycleMs) {
      const wheelNotifId = `user_${user.id}_wheel_available_${Math.floor(lastWheel / rewardCycleMs)}`;
      const didCreate = await createSystemNotification(wheelNotifId, {
        type: 'reward_available',
        targetUids: [user.id],
        title: '🎡 Spin the wheel!',
        body: 'Your 6-hour spin is ready. Tap to claim a reward.',
        url: appUrl('minigames'),
      });
      if (didCreate) created += 1;
    }

    // Daily bet-bonus reminder: nudge once per day if they have not yet
    // earned today's bet bonus. Matches bonusService dateKey (YYYY-MM-DD UTC).
    if (betBonusReminder) {
      try {
        const bonusSnap = await db
          .collection('users')
          .doc(user.id)
          .collection('dailyBonuses')
          .doc(todayKey)
          .get();
        const claimedTypes = bonusSnap.exists
          ? (bonusSnap.data().bonuses || []).map((entry) => entry.type)
          : [];
        if (!claimedTypes.includes('bet')) {
          const betNotifId = `user_${user.id}_bet_bonus_${todayKey}`;
          const didCreate = await createSystemNotification(betNotifId, {
            type: 'reward_available',
            targetUids: [user.id],
            title: '🎯 Daily bet bonus waiting',
            body: 'Post a bet today to grab +50 bonus coins.',
            url: appUrl('create'),
          });
          if (didCreate) created += 1;
        }
      } catch (err) {
        // Ignore per-user bonus read errors so one user cannot stall the scan.
      }
    }
  }

  return created;
}

async function scanDeadlineReminders() {
  const [betCount, wagerCount, rewardCount] = await Promise.all([
    scanBetDeadlines(),
    scanWagerDeadlines(),
    scanRewardAvailability(),
  ]);
  if (betCount || wagerCount || rewardCount) {
    log('Created notifications', {
      deadlineBets: betCount,
      deadlineWagers: wagerCount,
      rewards: rewardCount,
    });
  }
}

function isQuotaError(err) {
  return err?.code === 8 || String(err?.message || '').includes('RESOURCE_EXHAUSTED');
}

function backoffFirestore(err) {
  firestoreBackoffUntilMs = Date.now() + quotaBackoffMs;
  console.error(`[${new Date().toISOString()}] Firestore quota exhausted; backing off for ${quotaBackoffMs}ms`, err);
}

function queueNotificationDoc(doc) {
  notificationQueue.set(doc.id, doc.ref);
  processNotificationQueue();
}

async function processNotificationQueue() {
  if (notificationRunning || stopping) return;
  if (Date.now() < firestoreBackoffUntilMs) return;
  notificationRunning = true;
  try {
    while (notificationQueue.size > 0 && !stopping) {
      if (Date.now() < firestoreBackoffUntilMs) break;
      const [id, ref] = notificationQueue.entries().next().value;
      notificationQueue.delete(id);
      const claimed = await claimNotification(ref);
      if (claimed) await sendNotification(claimed);
    }
  } catch (err) {
    if (isQuotaError(err)) backoffFirestore(err);
    else console.error(`[${new Date().toISOString()}] Notification processing failed`, err);
  } finally {
    notificationRunning = false;
    if (notificationQueue.size > 0 && !stopping) {
      clearTimeout(notificationRetryTimer);
      const delay = Math.max(1000, firestoreBackoffUntilMs - Date.now());
      notificationRetryTimer = setTimeout(processNotificationQueue, delay);
    }
  }
}

function listenForNotifications() {
  if (unsubscribeNotifications || stopping) return;
  unsubscribeNotifications = db
    .collection('notifications')
    .where('sentAt', '==', null)
    .limit(batchSize)
    .onSnapshot((snap) => {
      snap.docChanges()
        .filter((change) => change.type === 'added' || change.type === 'modified')
        .forEach((change) => queueNotificationDoc(change.doc));
    }, (err) => {
      unsubscribeNotifications = null;
      if (isQuotaError(err)) backoffFirestore(err);
      else console.error(`[${new Date().toISOString()}] Notification listener failed`, err);
      if (!stopping) {
        clearTimeout(notificationRetryTimer);
        const delay = Math.max(5000, firestoreBackoffUntilMs - Date.now());
        notificationRetryTimer = setTimeout(listenForNotifications, delay);
      }
    });
}

async function deadlineTick() {
  if (deadlineRunning || stopping) return;
  if (Date.now() < firestoreBackoffUntilMs) return;
  deadlineRunning = true;
  try {
    const nowMs = Date.now();
    if (nowMs - lastDeadlineScanMs >= deadlineScanIntervalMs) {
      lastDeadlineScanMs = nowMs;
      await scanDeadlineReminders();
    }
  } catch (err) {
    if (isQuotaError(err)) backoffFirestore(err);
    else console.error(`[${new Date().toISOString()}] Deadline scan failed`, err);
  } finally {
    deadlineRunning = false;
  }
}

async function shutdown(signal) {
  stopping = true;
  if (unsubscribeNotifications) unsubscribeNotifications();
  clearTimeout(notificationRetryTimer);
  log(`Received ${signal}, shutting down`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log('Called It notification worker started', {
  projectId,
  batchSize,
  dryRun,
  publicAppUrl,
  deadlineScanIntervalMs,
  quotaBackoffMs,
  rewardCycleMs,
  betBonusReminder,
});
listenForNotifications();
deadlineTick();
setInterval(deadlineTick, Math.min(deadlineScanIntervalMs, 60 * 1000));
