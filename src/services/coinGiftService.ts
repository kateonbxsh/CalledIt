import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { CoinGift, UserProfile } from '../types';
import { createNotification } from './notificationService';
import { invalidateQueryCache, readThroughCache } from './queryCache';
import { setBalanceInTransaction } from './balanceService';

export async function listIncomingCoinGifts(userId: string, pageSize = 12): Promise<CoinGift[]> {
  return readThroughCache(`gifts:list:${userId}:${pageSize}`, 15_000, async () => {
    const snap = await getDocs(query(
      collection(db, 'users', userId, 'incomingGifts'),
      where('status', '==', 'pending'),
      limit(Math.max(pageSize, 24)),
    ));
    return snap.docs
      .map((item) => ({ id: item.id, ...item.data() }) as CoinGift)
      .sort((left, right) => (right.createdAt?.toMillis?.() ?? 0) - (left.createdAt?.toMillis?.() ?? 0))
      .slice(0, pageSize);
  });
}

export async function hasPendingCoinGifts(userId: string) {
  return readThroughCache(`gifts:hasPending:${userId}`, 10_000, async () => {
    const snap = await getDocs(query(
      collection(db, 'users', userId, 'incomingGifts'),
      where('status', '==', 'pending'),
      limit(1),
    ));
    return !snap.empty;
  });
}

export async function sendCoinGift(params: {
  sender: UserProfile;
  recipient: UserProfile;
  amount: number;
  note?: string;
}) {
  const amount = Math.max(0, Math.round(params.amount));
  const note = params.note?.trim() || null;
  if (amount <= 0) throw new Error('Send at least 1 coin.');
  if (params.sender.uid === params.recipient.uid) throw new Error('You cannot send coins to yourself.');
  if (note && note.length > 200) throw new Error('Keep the note under 200 characters.');

  const senderRef = doc(db, 'users', params.sender.uid);
  const giftRef = doc(collection(db, 'users', params.recipient.uid, 'incomingGifts'));

  await runTransaction(db, async (transaction) => {
    const senderSnap = await transaction.get(senderRef);
    const currentSender = senderSnap.data() as UserProfile | undefined;
    if (!currentSender) throw new Error('Sender profile not found.');
    if (currentSender.coinBalance < amount) throw new Error('Not enough coins.');

    setBalanceInTransaction(
      transaction,
      senderRef,
      currentSender,
      currentSender.coinBalance - amount,
      `Gift sent to ${params.recipient.displayName || params.recipient.username}`,
    );
    transaction.set(giftRef, {
      senderUid: params.sender.uid,
      senderUsername: params.sender.username,
      senderDisplayName: params.sender.displayName,
      recipientUid: params.recipient.uid,
      recipientUsername: params.recipient.username,
      amount,
      note,
      status: 'pending',
      createdAt: serverTimestamp(),
      claimedAt: null,
    });
  });

  await createNotification({
    type: 'coins_received',
    actor: params.sender,
    targetUids: [params.recipient.uid],
    title: `${params.sender.displayName || params.sender.username} sent you coins`,
    body: `${amount.toLocaleString('en-US')} coins are waiting for you.`,
    url: '/#/gifts',
  });
  invalidateQueryCache(`gifts:list:${params.recipient.uid}:`);
  invalidateQueryCache(`gifts:hasPending:${params.recipient.uid}`);
}

export async function claimCoinGift(user: UserProfile, gift: CoinGift) {
  if (gift.recipientUid !== user.uid) throw new Error('This gift is not for you.');
  if (gift.status !== 'pending') throw new Error('This gift was already claimed.');

  const userRef = doc(db, 'users', user.uid);
  const giftRef = doc(db, 'users', user.uid, 'incomingGifts', gift.id);

  await runTransaction(db, async (transaction) => {
    const [userSnap, giftSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(giftRef),
    ]);
    const currentUser = userSnap.data() as UserProfile | undefined;
    const currentGift = giftSnap.data() as CoinGift | undefined;
    if (!currentUser || !currentGift) throw new Error('Gift not found.');
    if (currentGift.status !== 'pending') throw new Error('This gift was already claimed.');

    setBalanceInTransaction(
      transaction,
      userRef,
      currentUser,
      currentUser.coinBalance + currentGift.amount,
      `Gift from ${currentGift.senderDisplayName || currentGift.senderUsername}`,
    );
    transaction.update(giftRef, {
      status: 'claimed',
      claimedAt: serverTimestamp(),
    });
  });
  invalidateQueryCache(`gifts:list:${user.uid}:`);
  invalidateQueryCache(`gifts:hasPending:${user.uid}`);
}
