import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  type DocumentReference,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { BalanceSnapshot, UserProfile } from '../types';

export function setBalanceInTransaction(
  transaction: Transaction,
  userRef: DocumentReference,
  user: UserProfile,
  nextBalanceValue: number,
  reason: string,
  extraUpdates: Record<string, unknown> = {},
  recordHistory = true,
) {
  const nextBalance = Math.max(0, Math.round(nextBalanceValue));
  const previousMaximum = user.stats.maxBalance ?? user.coinBalance;
  const suppliedStats = (extraUpdates.stats ?? {}) as Partial<UserProfile['stats']>;
  const nextStats = {
    ...user.stats,
    ...suppliedStats,
    maxBalance: Math.max(previousMaximum, nextBalance),
  };

  transaction.update(userRef, {
    ...extraUpdates,
    coinBalance: nextBalance,
    stats: nextStats,
    updatedAt: serverTimestamp(),
  });

  if (recordHistory && nextBalance !== user.coinBalance) {
    transaction.set(doc(collection(userRef, 'balanceHistory')), {
      userId: user.uid,
      balance: nextBalance,
      delta: nextBalance - user.coinBalance,
      reason,
      createdAt: serverTimestamp(),
    });
  }
}

export async function listBalanceHistory(userId: string, pageSize = 180): Promise<BalanceSnapshot[]> {
  const snap = await getDocs(query(
    collection(db, 'users', userId, 'balanceHistory'),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }) as BalanceSnapshot)
    .reverse();
}
