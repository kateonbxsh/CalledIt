# Notification Token System Analysis

## Current Implementation Overview

### Token Storage Structure

```
/users/{uid}/notificationTokens/{deviceId}
├─ token: string (FCM push token from Firebase)
├─ enabled: boolean (whether this device receives notifications)
├─ userAgent: string (browser + OS info)
├─ createdAt: Timestamp (when first registered)
├─ updatedAt: Timestamp (when last updated)
└─ disabledAt: Timestamp (when disabled, if applicable)
```

### How Tokens Are Managed

**Registration Flow (enablePushNotifications in notificationService.ts):**

```
1. User clicks "Enable Notifications"
2. Browser requests FCM token from Firebase Messaging
3. Get persistent deviceId from localStorage (or create new one):
   - deviceId = localStorage.getItem('__called_it_device_id__')
   - If not exists: create `device_{timestamp}_{random}`
4. Query existing tokens for user
5. Disable all OTHER device tokens (enabled: false)
6. Register/update THIS device's token:
   - Write to /users/{uid}/notificationTokens/{deviceId}
   - deviceId remains SAME even if token value changes
```

### Device ID Persistence

**Key Design Decision:**
- Device ID is stored in **localStorage**, persists across page reloads
- One device = One localStorage instance
- If user clears localStorage → New device ID created → New token entry

### Token Policy

| Scenario | Result | Policy |
|----------|--------|--------|
| User enables on Phone | Token stored, enabled=true | Per-device |
| User enables on Desktop | Desktop token enabled, old phone token disabled | Per-device (but only 1 active per user at a time historically) |
| Both enabled on phone+desktop | Both tokens active simultaneously | Per-device |
| User clears localStorage on phone | New device ID created | New token entry |
| Browser tab clears data (incognito) | New device ID each session | New token entry each session |
| App reinstalled on phone | New device ID (new localStorage) | New token entry |

---

## Backward Compatibility Issues & How They Were "Fixed"

### The Migration Problem

**Before the fix:**
- Token document ID was the **FCM token itself** (base64-encoded)
- Token was used as the key: `tokenDocId = btoa(token).replace(/[+/=]/g, '-_')`
- When user reinstalled app/cleared cache → Got same FCM token → Same document ID → Token just updated
- BUT if two devices got the SAME token value (rare but possible) → Conflict!

**The "Fix" Attempt:**
```typescript
// OLD (broken):
function tokenDocId(token: string) {
  return btoa(token).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
// Result: Same token = Same doc ID = Risk of conflicts

// NEW (current):
function getDeviceId() {
  const key = '__called_it_device_id__';
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}
// Result: Persistent device ID = One doc per actual device
```

### The Backward Compatibility Problem

**What happened:**
1. Old tokens still exist in Firestore with token-based IDs (e.g., `Zm9vYmFy...`)
2. New code uses device-based IDs (e.g., `device_1718160000_abc123`)
3. When old token holder re-enables notifications → Creates NEW device ID entry
4. Now the user has BOTH old and new tokens in Firestore

**Migration Logic (from enablePushNotifications):**
```typescript
// Disable old tokens matching old format (token-based IDs)
const existingTokens = await getDocs(tokensRef);
await Promise.all(existingTokens.docs
  .filter((item) => {
    const isCurrentDevice = item.id === deviceId;
    const isOldFormat = !item.id.startsWith('device_'); // Key check!
    return (item.data().enabled === true && !isCurrentDevice) || isOldFormat;
  })
  .map((item) => setDoc(item.ref, {
    enabled: false,
    disabledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true }))
);
```

**How this migration works:**
- Disables all tokens that DON'T start with `device_` (old tokens)
- Should auto-clean on next notification enable
- PROBLEM: This runs every time user enables, but doesn't DELETE them

---

## Why Some Users Might Not Receive Notifications

### Root Causes

1. **Old tokens never disabled**
   - User enabled notifications before the fix
   - Old token still marked `enabled: true`
   - When worker sends notifications, it picks up OLD and NEW tokens
   - Old token is invalid, fails silently

2. **Device ID lost**
   - User clears localStorage (incognito, app clear data, browser reset)
   - New device ID created
   - New token registered
   - Old device ID token becomes orphaned but still enabled
   - Confusion about which is active

3. **Multiple enabled tokens for same device**
   - App updated, localStorage persisted
   - Old token still enabled from before
   - New token enabled after update
   - Worker sends to both (but old one fails)
   - Device still receives notification (via new token) but 1 failure in logs

4. **Firestore query returns old tokens**
   - Worker's `tokensForUser()` function doesn't filter by device
   - Returns ALL enabled tokens for a user
   - Sends to all (mix of old and new)
   - Old ones fail, new ones succeed

---

## Current Worker Token Handling (worker.js line 99-122)

```javascript
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
  
  // Disable all but the latest token
  await Promise.all(older.map((entry) => entry.ref.update({
    enabled: false,
    disabledAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(() => {})));
  
  return latest ? [{ ref: latest.ref, token: latest.token }] : [];
}
```

**What this does:**
- Gets ALL enabled tokens for user
- Sorts by `updatedAt` (newest first)
- Disables all but the LATEST one
- Returns only the latest token

**Why this is smart:**
- Even if old tokens exist, only the newest gets sent to
- Older tokens automatically get disabled
- Over time, clean-up happens

**Why this might still fail:**
- If ALL tokens are old/invalid, no valid token to send to
- If updatedAt timestamps are wrong, picks wrong token
- Race condition: two tokens updated simultaneously

---

## Assessment: Is It Working?

### Evidence From Logs

**Recent successful sends (2026-06-12):**
```
[2026-06-12T08:07:49.652Z] Sent notification {"id":"EmIPnc5xGtZCCl5OmknW","success":1,"failed":0}
```

**Failures:**
```
[2026-06-11T23:13:49.973Z] No tokens for notification {"id":"user_JngzsXKwd9gXHKmdKnisaS8mbn12_daily_available_20614","targetUids":["JngzsXKwd9gXHKmdKnisaS8mbn12"]}
```

This means: User `JngzsXKwd9gXHKmdKnisaS8mbn12` has NO valid enabled tokens.

### Current Status

✅ **For users who enabled AFTER the fix:** Working perfectly
- New device ID system
- Valid tokens
- Notifications send

❌ **For users who enabled BEFORE the fix:** Potentially broken
- Old tokens might still be marked enabled
- No guarantee latest token is valid
- Migration is incomplete

❓ **Incognito/Data Clear:** Broken
- Each session creates new device ID
- Creates orphaned token entries
- User won't receive notifications in fresh incognito session

---

## Recommended Fixes

### Immediate (Critical)

**1. Improve Migration in enablePushNotifications:**
```typescript
// Instead of just disabling old tokens, DELETE them
const oldTokens = existingTokens.docs.filter(
  (item) => !item.id.startsWith('device_')
);
await Promise.all(oldTokens.map((item) => deleteDoc(item.ref)));
```

**2. Add safety check in worker:**
```javascript
async function tokensForUser(uid) {
  // ... existing code ...
  
  // Validate token before returning
  if (latest && !isValidFCMToken(latest.token)) {
    await latest.ref.update({ enabled: false });
    return [];
  }
  
  return [{ ref: latest.ref, token: latest.token }];
}

function isValidFCMToken(token) {
  // FCM tokens are 152+ chars
  return token && token.length > 150;
}
```

### High Priority

**1. Clean up orphaned tokens:**
```javascript
// One-time cleanup job
async function cleanupOrphanedTokens() {
  const snap = await db.collectionGroup('notificationTokens')
    .where('enabled', '==', false)
    .where('disabledAt', '<', Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
    .get();
  
  // Delete tokens disabled >30 days ago
  await Promise.all(snap.docs.map(doc => doc.ref.delete()));
}
```

**2. Add monitoring:**
```javascript
// Log token health
function logTokenHealth(user, tokens) {
  console.log(`User ${user.id}: ${tokens.length} enabled tokens`, {
    oldFormat: tokens.filter(t => !t.ref.id.startsWith('device_')).length,
    valid: tokens.filter(t => t.token.length > 150).length,
  });
}
```

---

## Summary Table

| Factor | Current | Risk | Fix |
|--------|---------|------|-----|
| Device ID persistence | localStorage | Lost on data clear | Use permanent ID |
| Token format | `device_*` | Old tokens linger | Delete, don't just disable |
| Worker selection | Latest by timestamp | Wrong token if timestamps corrupt | Add token validation |
| Migration | Disable old tokens | Incomplete cleanup | Proactive deletion |
| Backward compat | Partial | Some users broken | See fixes above |

