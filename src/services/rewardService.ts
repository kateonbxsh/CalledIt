import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  BetVisibility,
  ChallengeActivity,
  ChestDefinition,
  DailyForecastMode,
  FriendGroup,
  RewardClaim,
  UserProfile,
} from '../types';
import { canClaimDailyReward } from '../utils/coins';

const SAFE_FORECAST_REWARD = 60;
const SPICY_FORECAST_NOW = 20;
const SPICY_FORECAST_BONUS = 120;
function forecastReward(mode: DailyForecastMode) {
  const rewards: Record<DailyForecastMode, { amount: number; label: string; spicyBonus?: number }> = {
    safe: { amount: SAFE_FORECAST_REWARD, label: 'Safe daily forecast' },
    random: { amount: 10 + Math.floor(Math.random() * 91), label: 'Random refill' },
    chaos: { amount: [-20, 5, 130][Math.floor(Math.random() * 3)], label: 'Chaos refill' },
    spicy: { amount: SPICY_FORECAST_NOW, label: 'Spicy daily forecast', spicyBonus: SPICY_FORECAST_BONUS },
  };
  return rewards[mode];
}

export interface WeeklyChallengeDefinition {
  id: string;
  title: string;
  body: string;
  reward: number;
  chestReward: number;
}

const weeklyChallengeCatalog: WeeklyChallengeDefinition[] = [
  { id: 'cook-new', title: 'Cook something new', body: 'Make a dish you have not made before and upload the result.', reward: 70, chestReward: 35 },
  { id: 'walk-45', title: '45 minute walk', body: 'Take a real walk and upload proof from outside.', reward: 55, chestReward: 30 },
  { id: 'clean-zone', title: 'Clean one zone', body: 'Clean a desk, closet, kitchen area, or room corner. Before/after proof is ideal.', reward: 65, chestReward: 35 },
  { id: 'draw-anything', title: 'Draw anything', body: 'Make a sketch, doodle, diagram, or silly portrait.', reward: 45, chestReward: 25 },
  { id: 'gym-proof', title: 'Move your body', body: 'Gym, home workout, run, sport, yoga, or stretching session.', reward: 75, chestReward: 40 },
  { id: 'touch-grass', title: 'Touch grass', body: 'Go outside somewhere green and prove it.', reward: 40, chestReward: 20 },
  { id: 'read-20', title: 'Read 20 pages', body: 'Read a book, comic, paper, or long article and show the page or notes.', reward: 50, chestReward: 25 },
  { id: 'hydrate', title: 'Hydration check', body: 'Fill a big water bottle and finish it today.', reward: 35, chestReward: 20 },
  { id: 'learn-word', title: 'Learn one useful thing', body: 'Share a note about something you learned this week.', reward: 55, chestReward: 30 },
  { id: 'declutter-five', title: 'Remove five things', body: 'Throw away, donate, archive, or organize five things.', reward: 60, chestReward: 30 },
  { id: 'make-playlist', title: 'Make a playlist', body: 'Create a playlist for a mood, person, or event.', reward: 40, chestReward: 20 },
  { id: 'call-someone', title: 'Check in with someone', body: 'Message or call someone you have not talked to in a while.', reward: 45, chestReward: 25 },
  { id: 'photo-walk', title: 'Photo walk', body: 'Take three interesting photos from a walk.', reward: 65, chestReward: 35 },
  { id: 'fix-small', title: 'Fix one small annoyance', body: 'Patch, clean, repair, label, or improve one tiny thing.', reward: 70, chestReward: 35 },
  { id: 'no-snooze', title: 'No snooze morning', body: 'Wake up without snoozing and upload morning proof.', reward: 55, chestReward: 30 },
  { id: 'write-note', title: 'Write a note', body: 'Journal, plan, poem, idea list, or letter. Upload a safe snippet.', reward: 45, chestReward: 25 },
  { id: 'try-place', title: 'Try a new place', body: 'Visit somewhere new: cafe, park, shop, street, or route.', reward: 80, chestReward: 45 },
  { id: 'cook-veg', title: 'Eat something green', body: 'Make or buy a meal with an actual vegetable involved.', reward: 45, chestReward: 25 },
  { id: 'stretch-ten', title: 'Stretch 10 minutes', body: 'Do a stretching session and upload proof.', reward: 40, chestReward: 20 },
  { id: 'desk-reset', title: 'Desk reset', body: 'Reset your main workspace so it looks usable again.', reward: 55, chestReward: 30 },
  { id: 'wear-silly', title: 'Wear something ridiculous', body: 'Put on a strange outfit combo for five minutes and document it.', reward: 85, chestReward: 45 },
  { id: 'floor-picnic', title: 'Floor picnic', body: 'Eat a snack or meal picnic-style somewhere unusual but safe.', reward: 75, chestReward: 40 },
  { id: 'reverse-song', title: 'Sing one chorus badly', body: 'Record or photo-proof a tiny performance. Dramatic commitment encouraged.', reward: 90, chestReward: 50 },
  { id: 'tiny-fort', title: 'Build a tiny fort', body: 'Make a micro fort from pillows, books, boxes, or whatever is nearby.', reward: 95, chestReward: 50 },
  { id: 'stranger-object', title: 'Photograph a weird object', body: 'Find the oddest harmless object in your day and upload it.', reward: 60, chestReward: 30 },
  { id: 'one-song-dance', title: 'Dance for one song', body: 'Move for one full song. Proof can be a sweaty selfie or setup photo.', reward: 85, chestReward: 45 },
  { id: 'compliment-note', title: 'Leave a nice note', body: 'Write a nice note for someone or somewhere.', reward: 65, chestReward: 35 },
  { id: 'cold-splash', title: 'Cold water splash', body: 'Splash cold water on your face or take a cold shower finish.', reward: 70, chestReward: 35 },
  { id: 'one-minute-plank', title: 'One minute plank', body: 'Hold a plank or wall sit for one minute.', reward: 80, chestReward: 45 },
  { id: 'odd-sandwich', title: 'Invent a questionable sandwich', body: 'Make a sandwich with at least one unusual ingredient.', reward: 90, chestReward: 50 },
];

export function currentWeekKey(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return `${date.getUTCFullYear()}-W${Math.floor(day / 7) + 1}`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function weeklyChallengesForUser(user: UserProfile, weekKey = currentWeekKey()) {
  const start = hashString(`${user.uid}:${weekKey}`) % weeklyChallengeCatalog.length;
  return Array.from({ length: 10 }, (_, offset) => weeklyChallengeCatalog[(start + offset * 7) % weeklyChallengeCatalog.length]);
}

export const chestCatalog = [
  {
    id: 'getting-warm',
    title: 'Getting Warm',
    description: 'Resolve 3 predictions.',
    reward: 100,
    unlocked: (user: UserProfile) => user.stats.totalBets >= 3,
  },
  {
    id: 'upset-artist',
    title: 'Upset Artist',
    description: 'Win an upset worth at least 60%.',
    reward: 160,
    unlocked: (user: UserProfile) => user.stats.bestUpsetWin >= 60,
  },
  {
    id: 'steady-caller',
    title: 'Steady Caller',
    description: 'Win 5 predictions with at least 50% accuracy.',
    reward: 220,
    unlocked: (user: UserProfile) => user.stats.wins >= 5 && user.stats.accuracy >= 50,
  },
  {
    id: 'challenge-sampler',
    title: 'Challenge Sampler',
    description: 'Complete 3 real-life challenges.',
    reward: 180,
    unlocked: (user: UserProfile) => (user.stats.challengesCompleted ?? 0) >= 3,
  },
  {
    id: 'challenge-menace',
    title: 'Challenge Menace',
    description: 'Complete 10 real-life challenges.',
    reward: 350,
    unlocked: (user: UserProfile) => (user.stats.challengesCompleted ?? 0) >= 10,
  },
] as const;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function rewardClaimRef(userId: string, id: string) {
  return doc(db, 'rewardClaims', `${userId}_${id}`);
}

function challengeAudience(params: {
  visibility: BetVisibility;
  groupId?: string;
  groups?: FriendGroup[];
  user: UserProfile;
  invitedUsernames?: string[];
}) {
  const group = params.groupId ? params.groups?.find((item) => item.id === params.groupId) : null;
  if (params.groupId && !group) throw new Error('Choose a valid friend group.');
  if (!group) {
    const invitedUsernames = params.visibility === 'private'
      ? (params.invitedUsernames ?? [])
          .map((username) => username.trim().toLowerCase())
          .filter((username) => username && username !== params.user.username)
      : [];
    return {
      visibility: params.visibility,
      groupId: null,
      invitedUsernames,
    };
  }
  return {
    visibility: 'private' as BetVisibility,
    groupId: group.id,
    invitedUsernames: [group.creatorUsername, ...group.memberUsernames]
      .map((username) => username.trim().toLowerCase())
      .filter((username) => username && username !== params.user.username),
  };
}

function uniqueById(items: ChallengeActivity[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((left, right) => (right.createdAt?.toMillis?.() ?? 0) - (left.createdAt?.toMillis?.() ?? 0));
}

export async function claimDailyForecast(user: UserProfile, mode: DailyForecastMode) {
  const userRef = doc(db, 'users', user.uid);
  const claimRef = rewardClaimRef(user.uid, `forecast_${dayKey()}`);
  await runTransaction(db, async (transaction) => {
    const [userSnap, claimSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(claimRef),
    ]);
    const current = userSnap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    if (claimSnap.exists() || !canClaimDailyReward(current.lastDailyForecastAt?.toDate?.() ?? null)) {
      throw new Error('Daily forecast is already claimed.');
    }

    const reward = forecastReward(mode);
    transaction.set(claimRef, {
      userId: user.uid,
      username: user.username,
      type: 'dailyForecast',
      label: reward.label,
      amount: reward.amount,
      createdAt: serverTimestamp(),
    });
    transaction.update(userRef, {
      coinBalance: Math.max(0, current.coinBalance + reward.amount),
      lastDailyForecastAt: serverTimestamp(),
      pendingSpicyForecast: reward.spicyBonus
        ? { bonus: reward.spicyBonus, claimedAt: Timestamp.now() }
        : current.pendingSpicyForecast ?? null,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function getChestDefinitions(user: UserProfile): Promise<ChestDefinition[]> {
  const snap = await getDocs(query(collection(db, 'rewardClaims'), where('userId', '==', user.uid), limit(100)));
  const claimed = new Set(
    snap.docs
      .map((item) => ({ id: item.id, ...item.data() }) as RewardClaim)
      .filter((claim) => claim.type === 'chest')
      .map((claim) => claim.id.replace(`${user.uid}_chest_`, '')),
  );

  return chestCatalog.map((chest) => ({
    id: chest.id,
    title: chest.title,
    description: chest.description,
    reward: chest.reward,
    unlocked: chest.unlocked(user),
    claimed: claimed.has(chest.id),
  }));
}

export async function claimChest(user: UserProfile, chestId: string) {
  const chest = chestCatalog.find((item) => item.id === chestId);
  if (!chest) throw new Error('Chest not found.');
  if (!chest.unlocked(user)) throw new Error('Chest is still locked.');

  const userRef = doc(db, 'users', user.uid);
  const claimRef = rewardClaimRef(user.uid, `chest_${chest.id}`);
  await runTransaction(db, async (transaction) => {
    const claimSnap = await transaction.get(claimRef);
    if (claimSnap.exists()) throw new Error('Chest already opened.');
    transaction.set(claimRef, {
      userId: user.uid,
      username: user.username,
      type: 'chest',
      label: chest.title,
      amount: chest.reward,
      createdAt: serverTimestamp(),
    });
    transaction.update(userRef, {
      coinBalance: increment(chest.reward),
      'stats.chestsOpened': increment(1),
      updatedAt: serverTimestamp(),
    });
  });
}

export const wheelRewards = [
  { amount: 150, label: '+150' },
  { amount: -40, label: '-40' },
  { amount: 90, label: '+90' },
  { amount: 0, label: '0' },
  { amount: 60, label: '+60' },
  { amount: -20, label: '-20' },
  { amount: 25, label: '+25' },
  { amount: 200, label: '+200' },
];

export async function spinWheel(user: UserProfile) {
  const reward = wheelRewards[Math.floor(Math.random() * wheelRewards.length)];
  const userRef = doc(db, 'users', user.uid);
  const claimRef = rewardClaimRef(user.uid, `wheel_${dayKey()}`);

  await runTransaction(db, async (transaction) => {
    const [userSnap, claimSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(claimRef),
    ]);
    const current = userSnap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    if (claimSnap.exists() || !canClaimDailyReward(current.lastWheelSpinAt?.toDate?.() ?? null)) {
      throw new Error('The wheel is cooling down.');
    }
    transaction.set(claimRef, {
      userId: user.uid,
      username: user.username,
      type: 'wheel',
      label: 'Spin the wheel',
      amount: reward.amount,
      createdAt: serverTimestamp(),
    });
    transaction.update(userRef, {
      coinBalance: Math.max(0, current.coinBalance + reward.amount),
      lastWheelSpinAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return reward.amount;
}

export async function listChallengeActivities(user: UserProfile, groups: FriendGroup[] = []) {
  const challengesRef = collection(db, 'challenges');
  const snaps = await Promise.all([
    getDocs(query(challengesRef, where('visibility', '==', 'public'), limit(80))),
    getDocs(query(challengesRef, where('creatorId', '==', user.uid), limit(80))),
    getDocs(query(challengesRef, where('invitedUsernames', 'array-contains', user.username), limit(80))),
  ]);
  return uniqueById(
    snaps.flatMap((snap) => snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ChallengeActivity)),
  );
}

export async function postCompletedChallenge(params: {
  user: UserProfile;
  challenge: WeeklyChallengeDefinition;
  weekKey?: string;
  proofImageUrl: string;
  visibility: BetVisibility;
  groupId?: string;
  groups?: FriendGroup[];
  invitedUsernames?: string[];
}) {
  const weekKey = params.weekKey ?? currentWeekKey();
  const valid = weeklyChallengesForUser(params.user, weekKey).some((challenge) => challenge.id === params.challenge.id);
  if (!valid) throw new Error('This is not one of your weekly challenges.');
  const claimRef = rewardClaimRef(params.user.uid, `weekly_${weekKey}_${params.challenge.id}`);
  const audience = challengeAudience(params);
  const totalReward = params.challenge.reward + params.challenge.chestReward;

  await runTransaction(db, async (transaction) => {
    const claimSnap = await transaction.get(claimRef);
    if (claimSnap.exists()) throw new Error('Weekly challenge already completed.');
    transaction.set(claimRef, {
      userId: params.user.uid,
      username: params.user.username,
      type: 'weeklyChallenge',
      label: params.challenge.title,
      amount: totalReward,
      createdAt: serverTimestamp(),
    });
    transaction.set(doc(collection(db, 'challenges')), {
      type: 'completion',
      status: 'completed',
      visibility: audience.visibility,
      title: params.challenge.title,
      body: params.challenge.body,
      creatorId: params.user.uid,
      creatorUsername: params.user.username,
      invitedUsernames: audience.invitedUsernames,
      groupId: audience.groupId,
      completerId: params.user.uid,
      completerUsername: params.user.username,
      systemChallengeId: params.challenge.id,
      weekKey,
      proofImageUrl: params.proofImageUrl,
      reward: params.challenge.reward,
      chestReward: params.challenge.chestReward,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    });
    transaction.update(doc(db, 'users', params.user.uid), {
      coinBalance: increment(totalReward),
      'stats.challengesCompleted': increment(1),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function legacyPostCompletedChallenge(params: {
  user: UserProfile;
  title: string;
  body?: string;
  proofImageUrl: string;
}) {
  await addDoc(collection(db, 'challenges'), {
    type: 'completion',
    status: 'completed',
    title: params.title.trim(),
    body: params.body?.trim() || null,
    creatorId: params.user.uid,
    creatorUsername: params.user.username,
    completerId: params.user.uid,
    completerUsername: params.user.username,
    proofImageUrl: params.proofImageUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, 'users', params.user.uid), {
    coinBalance: increment(35),
    'stats.challengesCompleted': increment(1),
    updatedAt: serverTimestamp(),
  });
}

export async function createWagerChallenge(params: {
  user: UserProfile;
  title: string;
  body?: string;
  targetUsername?: string;
  stake: number;
  deadline: Date;
  visibility: BetVisibility;
  groupId?: string;
  groups?: FriendGroup[];
  invitedUsernames?: string[];
}) {
  if (params.stake < 10) throw new Error('Minimum challenge stake is 10 coins.');
  if (params.stake > params.user.coinBalance) throw new Error('Insufficient coins.');
  const normalizedTarget = params.targetUsername?.trim().toLowerCase() || null;
  if (normalizedTarget === params.user.username) throw new Error('You cannot do your own dare.');
  if (params.deadline.getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000) {
    throw new Error('Wager deadline must be at least one week away.');
  }
  const audience = challengeAudience(params);
  if (audience.visibility === 'private' && !audience.groupId && audience.invitedUsernames.length === 0) {
    throw new Error('Invite at least one user for a private wager.');
  }
  const bonus = Math.max(5, Math.round(params.stake * 0.2));
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', params.user.uid);
    const userSnap = await transaction.get(userRef);
    const current = userSnap.data() as UserProfile | undefined;
    if (!current || current.coinBalance < params.stake) throw new Error('Insufficient coins.');
    transaction.update(userRef, {
      coinBalance: increment(-params.stake),
      updatedAt: serverTimestamp(),
    });
    transaction.set(doc(collection(db, 'challenges')), {
      type: 'wager',
      status: 'open',
      visibility: audience.visibility,
      title: params.title.trim(),
      body: params.body?.trim() || null,
      creatorId: params.user.uid,
      creatorUsername: params.user.username,
      invitedUsernames: audience.invitedUsernames,
      groupId: audience.groupId,
      targetUsername: normalizedTarget,
      stake: params.stake,
      bonus,
      deadline: Timestamp.fromDate(params.deadline),
      proofImageUrl: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function completeWagerChallenge(challenge: ChallengeActivity, user: UserProfile, proofImageUrl: string) {
  if (challenge.status !== 'open') throw new Error('Challenge is not open.');
  if (challenge.creatorId === user.uid) throw new Error('You cannot complete your own dare.');
  if (challenge.targetUsername && challenge.targetUsername !== user.username) {
    throw new Error('This challenge is aimed at someone else.');
  }
  const reward = (challenge.stake ?? 0) + (challenge.bonus ?? 0);
  await runTransaction(db, async (transaction) => {
    transaction.update(doc(db, 'challenges', challenge.id), {
      status: 'completed',
      completerId: user.uid,
      completerUsername: user.username,
      proofImageUrl,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(doc(db, 'users', user.uid), {
      coinBalance: increment(reward),
      'stats.challengesCompleted': increment(1),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function failWagerChallenge(challenge: ChallengeActivity, user: UserProfile) {
  if (challenge.status !== 'open') throw new Error('Challenge is not open.');
  if (challenge.creatorId !== user.uid) throw new Error('Only the creator can fail this challenge.');
  if (!challenge.deadline || Date.now() < challenge.deadline.toMillis()) {
    throw new Error('Wait until the wager deadline passes.');
  }
  const refund = (challenge.stake ?? 0) + Math.max(5, Math.floor((challenge.stake ?? 0) * 0.5));
  await runTransaction(db, async (transaction) => {
    transaction.update(doc(db, 'challenges', challenge.id), {
      status: 'failed',
      creatorRefund: refund,
      failedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(doc(db, 'users', user.uid), {
      coinBalance: increment(refund),
      updatedAt: serverTimestamp(),
    });
  });
}
