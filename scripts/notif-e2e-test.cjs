/* Comprehensive notification-system end-to-end test.
 * Runs ON the VPS with the live service account. Read-mostly; the only writes
 * are (a) one real push to the ADMIN's own token and (b) one queue round-trip
 * notification targeting the ADMIN only. It never targets other users.
 *
 * Usage: node notif-e2e-test.cjs [adminEmail]
 */
const admin = require('firebase-admin');
const path = require('node:path');

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, 'service-account.json');
const ADMIN_EMAIL = process.argv[2] || 'nawfalhm03@gmail.com';

admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
const db = admin.firestore();
const messaging = admin.messaging();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = () => console.log('-'.repeat(72));
const ok = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
const bad = (m) => console.log(`  ❌ ${m}`);

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
}

async function section1_connectivity() {
  line(); console.log('SECTION 1 — Firestore connectivity');
  const t0 = Date.now();
  try {
    const snap = await db.collection('users').limit(1).get();
    const ms = Date.now() - t0;
    ok(`Read users (1 doc) in ${ms}ms, empty=${snap.empty}`);
    record('connectivity', 'PASS', `${ms}ms`);
  } catch (e) {
    bad(`Firestore read failed: ${e.message}`);
    record('connectivity', 'FAIL', e.message);
    throw e;
  }
}

async function section2_tokenInventory() {
  line(); console.log('SECTION 2 — Token inventory & health (collectionGroup notificationTokens)');
  const snap = await db.collectionGroup('notificationTokens').get();
  const all = snap.docs.map((d) => ({
    id: d.id,
    uid: d.ref.parent.parent.id,
    enabled: d.data().enabled === true,
    token: d.data().token || '',
    updatedAt: d.data().updatedAt?.toMillis?.() ?? 0,
    disabledAt: d.data().disabledAt?.toMillis?.() ?? null,
  }));
  const enabled = all.filter((t) => t.enabled);
  const byUser = new Map();
  for (const t of enabled) byUser.set(t.uid, (byUser.get(t.uid) || 0) + 1);

  const invalid = enabled.filter((t) => !t.token || t.token.length < 100);
  const oldFormat = enabled.filter((t) => !t.id.startsWith('device_'));
  const dupUsers = [...byUser.entries()].filter(([, n]) => n > 1);

  console.log(`  Total token docs:            ${all.length}`);
  console.log(`  Enabled tokens:              ${enabled.length}`);
  console.log(`  Distinct users w/ enabled:   ${byUser.size}`);
  console.log(`  Disabled tokens:             ${all.length - enabled.length}`);
  if (invalid.length) bad(`Invalid/short enabled tokens: ${invalid.length}`); else ok('No invalid enabled tokens');
  if (oldFormat.length) warn(`Old-format (non device_) enabled tokens: ${oldFormat.length} -> ${oldFormat.map((t) => t.uid).join(', ')}`); else ok('All enabled tokens use device_ format');
  if (dupUsers.length) warn(`Users with >1 enabled token (worker should prune to latest): ${dupUsers.map(([u, n]) => `${u}:${n}`).join(', ')}`); else ok('No user has duplicate enabled tokens');

  record('tokenInventory', invalid.length ? 'WARN' : 'PASS',
    `enabled=${enabled.length} users=${byUser.size} invalid=${invalid.length} old=${oldFormat.length} dup=${dupUsers.length}`);
  return enabled;
}

async function section3_notificationsHealth() {
  line(); console.log('SECTION 3 — Notifications collection health (last 60 by createdAt)');
  const snap = await db.collection('notifications').orderBy('createdAt', 'desc').limit(60).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const now = Date.now();
  let sent = 0, unsent = 0, failedSum = 0, sentSum = 0, stuck = 0, processing = 0;
  const byType = {};
  for (const n of docs) {
    byType[n.type] = (byType[n.type] || 0) + 1;
    const createdMs = n.createdAt?.toMillis?.() ?? 0;
    if (n.sentAt) {
      sent += 1;
      sentSum += n.sentCount || 0;
      failedSum += n.failedCount || 0;
    } else {
      unsent += 1;
      if (n.processingAt) processing += 1;
      if (createdMs && now - createdMs > 5 * 60 * 1000) stuck += 1;
    }
  }
  console.log(`  Sample size:                 ${docs.length}`);
  console.log(`  Sent:                        ${sent}  (delivered=${sentSum}, failed=${failedSum})`);
  console.log(`  Unsent:                      ${unsent}  (processing=${processing})`);
  console.log(`  Types:                       ${JSON.stringify(byType)}`);
  if (stuck) bad(`Stuck unsent (>5min, sentAt=null): ${stuck}`); else ok('No stuck unsent notifications');
  record('notificationsHealth', stuck ? 'FAIL' : 'PASS',
    `sent=${sent} unsent=${unsent} stuck=${stuck} delivered=${sentSum} failed=${failedSum}`);
}

async function section4_fcmDryRunValidate(enabledTokens) {
  line(); console.log('SECTION 4 — FCM token validation (dry-run / validateOnly, no delivery)');
  if (!enabledTokens.length) { warn('No enabled tokens to validate'); record('fcmValidate', 'WARN', 'no tokens'); return; }
  const tokens = enabledTokens.map((t) => t.token);
  let live = 0; const dead = [];
  // sendEachForMulticast with dryRun=true validates each token without delivering.
  const CHUNK = 100;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const slice = enabledTokens.slice(i, i + CHUNK);
    const resp = await messaging.sendEachForMulticast({
      tokens: slice.map((t) => t.token),
      notification: { title: 'validate', body: 'validate' },
    }, true); // dryRun
    resp.responses.forEach((r, idx) => {
      if (r.success) live += 1;
      else dead.push({ uid: slice[idx].uid, code: r.error?.code, msg: r.error?.message });
    });
  }
  console.log(`  Tokens validated:            ${tokens.length}`);
  ok(`Live (FCM-accepted) tokens:  ${live}`);
  if (dead.length) {
    bad(`Dead/invalid tokens:         ${dead.length}`);
    dead.forEach((d) => console.log(`     - uid=${d.uid} code=${d.code}`));
  } else ok('No dead tokens');
  record('fcmValidate', dead.length ? 'WARN' : 'PASS', `live=${live} dead=${dead.length}`);
  return { live, dead };
}

async function resolveAdminUid(email) {
  try {
    const u = await admin.auth().getUserByEmail(email);
    return u.uid;
  } catch {
    const q = await db.collection('users').where('email', '==', email).limit(1).get();
    return q.empty ? null : q.docs[0].id;
  }
}

async function adminEnabledTokens(uid) {
  const snap = await db.collection('users').doc(uid).collection('notificationTokens')
    .where('enabled', '==', true).get();
  return snap.docs.map((d) => d.data().token).filter(Boolean);
}

async function section5_liveSendToAdmin(adminUid) {
  line(); console.log(`SECTION 5 — Live FCM send to ADMIN only (uid=${adminUid})`);
  if (!adminUid) { warn('Admin uid not found; skipping'); record('liveSend', 'WARN', 'no admin uid'); return; }
  const tokens = await adminEnabledTokens(adminUid);
  if (!tokens.length) { warn('Admin has no enabled tokens; skipping real send'); record('liveSend', 'WARN', 'admin has no token'); return; }
  const resp = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: '✅ E2E direct FCM test', body: `Direct send at ${new Date().toISOString()}` },
    data: { url: '/#/minigames', type: 'test_push' },
  });
  console.log(`  Admin tokens:                ${tokens.length}`);
  if (resp.successCount) ok(`Delivered to FCM: ${resp.successCount}, failed: ${resp.failureCount}`);
  else bad(`All sends failed: ${JSON.stringify(resp.responses.map((r) => r.error?.code))}`);
  record('liveSend', resp.successCount ? 'PASS' : 'FAIL', `success=${resp.successCount} failed=${resp.failureCount}`);
}

async function section6_queueRoundTrip(adminUid) {
  line(); console.log('SECTION 6 — Full queue round-trip through the RUNNING worker');
  if (!adminUid) { warn('Admin uid not found; skipping'); record('queueRoundTrip', 'WARN', 'no admin uid'); return; }
  const ref = db.collection('notifications').doc(`e2e_test_${Date.now()}`);
  await ref.set({
    type: 'test_push',
    actorUid: 'e2e-harness',
    actorUsername: 'e2e',
    actorDisplayName: 'E2E Harness',
    targetUids: [adminUid],
    title: '🧪 E2E queue round-trip',
    body: `Queued at ${new Date().toISOString()}`,
    url: '/#/minigames',
    readBy: [],
    sentAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  Created ${ref.id}; waiting for worker to set sentAt...`);
  const t0 = Date.now();
  let processed = null;
  for (let i = 0; i < 30; i += 1) {
    await sleep(2000);
    const s = await ref.get();
    const d = s.data();
    if (d && d.sentAt) { processed = d; break; }
  }
  const ms = Date.now() - t0;
  if (processed) {
    ok(`Worker processed in ~${ms}ms (sentCount=${processed.sentCount}, failedCount=${processed.failedCount})`);
    record('queueRoundTrip', 'PASS', `${ms}ms sent=${processed.sentCount} failed=${processed.failedCount}`);
  } else {
    bad(`Worker did NOT process within ${ms}ms — pipeline/listener problem`);
    record('queueRoundTrip', 'FAIL', `timeout ${ms}ms`);
  }
  await ref.delete().catch(() => {});
  console.log('  Cleaned up test notification doc.');
}

(async () => {
  console.log(`\n=== Notification System E2E Test  ${new Date().toISOString()} ===`);
  console.log(`Service account: ${SA_PATH}`);
  try {
    await section1_connectivity();
    const enabled = await section2_tokenInventory();
    await section3_notificationsHealth();
    await section4_fcmDryRunValidate(enabled);
    const adminUid = await resolveAdminUid(ADMIN_EMAIL);
    await section5_liveSendToAdmin(adminUid);
    await section6_queueRoundTrip(adminUid);
  } catch (e) {
    bad(`Fatal: ${e.stack || e.message}`);
  }
  line(); console.log('SUMMARY');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`  ${icon} ${r.name.padEnd(22)} ${r.status.padEnd(5)} ${r.detail}`);
  }
  line();
  process.exit(0);
})();
