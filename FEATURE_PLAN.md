# Feature Implementation Plan

## 1. Daily Incentives for Posting Bets/Challenges

### Overview
Users receive bonus coins for creating bets or challenges daily. This encourages daily engagement.

### Algorithm & Logic

```
Daily Bonus System:
├─ Check if user created bet/challenge today
├─ Track creation count per day (reset at midnight UTC)
├─ Award bonus on first creation of the day
└─ Prevent duplicate bonuses via timestamp check
```

### Implementation Details

**Data Structure:**
```typescript
// Add to UserProfile
lastBetCreatedAt?: Timestamp | null;  // Track last bet creation date
lastChallengeCreatedAt?: Timestamp | null;  // Track last challenge creation

// Or use a daily tracking collection
/dailyActions/{userId}/{dateKey}
├─ betCreated: boolean
├─ challengeCreated: boolean
└─ bonusAwarded: boolean
```

**Logic Flow:**
1. User creates bet/challenge
2. Check if `today's dateKey` exists in `/dailyActions/{userId}/{today}`
3. If not exists OR `betCreated/challengeCreated` is false:
   - Mark as created
   - Award bonus coins (e.g., +50 coins)
   - Set `bonusAwarded: true`
4. If already done today:
   - Create/resolve normally but no bonus

**Bonus Amount:**
- First bet/challenge of day: +50 coins
- Could increase based on streak (day 5: +75, day 10: +100)

**Edge Cases:**
- User creates multiple bets same day → Bonus only once
- Timezone handling → Use UTC dateKey for consistency
- Notification → Alert user when bonus earned

---

## 2. Logical Betting System (Penalize Late Changes)

### Overview
Late betting/changes should be penalized because information improves over time. Someone changing at the last minute likely has better info than early bettors.

### Algorithm & Logic

```
Timing Multiplier System:
├─ Base stake effect: 100% at creation
├─ Time decay: Decreases as deadline approaches
│  ├─ >50% time remaining: 100% multiplier
│  ├─ 25-50% time remaining: 80% multiplier
│  ├─ 10-25% time remaining: 60% multiplier
│  └─ <10% time remaining: 40% multiplier
└─ Change penalty: 50% multiplier when changing bet
```

### Implementation Details

**When Prediction is Created:**
```typescript
interface Prediction {
  originalStake: number;        // Original stake amount
  originalOptionId: string;     // Original choice
  originalChanceAtBetTime: number;
  originalCreatedAt: Timestamp;
  
  stake: number;                // Current stake
  optionId: string;             // Current choice
  lastChangedAt?: Timestamp;    // Last change time
  revisionCount?: number;       // How many times changed (0, 1, 2+)
  timingMultiplier?: number;    // Calculated multiplier (0.4 to 1.0)
}
```

**Multiplier Calculation:**

```
Function calculateTimingMultiplier(bet, prediction):
  IF prediction.revisionCount > 0:
    return 0.5  // Late change penalty
  
  IF bet.deadline IS NULL:
    return 1.0  // No deadline = no penalty
  
  timeRemaining = bet.deadline - NOW()
  totalTime = bet.deadline - bet.createdAt
  percentRemaining = timeRemaining / totalTime
  
  IF percentRemaining >= 0.5:
    return 1.0
  ELSE IF percentRemaining >= 0.25:
    return 0.8
  ELSE IF percentRemaining >= 0.1:
    return 0.6
  ELSE:
    return 0.4
```

**Impact on Resolution:**
```
Payout Calculation:
coinDelta = basePayout * timingMultiplier + spicyBonusIfWon

Example:
- Early bet (>50% time): Win = +100 coins
- Late bet (<10% time): Win = +40 coins
- Changed bet: Win = +50 coins (50% of base)
```

**Visual Feedback:**
- Show timing multiplier in prediction details
- Display "Late bet" badge if <25% time remaining
- Show revision count when user hovers

**Edge Cases:**
- Deadline is past → Can't place/change bet (already locked)
- User changes multiple times → Multiplier always 0.5 (not cumulative penalty)
- No deadline → No penalty (gives flexibility)

---

## 3. Full Notification System Audit

### Current Architecture

```
Notification Flow:
┌─ Client (App)
│  ├─ Real-time events write to /notifications
│  │  ├─ Prediction placed (bet_joined)
│  │  ├─ Comment posted (bet_commented)
│  │  ├─ Bet created (bet_created)
│  │  └─ Wager created (wager_created)
│  └─ Enable/disable push tokens
│
├─ Firestore /notifications Collection
│  ├─ sentAt: null (initial, waiting to be sent)
│  ├─ processingAt: timestamp (worker claimed it)
│  └─ sentAt: timestamp (after worker sent)
│
└─ VPS Worker (notification-worker/worker.js)
   ├─ Real-time listener: onSnapshot(/notifications where sentAt==null)
   ├─ Periodic scans: Every 10 minutes
   │  ├─ Bet resolutions
   │  ├─ Bet deadlines
   │  ├─ Daily rewards available
   │  └─ Wheel spins available
   └─ FCM Send: Via Firebase Admin SDK
```

### What's Working ✅

1. **Real-time notification creation:**
   - Client writes to `/notifications` immediately
   - Notifications for: predictions, comments, bets, wagers ✓

2. **Worker real-time listener:**
   - Listens via `onSnapshot` on unsent notifications ✓
   - Processes immediately when written ✓

3. **Token management:**
   - Per-device tokens stored in `/users/{uid}/notificationTokens/{deviceId}` ✓
   - Auto-disables old tokens on device re-registration ✓
   - Only active tokens receive notifications ✓

4. **FCM integration:**
   - Successfully sends to FCM ✓
   - Marks invalid tokens as disabled ✓
   - Respects notification rate limits ✓

### What's Not Working ❌

1. **6-hour periodic events:**
   - Currently checking every 10 minutes ✗
   - Daily forecast should be every 6 hours ✗
   - Wheel spins should be every 6 hours ✗

2. **Action-based reminders:**
   - No notification for: "Time to make your daily forecast" ✗
   - No notification for: "Time to spin the wheel" ✗
   - No notification for: "Get bonus coins by posting a bet today" ✗

3. **Notification clarity:**
   - Reward notifications might not clearly show the bonus structure ✗
   - No distinction between "action available" and "deadline soon" ✗

4. **Edge cases:**
   - Quota exhaustion hits, worker backs off 15min ✓ (working)
   - Old tokens might still exist before migration runs ⚠️ (risky)

### Recommended Fixes

**Immediate (Critical):**
1. Add `disabledAt` to Firestore rules ✓ (already done)
2. Ensure device ID migration removes old tokens

**High Priority:**
1. Change periodic scan to 6-hour intervals for forecast/wheel
2. Add new notification types:
   - `forecast_available` - "Your 6-hourly forecast is ready"
   - `wheel_available` - "Spin the wheel for coins"
   - `daily_bonus_available` - "Post a bet today to earn bonus coins"

3. Create scheduled notifications (not just event-based)
   - Use Firestore scheduled functions or cron job in worker

**Medium Priority:**
1. Improve notification messaging with context
2. Add action buttons in notifications (web push)
3. Add do-not-disturb times

---

## 4. 6-Hour Forecast & Wheel System with Reminders

### Overview
Users can forecast/spin every 6 hours instead of daily. Notifications remind them when available.

### Algorithm & Logic

```
6-Hour Cycle System:
├─ Current system: 24-hour reset (lastDailyForecastAt)
├─ New system: 6-hour windows
│  ├─ Window 1: 00:00-06:00 UTC
│  ├─ Window 2: 06:00-12:00 UTC
│  ├─ Window 3: 12:00-18:00 UTC
│  └─ Window 4: 18:00-00:00 UTC
└─ Tracking: Track last claim per window
```

### Data Structure Changes

**Current:**
```typescript
lastDailyForecastAt?: Timestamp;
lastWheelSpinAt?: Timestamp;
```

**New Approach (Option A - Simpler):**
```typescript
lastForecastAt?: Timestamp;  // Just track last time
// Check: NOW() - lastForecastAt >= 6 hours

// In daily activity tracking
/dailyActions/{userId}/{sixHourKey}
├─ forecastClaimed: boolean
├─ wheelClaimed: boolean
└─ claimedAt: Timestamp
```

**Why 6-hour key over timestamp:**
- Easier to identify "windows"
- Can enforce per-window limits
- Cleaner notification logic

### Notification Implementation

**New Notification Types:**
```typescript
type NotificationEventType =
  | 'forecast_available'    // Sent when 6h passed
  | 'wheel_available'       // Sent when 6h passed
  | 'daily_bonus_available' // Sent for bet posting bonus
  | ... existing types
```

**Trigger Logic:**

```
Function checkAndSendNotifications():
  FOR EACH user WHERE enabled notifications:
    
    // 6-hour forecast check
    timeSinceLastForecast = NOW() - user.lastForecastAt
    IF timeSinceLastForecast >= 6 hours:
      IF NOT already notified this window:
        sendNotification('forecast_available', user)
        mark('forecast_notified_window_X', user)
    
    // 6-hour wheel check
    timeSinceLastWheel = NOW() - user.lastWheelSpinAt
    IF timeSinceLastWheel >= 6 hours:
      IF NOT already notified this window:
        sendNotification('wheel_available', user)
        mark('wheel_notified_window_X', user)
    
    // Daily bet bonus check (once per day, UTC midnight)
    IF user.lastBetCreatedAt IS before TODAY:
      IF NOT already notified today:
        sendNotification('daily_bonus_available', user)
        mark('daily_bonus_notified_today', user)
```

**Notification Messages:**

```
Forecast Available:
Title: 🔮 Your 6-hourly forecast is ready!
Body: Make your next prediction and earn coins.
URL: /#/forecast

Wheel Available:
Title: 🎡 Spin the wheel again!
Body: Your next spin is available. Try your luck for coins.
URL: /#/minigames

Daily Bonus:
Title: 💰 Bonus coins available!
Body: Create a bet or challenge today to earn +50 coins bonus.
URL: /#/create
```

### Implementation Steps

**Step 1: Update Data Model**
```typescript
// In UserProfile
lastForecastAt?: Timestamp;   // When they last claimed
lastWheelAt?: Timestamp;      // When they last claimed

// In notificationService.ts
function get6HourKey(date: Date): string {
  const hours = date.getUTCHours();
  const day = date.toISOString().split('T')[0];
  const window = Math.floor(hours / 6); // 0, 1, 2, or 3
  return `${day}_window_${window}`;
}
```

**Step 2: Update Claim Logic**
```typescript
export async function claimDailyForecast(user, mode):
  const lastClaim = user.lastForecastAt?.toDate?.() ?? null;
  const now = new Date();
  const hoursPassed = (now - lastClaim) / (1000 * 60 * 60);
  
  IF hoursPassed < 6:
    throw new Error('Forecast available in ' + (6 - hoursPassed).toFixed(1) + ' hours');
  
  // ... existing claim logic ...
```

**Step 3: Add Worker Periodic Check**
```javascript
async function sendPeriodicReminders() {
  const snap = await db.collection('users').limit(100).get();
  
  for (const doc of snap.docs) {
    const user = doc.data();
    const now = Date.now();
    
    // Forecast reminder
    const lastForecast = user.lastForecastAt?.toMillis?.() ?? 0;
    if (now - lastForecast > 6 * 60 * 60 * 1000) {
      const notifId = `user_${user.id}_forecast_6h_${get6HourKey()}`;
      if (!exists(notifId)) {
        createNotification(notifId, {
          type: 'forecast_available',
          targetUids: [user.id],
          title: '🔮 Your 6-hourly forecast is ready!',
          body: 'Make your next prediction and earn coins.',
          url: '/#/forecast'
        });
      }
    }
    
    // Similar for wheel...
  }
}

// Call every 10 minutes in worker (existing scan interval)
```

### Edge Cases

1. **Timezone handling:**
   - Use UTC for all timestamp calculations
   - Windows: 00-06, 06-12, 12-18, 18-24 UTC

2. **Crossing window boundary:**
   - If user claims at 05:59, next available at 06:00+
   - Notification sent when crossing threshold

3. **User offline during window:**
   - Notification queued and sent when online
   - Reminder sent once per window only

---

## Summary of Changes

### Files to Modify

```
Frontend:
├─ src/types.ts
│  ├─ Change forecast/wheel to 6-hour cycle
│  └─ Add new notification types
├─ src/services/rewardService.ts
│  ├─ Update claimDailyForecast() for 6-hour check
│  ├─ Update spinWheel() for 6-hour check
│  └─ Add daily bet bonus logic
├─ src/services/betService.ts
│  ├─ Add timingMultiplier calculation
│  └─ Update payout logic to include multiplier
└─ src/pages/MinigamesPage.tsx
   └─ Display remaining time for next forecast/wheel

Backend (Firestore):
├─ firestore.rules
│  └─ Update allowed fields if needed
└─ notification-worker/worker.js
   ├─ Update scanRewardAvailability() for 6-hour intervals
   ├─ Add sendPeriodicReminders() function
   └─ Update daily bonus tracking

Database:
└─ /dailyActions/{userId}/{dateKey}
   ├─ betCreated: boolean
   ├─ challengeCreated: boolean
   ├─ bonusAwarded: boolean
   └─ notifications sent: tracking
```

### Implementation Priority

1. **Phase 1 (Week 1):** Daily bet bonus incentives
2. **Phase 2 (Week 2):** Timing multiplier penalties
3. **Phase 3 (Week 2):** Notification audit & fixes
4. **Phase 4 (Week 3):** 6-hour cycles & reminders

---

## Questions for Review

1. **Daily Bonus Amount:** Should it be fixed (+50) or scale with streak?
2. **Timing Multiplier:** Are the percentages (50%, 25%, 10%) correct thresholds?
3. **6-Hour Cycle:** Should forecast/wheel rewards scale differently per cycle?
4. **Notification Frequency:** OK to get 4 reminders/day (every 6h forecast + wheel)?
5. **Late Change Penalty:** Should changes after 25% time remaining show a warning?
