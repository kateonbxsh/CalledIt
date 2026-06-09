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

async function tokensForUser(uid) {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('notificationTokens')
    .where('enabled', '==', true)
    .get();

  return snap.docs
    .map((doc) => ({ ref: doc.ref, token: doc.data().token }))
    .filter((entry) => entry.token);
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
        icon: '/pwa-icon.svg',
        badge: '/pwa-icon.svg',
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

async function tick() {
  if (running || stopping) return;
  running = true;
  try {
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
});
tick();
setInterval(tick, pollIntervalMs);
