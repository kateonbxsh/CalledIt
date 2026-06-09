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
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 5000);
const batchSize = Number(process.env.NOTIFICATION_BATCH_SIZE || 20);
const dryRun = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const publicAppUrl = (process.env.PUBLIC_APP_URL || 'https://kateonbxsh.github.io/CalledIt').replace(/\/$/, '');
const deadlineLookaheadMs = Number(process.env.DEADLINE_LOOKAHEAD_MS || 24 * 60 * 60 * 1000);

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
});

const db = admin.firestore();
const messaging = admin.messaging();
let running = false;
let stopping = false;

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

  const entries = snap.docs
    .map((doc) => ({ ref: doc.ref, token: doc.data().token, data: doc.data() }))
    .filter((entry) => entry.token)
    .sort((left, right) => {
      const leftMs = left.data.updatedAt?.toMillis?.() ?? left.data.createdAt?.toMillis?.() ?? 0;
      const rightMs = right.data.updatedAt?.toMillis?.() ?? right.data.createdAt?.toMillis?.() ?? 0;
      return rightMs - leftMs;
    });
  const [latest, ...older] = entries;
  await Promise.all(older.map((entry) => entry.ref.update({
    enabled: false,
    disabledAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(() => {})));
  return latest ? [{ ref: latest.ref, token: latest.token }] : [];
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
  const targetUids = [...new Set(data.targetUids || [])].filter(Boolean);
  if (targetUids.length === 0) {
    await notification.ref.update({
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      sentCount: 0,
      failedCount: 0,
      processingAt: admin.firestore.FieldValue.delete(),
      processingBy: admin.firestore.FieldValue.delete(),
    });
    return;
  }

  const tokenEntries = (await Promise.all(targetUids.map(tokensForUser))).flat();
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
    notification: { title, body },
    data: {
      title,
      body,
      url,
      type: data.type || 'update',
      notificationId: notification.id,
    },
    webpush: {
      fcmOptions: { link: url },
      notification: {
        icon: iconUrl,
        badge: badgeUrl,
      },
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
  const snap = await db.collection('bets').where('status', '==', 'open').limit(100).get();
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
  const snap = await db.collection('challenges').where('status', '==', 'open').limit(100).get();
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

async function scanDeadlineReminders() {
  const [betCount, wagerCount] = await Promise.all([
    scanBetDeadlines(),
    scanWagerDeadlines(),
  ]);
  if (betCount || wagerCount) {
    log('Created deadline notifications', { bets: betCount, wagers: wagerCount });
  }
}

async function tick() {
  if (running || stopping) return;
  running = true;
  try {
    await scanDeadlineReminders();
    const snap = await db
      .collection('notifications')
      .where('sentAt', '==', null)
      .limit(batchSize)
      .get();

    for (const doc of snap.docs) {
      const claimed = await claimNotification(doc.ref);
      if (claimed) await sendNotification(claimed);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Worker tick failed`, err);
  } finally {
    running = false;
  }
}

async function shutdown(signal) {
  stopping = true;
  log(`Received ${signal}, shutting down`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log('Called It notification worker started', {
  projectId,
  pollIntervalMs,
  batchSize,
  dryRun,
  publicAppUrl,
});
tick();
setInterval(tick, pollIntervalMs);
