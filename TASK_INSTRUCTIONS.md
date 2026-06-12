# Comprehensive Task Instructions & Testing Guide

This document provides complete step-by-step instructions for all tasks, including comprehensive testing procedures to verify the notification system works end-to-end.

---

## Task 1: Daily Incentive Bonuses (Multiple Per Day)

### Objectives
- Create a multi-bonus daily incentive system (not just 1 per day)
- Award coins for different actions: bets, challenges, predictions, comments
- Display progress on MinigamesPage
- Total daily potential: 135 coins (50+50+25+10)

### Implementation Steps

#### Step 1.1: Create Bonus Service
**File**: `src/services/bonusService.ts`

Create a new service that:
1. Defines bonus amounts: `{ bet: 50, challenge: 50, prediction: 25, comment: 10 }`
2. Implements `getTodayUTC()` function returning `YYYY-MM-DD` format
3. Implements `awardDailyBonus(user, bonusType)` that:
   - Checks if bonus type already claimed today via transaction
   - Awards coins to user if not claimed
   - Tracks in `/users/{uid}/dailyBonuses/{dateKey}` document
   - Sends notification when awarded
   - Returns status: `{ awarded: boolean, amount: number, reason?: string }`
4. Implements `getDailyBonusProgress(uid)` that returns:
   - `totalClaimed`: coins earned today
   - `bonuses`: array of claimed bonuses
   - `potential`: remaining coins available
   - `bonusAmounts`: reference amounts
   - `claimedTypes`: array of claimed action types

#### Step 1.2: Update Type Definitions
**File**: `src/types.ts`

Add two new interfaces:
```typescript
export interface DailyBonus {
  type: 'bet' | 'challenge' | 'prediction' | 'comment';
  amount: number;
  claimedAt: Timestamp;
}

export interface DailyBonusTracker {
  dateKey: string; // YYYY-MM-DD UTC
  bonuses: DailyBonus[];
  totalClaimed: number;
  updatedAt: Timestamp;
}
```

#### Step 1.3: Integrate Into Bet Creation
**File**: `src/services/betService.ts`

1. Import: `import { awardDailyBonus } from './bonusService'`
2. In `createBet()` function, after notification is sent:
   ```typescript
   await awardDailyBonus(creator, 'bet');
   ```
3. In `addBetComment()` function, after notification:
   ```typescript
   await awardDailyBonus(user, 'comment');
   ```
4. In `placePrediction()` function, only for NEW predictions (not updates):
   ```typescript
   if (!existingPrediction) {
     await awardDailyBonus(input.user, 'prediction');
   }
   ```

#### Step 1.4: Integrate Into Challenge Creation
**File**: `src/services/rewardService.ts`

1. Import: `import { awardDailyBonus } from './bonusService'`
2. In `createWagerChallenge()` function, after notification:
   ```typescript
   await awardDailyBonus(params.user, 'challenge');
   ```

#### Step 1.5: Display Bonus Progress on MinigamesPage
**File**: `src/pages/MinigamesPage.tsx`

1. Import: `import { getDailyBonusProgress } from '../services/bonusService'`
2. Add state: 
   ```typescript
   const [dailyBonusProgress, setDailyBonusProgress] = useState<any>({
     totalClaimed: 0,
     bonuses: [],
     potential: 135,
     bonusAmounts: { bet: 50, challenge: 50, prediction: 25, comment: 10 },
     claimedTypes: [],
   });
   ```
3. In `useEffect` hook (with profile dependency):
   ```typescript
   getDailyBonusProgress(profile.uid)
     .then(setDailyBonusProgress)
     .catch(() => setDailyBonusProgress({...})); // Set to default on error
   ```
4. Add UI section before the minigames grid:
   - Display section with Gift icon
   - Show "Daily bonuses" heading
   - Show row: "Earned today" + `totalClaimed` coins
   - Show row: "Potential remaining" + `potential` coins
   - Show text: "Claimed: [types] • Get +{potential} more!" or "Claim bonuses by..."

#### Step 1.6: Add Firestore Security Rules
**File**: `firestore.rules`

Add new match block for daily bonuses subcollection:
```firestore
match /users/{userId}/dailyBonuses/{dateKey} {
  allow read: if signedIn() && request.auth.uid == userId;
  allow create, update: if signedIn()
    && request.auth.uid == userId
    && request.resource.data.keys().hasOnly(['dateKey', 'bonuses', 'totalClaimed', 'updatedAt']);
  allow delete: if false;
}
```

### Testing Procedures for Task 1

#### Test 1.1.1: Bonus Award on Bet Creation
1. Open browser and log in
2. Create a new bet
3. Check Firebase Firestore → `users/{uid}/dailyBonuses/{today}` → verify document exists
4. Verify `totalClaimed` includes 50 coins for bet
5. Verify notification appears in app
6. Check user's coinBalance increased by 50

#### Test 1.1.2: Duplicate Prevention
1. Try to create another bet (same user, same day)
2. Verify bonus is NOT awarded again
3. Check that notification doesn't appear
4. Check that `bonuses` array only has one bet entry

#### Test 1.1.3: MinigamesPage Display
1. Navigate to MinigamesPage
2. Verify daily bonus section displays
3. Verify "Earned today" shows correct amount (50 if only bet created)
4. Verify "Potential remaining" shows 135 - earned amount
5. Verify "Claimed: bet" text appears

#### Test 1.1.4: Multiple Bonus Types
1. Create a bet (+50)
2. Create a challenge (+50)
3. Make a prediction (+25)
4. Comment on a bet (+10)
5. Verify MinigamesPage shows all 4 claimed types
6. Verify total = 135 coins
7. Verify potential remaining = 0

#### Test 1.1.5: Daily Reset
1. Perform all actions today
2. Verify totalClaimed = 135 and potential = 0
3. Wait for next UTC day or manually adjust system time
4. Refresh page
5. Verify totalClaimed resets to 0 and potential = 135

---

## Task 2: Logical Betting System (Timing Multiplier)

### Objectives
- Verify timing multiplier penalizes late betting
- Ensure profits approach break-even for late bets but never go negative
- Confirm early predictions get higher rewards than late ones

### Verification Steps (Already Implemented)

#### Step 2.1: Understand the Formula
**File**: `src/utils/coins.ts` - Line 72-83

The timing multiplier formula:
```typescript
const remainingRatio = timeRemaining / totalWindow;
return clamp(0.7 + 0.55 * Math.sqrt(remainingRatio), 0.7, 1.25);
```

**What it does:**
- Multiplier range: 0.7 (minimum) to 1.25 (maximum)
- Early bet (lots of time remaining): multiplier ≈ 1.25 (125% of base reward)
- Late bet (little time remaining): multiplier ≈ 0.7 (70% of base reward)
- Applied in calculation: `mintedReward = Math.round(10 * ... * timingMultiplier * ...)`

#### Step 2.2: Testing Early vs Late Predictions
1. Create a bet with 7-day deadline
2. Make prediction immediately after bet creation
   - Note the minted reward shown in UI
3. Wait several days, make another prediction near deadline
   - Note the minted reward shown in UI
4. Resolve bet with both winners
5. Compare rewards:
   - Early prediction should have ~75% higher reward than late
   - Both should be positive (never penalized to negative)

#### Step 2.3: Test on Lost Predictions
1. Create a bet with 24-hour deadline
2. Make early prediction on winning option → Check reward if won
3. Make late prediction on losing option → Check that loss is just stake loss
4. Verify late betting doesn't incur additional penalties beyond stake loss

#### Test 2.3.1: Verify Minimum Multiplier (0.7)
1. Create bet at 7 PM
2. Deadline at 8 PM same day
3. Make prediction at 7:59 PM (1 minute before deadline)
4. Verify multiplier is at least 0.7 (check in prediction record)
5. Confirm reward calculation: `mintedReward ≥ 10 * stakeWeight * difficultyMultiplier * 0.7 * revisionMultiplier`

#### Test 2.3.2: Verify Maximum Multiplier (1.25)
1. Create bet at 7 PM
2. Deadline at 8 PM same day
3. Make prediction at 7:01 PM (1 minute after creation)
4. Verify multiplier is at most 1.25
5. Confirm this is highest possible reward for this bet

---

## Task 3: Complete Notification System Audit & Testing

### Objectives
- Audit token storage and management
- Test end-to-end notification delivery
- Verify worker processes
- Test database communication
- Implement test push button
- Document all findings

### Part A: Token System Audit

#### Step 3A.1: Understand Token Storage Structure
**File to verify**: Firestore → `users/{uid}/notificationTokens/`

Expected structure for each token document:
```
Document ID: device_{timestamp}_{random} or old base64 format
Fields:
  - token: string (FCM token from Firebase)
  - enabled: boolean
  - userAgent: string
  - createdAt: Timestamp
  - updatedAt: Timestamp
  - disabledAt: Timestamp (optional)
```

#### Step 3A.2: Audit Device ID Persistence
1. In browser DevTools → Application → Local Storage
2. Find key: `__called_it_device_id__`
3. Note the value (should be `device_{timestamp}_{random}`)
4. Refresh page
5. Verify same device ID persists
6. Clear localStorage
7. Refresh page
8. Verify NEW device ID is generated

#### Step 3A.3: Audit Token Registration Flow
1. Open MinigamesPage in incognito window
2. Look for notification enable option
3. Click to enable notifications
4. Check browser notification permission dialog
5. In Firestore, verify:
   - New document created in `/users/{uid}/notificationTokens/`
   - Document ID matches localStorage deviceId
   - `enabled: true`
   - `token` field contains valid FCM token (150+ characters)
   - `updatedAt` is current timestamp

#### Step 3A.4: Audit Token Policy (Per-Device vs Per-User)
1. Enable notifications on Device A (desktop)
2. Check Firestore: one token with `enabled: true`
3. Enable notifications on Device B (mobile)
4. Check Firestore: 
   - Device A token: should still have `enabled: true`
   - Device B token: new document with `enabled: true`
   - Should have 2 enabled tokens (per-device)

#### Step 3A.5: Audit Backward Compatibility
1. Check Firestore for any tokens with IDs NOT starting with `device_`
2. These are old format tokens from before the fix
3. Check their `enabled` status
4. They should have `enabled: false` if migration ran
5. In code, verify `enablePushNotifications()` logic disables old tokens:
   ```typescript
   const isOldFormat = !item.id.startsWith('device_');
   return (item.data().enabled === true && !isCurrentDevice) || isOldFormat;
   ```

### Part B: Firestore Database Verification

#### Step 3B.1: Verify Notifications Collection Structure
1. Navigate to Firestore → `notifications` collection
2. Find recent notification documents
3. Each should have:
   ```
   - type: string (bet_created, prediction_updated, test_push, etc.)
   - actorUid: string
   - actorUsername: string
   - actorDisplayName: string
   - targetUids: array of strings
   - title: string
   - body: string
   - url: string
   - readBy: array
   - sentAt: Timestamp (null before worker processes)
   - createdAt: Timestamp
   ```

#### Step 3B.2: Verify Document Timestamps
1. Create a test notification (e.g., by creating a bet)
2. Check notification document:
   - `createdAt`: should be NOW (client timestamp)
   - `sentAt`: should be NULL initially
3. Wait 15+ seconds
4. Refresh and check again
5. `sentAt` should now have a timestamp (worker processed it)

#### Step 3B.3: Verify Target UIDs are Recorded Correctly
1. Create a notification that targets specific users
2. Check `targetUids` array contains correct user IDs
3. For public bet creation: should include all invited users + creator
4. For prediction: should include bet creator + relevant predictors

#### Step 3B.4: Check for Failed Notifications
1. Look at Firestore logs/activity
2. Or query notifications where certain users' tokens failed
3. Check if there are multiple `sentAt` attempts
4. Verify no documents stuck in `sentAt: null` state for >1 hour

### Part C: Worker Process Verification

#### Step 3C.1: Check Worker is Running
1. SSH to VPS: `ssh accounts`
2. Check PM2 status: `pm2 list`
3. Look for `notification-worker` process
4. Verify status is "online" (not stopped/errored)
5. Check uptime

```bash
pm2 list
# Should show something like:
# ┌─────┬──────────────────────┬──────┬──────┬──────────┬──────────┐
# │ id  │ name                 │ mode │ pid  │ status   │ uptime   │
# ├─────┼──────────────────────┼──────┼──────┼──────────┼──────────┤
# │ 0   │ notification-worker  │ fork │ 1234 │ online   │ 2 days   │
```

#### Step 3C.2: Check Worker Logs
1. View recent logs: `pm2 logs notification-worker --lines 100`
2. Look for:
   - "Sending notification to..." messages (success)
   - "Error:" messages (failures)
   - Token validation errors
   - FCM communication errors
3. Check for any obvious error patterns

```bash
pm2 logs notification-worker --lines 50
# Should show patterns like:
# [2026-06-12 12:30:45] Sent notification {id:"xxx",success:1,failed:0}
# [2026-06-12 12:31:00] Processing batch of 5 notifications
```

#### Step 3C.3: Check Worker Database Connection
1. In worker logs, verify no "Connection refused" errors
2. Verify Firestore is accessible (no auth errors)
3. Check for "Initialized worker" startup message

#### Step 3C.4: Monitor Worker Token Processing
1. Create multiple notifications in quick succession
2. Check logs for queue behavior
3. Verify batch processing (not sending one-by-one)
4. Check for rate limiting (15-minute backoff visible in logs)

### Part D: End-to-End Communication Testing

#### Step 3D.1: Create Test Notification from App
1. Use the admin test push button on MinigamesPage
2. Should show message: "✓ Test push sent to X user(s)"
3. Check browser console for any errors
4. Verify notification document created in Firestore with:
   - `type: 'test_push'`
   - `targetUids: [userId]` (or multiple if multiple users have notifications enabled)

#### Step 3D.2: Monitor FCM Delivery
1. After creating test notification, check worker logs
2. Should see message like: `Sent notification {id:"xxx",success:1,failed:0}`
3. If `failed: 1`, worker attempted to send but FCM rejected token
4. This indicates token validation issue

#### Step 3D.3: Test Push Notification Receipt
1. Have at least 2 browser windows/devices
2. Window A: Click test push button
3. Window B: Should receive push notification within 5-10 seconds
4. Click notification in Window B
5. Should navigate to the URL specified in notification

#### Step 3D.4: Test Foreground Notification
1. Keep app tab active/focused
2. Have another user send you a notification (e.g., bet them on a bet)
3. Verify in-app notification appears (not just system notification)
4. Check browser console: `onMessage` listener should have fired

#### Step 3D.5: Test Background Notification
1. Close app tab or minimize window
2. Have another user send you a notification
3. Verify system push notification appears
4. Click notification
5. App should open and navigate to correct URL

### Part E: Implementation of Test Push Button

#### Step 3E.1: Create sendTestPushToAllUsers Function
**File**: `src/services/notificationService.ts`

```typescript
export async function sendTestPushToAllUsers(actor: UserProfile) {
  // Get all users with enabled notification tokens
  const usersSnap = await getDocs(
    query(
      collection(db, 'users'),
      where('coinBalance', '>=', 0) // Just get all users
    )
  );

  const targetUids: string[] = [];
  for (const userDoc of usersSnap.docs) {
    const tokensSnap = await getDocs(
      query(
        collection(db, 'users', userDoc.id, 'notificationTokens'),
        where('enabled', '==', true)
      )
    );
    if (tokensSnap.size > 0) {
      targetUids.push(userDoc.id);
    }
  }

  if (targetUids.length === 0) {
    throw new Error('No users with enabled notifications found');
  }

  await addDoc(collection(db, 'notifications'), {
    type: 'test_push',
    actorUid: actor.uid,
    actorUsername: actor.username,
    actorDisplayName: actor.displayName,
    targetUids,
    title: '🧪 Test notification from admin',
    body: `Test sent at ${new Date().toLocaleTimeString()}. If you received this, push notifications are working!`,
    url: '/#/minigames',
    readBy: [],
    sentAt: null,
    createdAt: serverTimestamp(),
  });

  return { sent: true, count: targetUids.length };
}
```

#### Step 3E.2: Add Test Button to MinigamesPage
**File**: `src/pages/MinigamesPage.tsx`

1. Import: `import { sendTestPushToAllUsers } from '../services/notificationService'`
2. Add state: `const [testPushSending, setTestPushSending] = useState(false);`
3. Add handler function:
```typescript
async function sendTestPush() {
  if (!profile || !profile.isAdmin) return;
  setTestPushSending(true);
  setMessage('');
  try {
    const result = await sendTestPushToAllUsers(profile);
    setMessage(`✓ Test push sent to ${result.count} user(s) with enabled notifications.`);
  } catch (err) {
    setMessage(err instanceof Error ? err.message : 'Failed to send test push.');
  } finally {
    setTestPushSending(false);
  }
}
```
4. Add button (visible only to admins):
```typescript
{profile?.isAdmin && (
  <div className="mb-4 rounded-md border border-line bg-field p-4">
    <button
      onClick={sendTestPush}
      disabled={testPushSending}
      className="w-full rounded-md bg-plum px-4 py-2 text-sm font-bold text-white transition-all enabled:hover:bg-plum/90 disabled:opacity-60"
    >
      {testPushSending ? 'Sending...' : '🧪 Send Test Push to All Users'}
    </button>
  </div>
)}
```

#### Step 3E.3: Test Admin Button
1. Login as admin user
2. Navigate to MinigamesPage
3. Verify test push button appears
4. Click button
5. Verify message shows count of users
6. Check Firestore: notification document created
7. Check worker logs: message about sending
8. Verify non-admin users don't see button

### Part F: Comprehensive End-to-End Test Procedure

#### Test 3F.1: Full Cycle Test
**Prerequisite**: At least 2 users, both with notifications enabled

1. **Setup**:
   - User A and User B both enable notifications
   - Verify tokens in Firestore for both
   - SSH to VPS and check worker logs clear

2. **Create Notification**:
   - User A creates a bet
   - Bet targets User B (invited or public)

3. **Database Check**:
   - Check Firestore: notification document exists
   - `type: 'bet_created'`
   - `targetUids` includes User B's ID
   - `sentAt: null`

4. **Worker Processing**:
   - Wait 15-20 seconds
   - Check Firestore: `sentAt` now has timestamp
   - Check worker logs: should see success message

5. **User B Receives**:
   - Verify push notification appears on User B's device
   - If app is open: in-app notification
   - If app is closed: system notification
   - Click notification: app opens to correct page

6. **Database Confirmation**:
   - Verify notification document in Firestore shows processed
   - No errors in worker logs

#### Test 3F.2: Failure Recovery Test
1. Disable User A's internet connection
2. Try to create notification (should fail gracefully)
3. Re-enable internet
4. Create another notification
5. Verify it goes through normally
6. Check worker logs: no stuck/retried messages

#### Test 3F.3: Multiple Device Test
1. Enable notifications on Desktop
2. Create a bet (gets notification on desktop)
3. Enable notifications on Mobile (same account)
4. Create another bet (gets notifications on both desktop and mobile)
5. Check Firestore: two enabled tokens for same user
6. Worker should send to both devices
7. Verify both devices receive notification

---

## Task 4: 6-Hour Forecast/Wheel Cycles

### Objectives
- Convert forecast from 24-hour to 6-hour cycles
- Convert wheel from 24-hour to 6-hour cycles
- Users can claim 4 times per day instead of 1
- Update UI messaging
- Prepare for action-based reminder notifications

### Implementation Steps

#### Step 4.1: Create 6-Hour Utility Functions
**File**: `src/utils/coins.ts`

Add new functions after existing `canClaimDailyReward`:
```typescript
export function canClaimSixHourReward(lastClaimAt?: Date | null) {
  if (!lastClaimAt) return true;
  const sixHours = 6 * 60 * 60 * 1000;
  return Date.now() - lastClaimAt.getTime() >= sixHours;
}

export function getNextSixHourClaimTime(lastClaimAt?: Date | null): Date {
  if (!lastClaimAt) return new Date();
  const sixHours = 6 * 60 * 60 * 1000;
  return new Date(lastClaimAt.getTime() + sixHours);
}
```

#### Step 4.2: Create 6-Hour Key Function
**File**: `src/services/rewardService.ts`

Add new function right after existing `dayKey()`:
```typescript
function sixHourKey(date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10);
  const hour = date.getUTCHours();
  const sixHourBlock = Math.floor(hour / 6);
  return `${dateStr}_${sixHourBlock * 6}`;
}
```

This generates keys like:
- `2026-06-12_0` (0:00-5:59 UTC)
- `2026-06-12_6` (6:00-11:59 UTC)
- `2026-06-12_12` (12:00-17:59 UTC)
- `2026-06-12_18` (18:00-23:59 UTC)

#### Step 4.3: Update Forecast Claiming Logic
**File**: `src/services/rewardService.ts`

In `claimDailyForecast()` function:
1. Change: `const claimRef = rewardClaimRef(user.uid, 'forecast_${dayKey()}');`
   To: `const claimRef = rewardClaimRef(user.uid, 'forecast_${sixHourKey()}');`
2. Change: `!canClaimDailyReward(current.lastDailyForecastAt?.toDate?.() ?? null)`
   To: `!canClaimSixHourReward(current.lastDailyForecastAt?.toDate?.() ?? null)`
3. Update error message: `'Forecast is on cooldown. Available again in 6 hours.'`

#### Step 4.4: Update Wheel Claiming Logic
**File**: `src/services/rewardService.ts`

In `spinWheel()` function:
1. Change: `const claimRef = rewardClaimRef(user.uid, 'wheel_${dayKey()}');`
   To: `const claimRef = rewardClaimRef(user.uid, 'wheel_${sixHourKey()}');`
2. Change: `!canClaimDailyReward(current.lastWheelSpinAt?.toDate?.() ?? null)`
   To: `!canClaimSixHourReward(current.lastWheelSpinAt?.toDate?.() ?? null)`
3. Update error message: `'The wheel is cooling down. Available again in 6 hours.'`

#### Step 4.5: Update MinigamesPage Availability Checks
**File**: `src/pages/MinigamesPage.tsx`

1. Import: Change from `canClaimDailyReward` to `canClaimSixHourReward`
2. Update const declarations:
```typescript
const forecastAvailable = profile ? canClaimSixHourReward(profile.lastDailyForecastAt?.toDate?.() ?? null) : false;
const wheelAvailable = profile ? canClaimSixHourReward(profile.lastWheelSpinAt?.toDate?.() ?? null) : false;
```

#### Step 4.6: Update UI Messaging
**File**: `src/pages/MinigamesPage.tsx`

1. Forecast section heading: Change "Daily forecast" to "Forecast"
2. Forecast description: Change "One forecast reward per day. ..." to "Claim every 6 hours. Available now/Cooldown in progress."
3. Wheel section heading: Keep "Wheel" or change to "Spin the Wheel"
4. Wheel description: Change "Wheel spin available today..." to "Wheel spin available now/Wheel on cooldown. Available in up to 6 hours."

### Testing Procedures for Task 4

#### Test 4.1.1: Verify sixHourKey Function
1. Open browser console
2. Test at different times:
   - 02:00 UTC → `2026-06-12_0`
   - 07:00 UTC → `2026-06-12_6`
   - 13:00 UTC → `2026-06-12_12`
   - 20:00 UTC → `2026-06-12_18`

#### Test 4.1.2: Claim Forecast in First Cycle
1. At 00:30 UTC, claim forecast
2. Check Firestore: `rewardClaims/{userId}_forecast_2026-06-12_0`
3. Verify document created

#### Test 4.1.3: Verify 6-Hour Cooldown
1. After claiming at 00:30 UTC:
   - At 05:59 UTC: Try to claim → Should fail "Cooldown"
   - At 06:01 UTC: Try to claim → Should succeed
2. Check Firestore: New document created `rewardClaims/{userId}_forecast_2026-06-12_6`

#### Test 4.1.4: Verify 4 Claims Per Day
1. Throughout one UTC day:
   - Claim 1: Between 00:00-05:59
   - Claim 2: Between 06:00-11:59
   - Claim 3: Between 12:00-17:59
   - Claim 4: Between 18:00-23:59
2. Verify all 4 rewardClaim documents exist
3. Verify 5th attempt at next cycle fails (would be same 6-hour block)

#### Test 4.1.5: Verify MinigamesPage Availability Display
1. At 00:30 after claiming forecast:
   - Page should show "Cooldown in progress" for forecast
   - Button should be disabled
2. At 05:59 (29 min before next cycle):
   - Page should still show "Cooldown in progress"
   - Button still disabled
3. At 06:00:
   - Refresh page
   - Page should show "Available now"
   - Button should be enabled

#### Test 4.1.6: Verify Same Logic for Wheel
Repeat tests 4.1.2-4.1.5 for wheel spin instead of forecast

---

## Task 5: Action-Based Reminder Notifications (VPS Setup)

### Objectives
- Implement cron jobs on VPS to send reminder notifications every 6 hours
- Send forecasts reminders when forecast becomes available
- Send wheel reminders when wheel becomes available
- Optional: Send daily bonus reminders

### Prerequisites
- SSH access to VPS (accounts)
- PM2 running notification-worker
- Worker can write to Firestore

### Implementation Steps

#### Step 5.1: Understand the Reminder Requirements
**What needs to happen**:
- Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
- Find users with:
  - Enabled push notifications (token in `/users/{uid}/notificationTokens/` with `enabled: true`)
  - `lastDailyForecastAt` > 6 hours old
  - `lastWheelSpinAt` > 6 hours old
- Send notifications to those users

#### Step 5.2: SSH to VPS and Check Worker
1. SSH to VPS: `ssh accounts`
2. Check notification-worker location: `pm2 show notification-worker`
3. Find the script path (typically `/path/to/worker.js`)
4. View current file: `cat /path/to/worker.js | head -100`

#### Step 5.3: Create Forecast Reminder Job
In worker.js, add new function:
```javascript
async function sendForecastReminders() {
  console.log(`[${new Date().toISOString()}] Starting forecast reminder job`);
  
  try {
    const usersSnap = await db.collectionGroup('notificationTokens')
      .where('enabled', '==', true)
      .get();
    
    const userIds = new Set(usersSnap.docs.map(doc => doc.ref.parent.parent.id));
    
    const sixHours = 6 * 60 * 60 * 1000;
    const now = Date.now();
    
    for (const userId of userIds) {
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists()) continue;
      
      const lastForecast = userDoc.data().lastDailyForecastAt?.toMillis?.() ?? 0;
      
      // Send reminder if forecast is available (last one > 6 hours old)
      if (now - lastForecast >= sixHours) {
        await db.collection('notifications').add({
          type: 'forecast_available',
          actorUid: 'system',
          actorUsername: 'Called It',
          actorDisplayName: 'Called It',
          targetUids: [userId],
          title: '⏰ Forecast available!',
          body: 'New forecast cycle ready. Claim your reward now.',
          url: '/#/minigames',
          readBy: [],
          sentAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`Sent forecast reminder to ${userId}`);
      }
    }
    
    console.log(`[${new Date().toISOString()}] Forecast reminder job complete`);
  } catch (error) {
    console.error('Error in forecast reminder job:', error);
  }
}
```

#### Step 5.4: Create Wheel Reminder Job
Similar to forecast, create function for wheel:
```javascript
async function sendWheelReminders() {
  // Same structure as sendForecastReminders but for lastWheelSpinAt
  // type: 'wheel_available'
  // title: '🎡 Wheel is ready!'
  // body: 'Spin the wheel and test your luck.'
}
```

#### Step 5.5: Schedule Cron Jobs
Add to worker initialization code:
```javascript
const cron = require('node-cron');

// Run forecast reminders every 6 hours (0, 6, 12, 18 UTC)
cron.schedule('0 0,6,12,18 * * *', () => {
  sendForecastReminders();
});

// Run wheel reminders every 6 hours (0, 6, 12, 18 UTC)
cron.schedule('0 0,6,12,18 * * *', () => {
  sendWheelReminders();
});

console.log('Reminder jobs scheduled');
```

#### Step 5.6: Deploy Updated Worker
1. SSH to VPS: `ssh accounts`
2. Update worker.js with new functions and cron jobs
3. Restart worker: `pm2 restart notification-worker`
4. Check logs: `pm2 logs notification-worker --lines 50`
5. Should see: "Reminder jobs scheduled"

### Testing Procedures for Task 5

#### Test 5.1.1: Verify Jobs Are Scheduled
1. SSH to VPS
2. Check logs: `pm2 logs notification-worker --lines 100`
3. Should see message: "Reminder jobs scheduled"
4. Should see cron job execution logs every 6 hours

#### Test 5.1.2: Manual Job Trigger
1. SSH to VPS
2. Create a test script that calls `sendForecastReminders()`
3. Run it: `node test-reminders.js`
4. Check logs for success
5. Check Firestore: new notification documents should exist
6. Verify `type: 'forecast_available'`

#### Test 5.1.3: Verify Reminders Send at Correct Time
1. Claim a forecast at 00:30 UTC
2. Wait until 06:00 UTC (or mock system time)
3. Check Firestore notifications collection
4. Should see new `forecast_available` notification
5. Check worker logs: should see "Sent forecast reminder to {userId}"

#### Test 5.1.4: Verify Reminders Don't Send Twice
1. Claim forecast at 00:30 UTC
2. At 06:00, forecast reminder job runs
3. Notification created
4. At 06:15, manually trigger job again
5. Should NOT create another notification
6. Check logs: Should see "already sent" or skip message

#### Test 5.1.5: Verify Only Users with Enabled Tokens Get Reminders
1. User A: Enable notifications
2. User B: Disable notifications
3. User C: No token at all
4. Trigger reminder job
5. Verify only User A receives notification
6. Check Firestore: notification should have `targetUids: [userA]`

#### Test 5.1.6: End-to-End Reminder Test
1. User enables notifications
2. User claims forecast at 00:30
3. Wait until or mock 06:00 UTC
4. Job runs and creates notification
5. Worker processes it (checks logs)
6. User receives push notification on device
7. Verify notification has correct title: "⏰ Forecast available!"
8. Click notification: app opens to MinigamesPage

---

## Comprehensive Verification Checklist

Use this checklist to verify all tasks are complete and working:

### Task 1: Daily Bonuses
- [ ] Bonus service created with all 4 bonus types
- [ ] Types defined in types.ts
- [ ] Bonus awards integrated into bet creation
- [ ] Bonus awards integrated into challenge creation
- [ ] Bonus awards integrated into predictions
- [ ] Bonus awards integrated into comments
- [ ] MinigamesPage displays bonus progress
- [ ] Firestore rules allow dailyBonuses reads/writes
- [ ] Test: Can earn all 4 bonuses in one day
- [ ] Test: Cannot earn same bonus type twice same day
- [ ] Test: Bonuses reset next UTC day
- [ ] Test: Notifications sent when bonuses earned

### Task 2: Timing Multiplier
- [ ] Formula exists in coins.ts with range 0.7-1.25
- [ ] Applied to mintedReward calculation
- [ ] Test: Early predictions get higher rewards
- [ ] Test: Late predictions get lower rewards
- [ ] Test: Multiplier never goes below 0.7
- [ ] Test: Multiplier never goes above 1.25
- [ ] Test: Lost predictions don't have special penalties

### Task 3: Notification System
**Token System**:
- [ ] Device ID persists in localStorage
- [ ] New tokens use device_* format
- [ ] Old tokens still exist but disabled
- [ ] Token contains: token, enabled, userAgent, createdAt, updatedAt, disabledAt

**Database**:
- [ ] Notifications collection has correct structure
- [ ] Documents have: type, actorUid, targetUids, title, body, url, createdAt, sentAt
- [ ] Timestamps correct (createdAt=now, sentAt=null initially)

**Worker**:
- [ ] PM2 shows notification-worker online
- [ ] No errors in logs
- [ ] Processes notifications within 15 seconds
- [ ] Updates sentAt timestamp

**Test Button**:
- [ ] sendTestPushToAllUsers function exists
- [ ] Only admins can see button
- [ ] Shows count of users reached
- [ ] Creates test_push notification in Firestore

**End-to-End**:
- [ ] Test: Create notification via app
- [ ] Test: Worker processes it (check logs)
- [ ] Test: Appears on target user's device
- [ ] Test: Works in foreground (in-app notification)
- [ ] Test: Works in background (push notification)
- [ ] Test: Click notification navigates correctly

### Task 4: 6-Hour Cycles
- [ ] sixHourKey function exists
- [ ] canClaimSixHourReward function exists
- [ ] getNextSixHourClaimTime function exists
- [ ] Forecast uses sixHourKey for claims
- [ ] Wheel uses sixHourKey for claims
- [ ] Both check canClaimSixHourReward
- [ ] UI says "Claim every 6 hours"
- [ ] Test: Can claim 4 times per day
- [ ] Test: Cannot claim twice in same 6-hour block
- [ ] Test: Can claim again after 6 hours
- [ ] Test: Availability state updates correctly

### Task 5: Reminder Notifications (VPS)
- [ ] sendForecastReminders function added to worker
- [ ] sendWheelReminders function added to worker
- [ ] Cron jobs scheduled for 00:00, 06:00, 12:00, 18:00 UTC
- [ ] Jobs only target users with enabled tokens
- [ ] Jobs only target users where 6+ hours passed
- [ ] Test: Forecast reminder sent at correct time
- [ ] Test: Wheel reminder sent at correct time
- [ ] Test: User receives push notification
- [ ] Test: User with notifications disabled doesn't receive

---

## Troubleshooting Guide

### Issue: Bonuses not being awarded
**Check**:
1. Verify bonusService.ts imports correctly
2. Check Firestore rules allow dailyBonuses collection
3. Verify `awardDailyBonus` is called after each action
4. Check browser console for errors
5. Verify user has permission to write to Firestore

### Issue: Test push button doesn't appear
**Check**:
1. Verify user has `isAdmin: true` in Firestore
2. Verify `sendTestPushToAllUsers` is imported
3. Check browser console for errors
4. Verify the button code is present in MinigamesPage.tsx

### Issue: Notifications appear in Firestore but not on device
**Check**:
1. Verify user has enabled notifications
2. Check Firestore: user has enabled token in notificationTokens
3. SSH to VPS and check worker logs for errors
4. Verify FCM token is valid (150+ characters)
5. Check browser notification permissions

### Issue: Worker not processing notifications
**Check**:
1. SSH to VPS: `pm2 list` - is worker online?
2. Check logs: `pm2 logs notification-worker`
3. Verify Firestore connection works
4. Check for auth errors in logs
5. Restart worker: `pm2 restart notification-worker`

### Issue: 6-hour claims not working
**Check**:
1. Verify sixHourKey function returns correct format
2. Check Firestore: rewardClaims have correct IDs (with _0, _6, _12, _18)
3. Verify canClaimSixHourReward returns correct boolean
4. Check MinigamesPage uses correct function

---

## Deployment & Rollout Checklist

Before deploying to production:

1. **Code Review**:
   - [ ] All code follows existing patterns
   - [ ] No console.log() calls left in production code
   - [ ] Type safety verified (no `any` types except where necessary)
   - [ ] Security rules reviewed and approved

2. **Testing Completed**:
   - [ ] All 5 tasks tested individually
   - [ ] End-to-end testing completed
   - [ ] Edge cases tested
   - [ ] Error handling verified

3. **Performance**:
   - [ ] No new N+1 queries
   - [ ] Firestore indexes created if needed
   - [ ] Bundle size checked

4. **Documentation**:
   - [ ] NOTIFICATION_TOKEN_ANALYSIS.md complete
   - [ ] IMPLEMENTATION_SUMMARY.md complete
   - [ ] Code comments added where needed

5. **VPS Deployment**:
   - [ ] Worker updated with reminder jobs
   - [ ] Tested in staging first
   - [ ] PM2 configured to auto-restart

6. **Monitoring**:
   - [ ] Logs being monitored for errors
   - [ ] Alert configured for worker failures
   - [ ] Daily review of notification delivery rates

---

## Success Criteria

All tasks are complete when:

✅ **Daily Bonuses**: Users earn 4 different bonuses (bet, challenge, prediction, comment) totaling 135 coins/day, with progress visible on MinigamesPage

✅ **Timing Multiplier**: Early predictions earn 75% more than late ones, with rewards clamped at 0.7-1.25x multiplier

✅ **Notification Audit**: Complete documentation of token system, worker processes, and end-to-end delivery verified with test button

✅ **6-Hour Cycles**: Forecast and wheel can be claimed 4 times per day instead of 1, with updated UI messaging

✅ **Reminders**: VPS worker sends forecast/wheel availability reminders every 6 hours to users who haven't claimed yet

---

## Next Steps After Completion

1. **Monitor in Production**:
   - Watch for errors in worker logs
   - Track notification delivery rates
   - Gather user feedback on new features

2. **Iterate Based on Feedback**:
   - Adjust bonus amounts if needed
   - Fine-tune reminder timing
   - Add additional bonus types if desired

3. **Optional Enhancements**:
   - Add daily bonus milestone rewards (claim all 4 = bonus)
   - Add leaderboard for daily bonus leaders
   - Create seasonal bonus challenges
   - Add streak tracking for consistent daily activity
