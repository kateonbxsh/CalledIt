import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { DocumentData, QuerySnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  Bet,
  BetResolution,
  ChanceSnapshot,
  CreateBetInput,
  Prediction,
  PredictionInput,
  UserProfile,
} from '../types';
import { calculateCoinPayouts } from '../utils/coins';
import {
  calculateChanceSummary,
  calculateSmoothedChanceSummary,
  chanceForOption,
} from '../utils/probability';
import { applyRatingDelta, calculateRatingDelta } from '../utils/rating';
import { rankForRating } from '../utils/ranks';
import { calculateSportsScoreBonus } from '../utils/sportsBonus';
import { buildStatsAfterResolution } from './userService';

export async function createBet(input: CreateBetInput, creator: UserProfile) {
  const now = serverTimestamp();
  await addDoc(collection(db, 'bets'), {
    ...input,
    creatorId: creator.uid,
    creatorUsername: creator.username,
    invitedUsernames: input.invitedUsernames.map((name) => name.trim().toLowerCase()).filter(Boolean),
    deadline: input.deadline ? Timestamp.fromDate(input.deadline) : null,
    status: 'open',
    predictionCount: 0,
    totalCoinsStaked: 0,
    chanceSummary: calculateChanceSummary(input.options, []),
    resolution: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

function byCreatedDesc(left: Bet, right: Bet) {
  return right.createdAt.toMillis() - left.createdAt.toMillis();
}

function uniqueBets(bets: Bet[]) {
  return [...new Map(bets.map((bet) => [bet.id, bet])).values()].sort(byCreatedDesc);
}

function sortedBetsFromSnapshot(snap: QuerySnapshot<DocumentData>) {
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as Bet).sort(byCreatedDesc);
}

export async function listFeedBets(scope: 'public' | 'private', user: UserProfile) {
  const betsRef = collection(db, 'bets');

  if (scope === 'public') {
    const snap = await getDocs(
      query(
        betsRef,
        where('visibility', '==', 'public'),
        limit(80),
      ),
    );
    return sortedBetsFromSnapshot(snap);
  }

  if (user.isAdmin) {
    const snap = await getDocs(
      query(
        betsRef,
        where('visibility', '==', 'private'),
        limit(80),
      ),
    );
    return sortedBetsFromSnapshot(snap);
  }

  const [createdSnap, invitedSnap] = await Promise.all([
    getDocs(
      query(
        betsRef,
        where('visibility', '==', 'private'),
        where('creatorId', '==', user.uid),
        limit(80),
      ),
    ),
    getDocs(
      query(
        betsRef,
        where('visibility', '==', 'private'),
        where('invitedUsernames', 'array-contains', user.username),
        limit(80),
      ),
    ),
  ]);

  return uniqueBets([
    ...createdSnap.docs.map((item) => ({ id: item.id, ...item.data() }) as Bet),
    ...invitedSnap.docs.map((item) => ({ id: item.id, ...item.data() }) as Bet),
  ]).slice(0, 80);
}

export async function listMyBets(uid: string) {
  const snap = await getDocs(
    query(collection(db, 'bets'), where('creatorId', '==', uid), limit(80)),
  );
  return sortedBetsFromSnapshot(snap);
}

export async function listPredictionsForBet(betId: string) {
  const snap = await getDocs(query(collection(db, 'predictions'), where('betId', '==', betId)));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as Prediction);
}

export async function listMyPredictions(uid: string) {
  const snap = await getDocs(query(collection(db, 'predictions'), where('userId', '==', uid)));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as Prediction);
}

export async function getBetsByIds(ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const pairs = await Promise.all(
    uniqueIds.map(async (id) => {
      const snap = await getDoc(doc(db, 'bets', id));
      return snap.exists() ? ([id, { id: snap.id, ...snap.data() } as Bet] as const) : null;
    }),
  );

  return new Map(pairs.filter((pair): pair is readonly [string, Bet] => pair !== null));
}

export async function listChanceSnapshots(betId: string) {
  const snap = await getDocs(
    query(
      collection(db, 'chanceSnapshots'),
      where('betId', '==', betId),
      limit(80),
    ),
  );
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }) as ChanceSnapshot)
    .sort((left, right) => left.createdAt.toMillis() - right.createdAt.toMillis());
}

export async function placePrediction(input: PredictionInput) {
  const predictionRef = doc(db, 'predictions', `${input.bet.id}_${input.user.uid}`);
  const betRef = doc(db, 'bets', input.bet.id);
  const userRef = doc(db, 'users', input.user.uid);
  const snapshotRef = doc(collection(db, 'chanceSnapshots'));

  await runTransaction(db, async (transaction) => {
    const [predictionSnap, betSnap, userSnap] = await Promise.all([
      transaction.get(predictionRef),
      transaction.get(betRef),
      transaction.get(userRef),
    ]);

    if (predictionSnap.exists()) throw new Error('You already predicted on this bet.');
    if (!betSnap.exists()) throw new Error('Bet not found.');
    if (!userSnap.exists()) throw new Error('Profile not found.');

    const bet = { id: betSnap.id, ...betSnap.data() } as Bet;
    const user = userSnap.data() as UserProfile;
    if (bet.status !== 'open') throw new Error('This bet is not open.');
    if (bet.deadline && Timestamp.now().toMillis() >= bet.deadline.toMillis()) throw new Error('The deadline has passed.');
    if (input.stake < 10) throw new Error('Minimum stake is 10 coins.');
    if (input.stake > user.coinBalance) throw new Error('Insufficient coins.');

    const previousPredictions = await getDocs(
      query(collection(db, 'predictions'), where('betId', '==', bet.id)),
    );
    const existing = previousPredictions.docs.map(
      (item) => ({ id: item.id, ...item.data() }) as Prediction,
    );
    const displayedChanceAtBetTime = chanceForOption(bet.chanceSummary, input.optionId);
    const nextPredictions = [
      ...existing,
      {
        id: predictionRef.id,
        betId: bet.id,
        userId: user.uid,
        username: user.username,
        optionId: input.optionId,
        stake: input.stake,
        userBalanceAtBetTime: user.coinBalance,
        displayedChanceAtBetTime,
        status: 'pending',
        scorePrediction: input.scorePrediction,
        createdAt: Timestamp.now(),
      } as Prediction,
    ];
    const elapsedMs = Timestamp.now().toMillis() - bet.updatedAt.toMillis();
    const chanceSummary = calculateSmoothedChanceSummary({
      options: bet.options,
      predictions: nextPredictions,
      previousSummary: bet.chanceSummary,
      elapsedMs,
    });

    transaction.set(predictionRef, {
      betId: bet.id,
      userId: user.uid,
      username: user.username,
      optionId: input.optionId,
      stake: input.stake,
      userBalanceAtBetTime: user.coinBalance,
      displayedChanceAtBetTime,
      status: 'pending',
      scorePrediction: input.scorePrediction ?? null,
      createdAt: serverTimestamp(),
    });

    transaction.update(userRef, {
      coinBalance: increment(-input.stake),
      updatedAt: serverTimestamp(),
    });

    transaction.update(betRef, {
      predictionCount: increment(1),
      totalCoinsStaked: increment(input.stake),
      chanceSummary,
      updatedAt: serverTimestamp(),
    });

    transaction.set(snapshotRef, {
      betId: bet.id,
      summary: chanceSummary,
      createdAt: serverTimestamp(),
    });
  });
}

export async function lockExpiredBet(bet: Bet) {
  if (bet.status !== 'open') return;
  if (!bet.deadline || Date.now() < bet.deadline.toMillis()) return;
  await updateDoc(doc(db, 'bets', bet.id), {
    status: 'locked',
    updatedAt: serverTimestamp(),
  });
}

export async function resolveBet(bet: Bet, resolution: BetResolution, resolverUid: string) {
  // Check permissions first
  const resolverRef = doc(db, 'users', resolverUid);
  const resolverSnap = await getDoc(resolverRef);
  if (!resolverSnap.exists()) throw new Error('Resolver profile not found.');
  const resolver = resolverSnap.data() as UserProfile;
  
  // Only the bet creator or admins can resolve
  if (resolver.uid !== bet.creatorId && !resolver.isAdmin) {
    throw new Error('Only the bet creator can resolve this bet.');
  }

  const betRef = doc(db, 'bets', bet.id);

  await runTransaction(db, async (transaction) => {
    const betSnap = await transaction.get(betRef);
    if (!betSnap.exists()) throw new Error('Bet not found.');
    const freshBet = { id: betSnap.id, ...betSnap.data() } as Bet;
    if (freshBet.status === 'resolved') throw new Error('Bet is already resolved.');

    const predictionSnap = await getDocs(
      query(collection(db, 'predictions'), where('betId', '==', bet.id)),
    );
    const predictions = predictionSnap.docs.map(
      (item) => ({ id: item.id, ...item.data() }) as Prediction,
    );
    const losingStakeTotal = predictions
      .filter((prediction) => prediction.optionId !== resolution.winningOptionId)
      .reduce((sum, prediction) => sum + prediction.stake, 0);
    const sportsBonus =
      freshBet.type === 'sports'
        ? calculateSportsScoreBonus({
            predictions,
            winningOptionId: resolution.winningOptionId,
            actualHomeScore: resolution.actualHomeScore,
            actualAwayScore: resolution.actualAwayScore,
            losingStakeTotal,
          })
        : { bonusPool: 0, winners: [] };
    const payouts = calculateCoinPayouts(
      predictions,
      resolution.winningOptionId,
      sportsBonus.bonusPool,
    );

    for (const prediction of predictions) {
      const userRef = doc(db, 'users', prediction.userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) continue;
      const user = userSnap.data() as UserProfile;
      const payout = payouts.find((item) => item.predictionId === prediction.id);
      const scoreBonus = sportsBonus.winners.find((item) => item.predictionId === prediction.id);
      const correct = prediction.optionId === resolution.winningOptionId;
      const ratingDelta =
        calculateRatingDelta({
          displayedChanceAtBetTime: prediction.displayedChanceAtBetTime,
          correct,
          stake: prediction.stake,
          userCoinBalanceAtBetTime: prediction.userBalanceAtBetTime,
          currentRating: user.rating,
        }) + (scoreBonus?.ratingBonus ?? 0);
      const nextRating = applyRatingDelta(user.rating, ratingDelta);
      const coinDelta = (payout?.coinDelta ?? 0) + (scoreBonus?.coinBonus ?? 0);
      const netCoinDelta = correct ? coinDelta - prediction.stake : -prediction.stake;

      transaction.update(userRef, {
        coinBalance: increment(coinDelta),
        rating: nextRating,
        rank: rankForRating(nextRating),
        stats: buildStatsAfterResolution({
          stats: user.stats,
          correct,
          coinsDelta: netCoinDelta,
          chosenChance: prediction.displayedChanceAtBetTime,
        }),
        updatedAt: serverTimestamp(),
      });

      transaction.update(doc(db, 'predictions', prediction.id), {
        status: correct ? 'won' : 'lost',
        correct,
        coinDelta: netCoinDelta,
        ratingDelta,
        resolvedAt: serverTimestamp(),
        winningOptionId: resolution.winningOptionId,
      });
    }

    transaction.update(betRef, {
      status: 'resolved',
      resolution,
      resolvedBy: resolverUid,
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function reopenBet(bet: Bet) {
  await updateDoc(doc(db, 'bets', bet.id), {
    status: 'locked',
    resolution: null,
    resolvedAt: null,
    resolvedBy: null,
    updatedAt: serverTimestamp(),
  });
}
