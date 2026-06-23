import {
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
  updateDoc,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, envAdminUids } from '../lib/firebase';
import type { UserProfile, UserStats } from '../types';
import { canClaimDailyRefill } from '../utils/coins';
import { rankForRating } from '../utils/ranks';
import { invalidateQueryCache, readThroughCache } from './queryCache';
import { setBalanceInTransaction } from './balanceService';

const userCache = new Map<string, UserProfile>();
const usernameCache = new Map<string, UserProfile>();

export const emptyStats: UserStats = {
  totalBets: 0,
  wins: 0,
  losses: 0,
  accuracy: 0,
  bestUpsetWin: 0,
  coinsWon: 0,
  coinsLost: 0,
  chestsOpened: 0,
  challengesCompleted: 0,
  maxBalance: 1000,
  eloWon: 0,
  bestMinigameMult: 0,
  arcade: {},
};

export async function createProfile(params: {
  authUser: User;
  username: string;
  displayName: string;
}) {
  const username = params.username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new Error('Username must be 3-20 characters using letters, numbers, or underscores.');
  }
  const usernameRef = doc(db, 'usernames', username);
  const userRef = doc(db, 'users', params.authUser.uid);

  await runTransaction(db, async (transaction) => {
    const usernameDoc = await transaction.get(usernameRef);
    if (usernameDoc.exists()) {
      throw new Error('That username is already taken.');
    }

    transaction.set(usernameRef, {
      uid: params.authUser.uid,
      createdAt: serverTimestamp(),
    });

    transaction.set(userRef, {
      uid: params.authUser.uid,
      email: params.authUser.email ?? '',
      username,
      displayName: params.displayName.trim() || username,
      bio: '',
      photoURL: '',
      coinBalance: 1000,
      rating: 1000,
      rank: rankForRating(1000),
      stats: emptyStats,
      isAdmin: envAdminUids.has(params.authUser.uid),
      lastRefillAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(doc(collection(userRef, 'balanceHistory')), {
      userId: params.authUser.uid,
      balance: 1000,
      delta: 1000,
      reason: 'Account created',
      createdAt: serverTimestamp(),
    });
  });
}

export async function updateProfile(
  uid: string,
  data: Pick<UserProfile, 'displayName'> & Partial<Pick<UserProfile, 'bio' | 'photoURL'>>,
) {
  await updateDoc(doc(db, 'users', uid), {
    displayName: data.displayName,
    bio: data.bio ?? '',
    photoURL: data.photoURL ?? '',
    updatedAt: serverTimestamp(),
  });
  userCache.delete(uid);
  invalidateQueryCache('users:');
}

export async function updateUsername(user: UserProfile, nextUsername: string) {
  const username = nextUsername.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new Error('Username must be 3-20 characters using letters, numbers, or underscores.');
  }
  if (username === user.username) return;

  const userRef = doc(db, 'users', user.uid);
  const oldUsernameRef = doc(db, 'usernames', user.username);
  const newUsernameRef = doc(db, 'usernames', username);

  await runTransaction(db, async (transaction) => {
    const newUsernameDoc = await transaction.get(newUsernameRef);
    if (newUsernameDoc.exists()) {
      throw new Error('That username is already taken.');
    }

    transaction.set(newUsernameRef, {
      uid: user.uid,
      createdAt: serverTimestamp(),
    });
    transaction.delete(oldUsernameRef);
    transaction.update(userRef, {
      username,
      updatedAt: serverTimestamp(),
    });
  });
  userCache.delete(user.uid);
  usernameCache.delete(user.username);
  invalidateQueryCache('users:');
}

export async function claimDailyRefill(user: UserProfile) {
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', user.uid);
    const snap = await transaction.get(userRef);
    const current = snap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');

    const lastRefill = current.lastRefillAt?.toDate() ?? null;
    if (!canClaimDailyRefill(current.coinBalance, lastRefill)) {
      throw new Error('Refill is not available yet.');
    }

    setBalanceInTransaction(transaction, userRef, current, 100, 'Balance refill', {
      lastRefillAt: serverTimestamp(),
    });
  });
}

async function fetchLeaderboard() {
  const snap = await getDocs(
    query(collection(db, 'users'), orderBy('rating', 'desc'), limit(50)),
  );
  return snap.docs.map((item) => item.data() as UserProfile);
}

export async function getLeaderboard() {
  return readThroughCache('users:leaderboard', 20_000, fetchLeaderboard);
}

export async function getFreshLeaderboard() {
  return fetchLeaderboard();
}

export async function findUsersByUsernamePrefix(prefix: string) {
  const normalized = prefix.trim().toLowerCase();
  if (!normalized) return [];
  return readThroughCache(`users:prefix:${normalized}`, 30_000, async () => {
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('username', '>=', normalized),
        where('username', '<=', `${normalized}\uf8ff`),
        limit(8),
      ),
    );
    return snap.docs.map((item) => item.data() as UserProfile);
  });
}

export async function getUserByUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return null;
  if (usernameCache.has(normalized)) return usernameCache.get(normalized) ?? null;
  const usernameSnap = await getDoc(doc(db, 'usernames', normalized));
  if (!usernameSnap.exists()) return null;
  const userSnap = await getDoc(doc(db, 'users', (usernameSnap.data() as { uid: string }).uid));
  if (!userSnap.exists()) return null;
  const user = userSnap.data() as UserProfile;
  userCache.set(user.uid, user);
  usernameCache.set(normalized, user);
  return user;
}

export async function getUsersByIds(ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const missingIds = uniqueIds.filter((uid) => !userCache.has(uid));
  const snaps = await Promise.all(missingIds.map((uid) => getDoc(doc(db, 'users', uid))));
  for (const snap of snaps) {
    if (!snap.exists()) continue;
    const user = snap.data() as UserProfile;
    userCache.set(user.uid, user);
  }
  return new Map(
    uniqueIds
      .map((uid) => userCache.get(uid))
      .filter((user): user is UserProfile => Boolean(user))
      .map((user) => [user.uid, user] as const),
  );
}

export function buildStatsAfterResolution(params: {
  stats: UserStats;
  correct: boolean;
  coinsDelta: number;
  chosenChance: number;
  ratingDelta?: number;
}) {
  const wins = params.stats.wins + (params.correct ? 1 : 0);
  const losses = params.stats.losses + (params.correct ? 0 : 1);
  const totalBets = params.stats.totalBets + 1;
  return {
    ...params.stats,
    totalBets,
    wins,
    losses,
    accuracy: Math.round((wins / totalBets) * 100),
    bestUpsetWin: params.correct
      ? Math.max(params.stats.bestUpsetWin, Math.round((1 - params.chosenChance) * 100))
      : params.stats.bestUpsetWin,
    coinsWon: params.stats.coinsWon + Math.max(0, params.coinsDelta),
    coinsLost: params.stats.coinsLost + Math.max(0, -params.coinsDelta),
    // Lifetime ELO won only ever grows (losses never subtract).
    eloWon: (params.stats.eloWon ?? 0) + Math.max(0, Math.round(params.ratingDelta ?? 0)),
  };
}

export function predictionStakeIncrement(stake: number) {
  return increment(-stake);
}
