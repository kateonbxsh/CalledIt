import {
  addDoc,
  collection,
  deleteDoc,
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
import { awardDailyBonus } from './bonusService';
import type {
  Bet,
  BetComment,
  BetOption,
  BetResolution,
  ChanceSnapshot,
  CreateBetInput,
  Prediction,
  PredictionInput,
  UpdateBetMetadataInput,
  UserProfile,
} from '../types';
import {
  calculatePredictionChangeFee,
  calculatePredictionRewards,
} from '../utils/coins';
import {
  calculateChanceSummary,
  calculateSmoothedChanceSummary,
  chanceForOption,
  dateGuessChance,
  displayChanceSummary,
  projectChanceSummaryOverTime,
} from '../utils/probability';
import { applyRatingDelta, calculateRatingDelta } from '../utils/rating';
import { rankForRating } from '../utils/ranks';
import { calculateSportsScoreBonus } from '../utils/sportsBonus';
import type { ScoreBonusResult } from '../utils/sportsBonus';
import {
  calculateClosestPayouts,
  resolveClosestDate,
  resolveClosestNumber,
} from '../utils/closestGuess';
import { isClosestType } from '../utils/betTypes';
import { buildStatsAfterResolution, getLeaderboard } from './userService';
import {
  ALL_ENABLED_TARGET_UID,
  createNotification,
  uidsForUsernames,
  usersWhoCanSeeBet,
  usersWhoPredictedBet,
} from './notificationService';

function optionId(label: string, existingIds: string[]) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'option';
  let candidate = base;
  let index = 2;
  while (existingIds.includes(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function normalizeOptionLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function winningOptionIds(resolution: BetResolution) {
  return (resolution.winningOptionIds?.length ? resolution.winningOptionIds : [resolution.winningOptionId])
    .filter((id): id is string => Boolean(id));
}

function allowsMultipleChoices(bet: Bet) {
  return (bet.type === 'multi' || bet.type === 'openChoice') &&
    (bet.allowMultipleChoices ?? bet.type === 'multi');
}

function predictionOptionIds(prediction: Prediction) {
  return prediction.optionIds?.length ? prediction.optionIds : [prediction.optionId];
}

function normalizeUsernames(usernames: string[]) {
  return [...new Set(usernames.map((name) => name.trim().toLowerCase()).filter(Boolean))];
}

function scoreConsistencyError(optionId: string, homeScore?: number, awayScore?: number) {
  if (homeScore === undefined || awayScore === undefined) return '';
  if (optionId === 'home' && homeScore < awayScore) return 'Home cannot win with a lower score.';
  if (optionId === 'away' && awayScore < homeScore) return 'Away cannot win with a lower score.';
  if (optionId === 'draw' && homeScore !== awayScore) return 'Draw needs equal scores.';
  return '';
}

export async function createBet(input: CreateBetInput, creator: UserProfile) {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, 'bets'), {
    type: input.type,
    title: input.title.trim(),
    category: input.category.trim(),
    description: input.description?.trim() || null,
    visibility: input.visibility,
    invitedUsernames: normalizeUsernames(input.invitedUsernames),
    maskedUsernames: normalizeUsernames(input.maskedUsernames ?? []),
    options: input.options,
    allowMultipleChoices: input.allowMultipleChoices ?? false,
    allowMultipleOutcomes: input.allowMultipleOutcomes ?? false,
    allowDraw: input.allowDraw ?? false,
    allowExactScore: input.allowExactScore ?? false,
    homeTeam: input.homeTeam?.trim() || null,
    awayTeam: input.awayTeam?.trim() || null,
    imageUrl: input.imageUrl || null,
    groupId: input.groupId ?? null,
    creatorId: creator.uid,
    creatorUsername: creator.username,
    // A guaranteed before/after event resolves at its target date, so the target
    // date doubles as the deadline; otherwise use the explicit deadline.
    deadline: input.type === 'date' && !input.eventMightNotHappen && input.targetDate
      ? Timestamp.fromDate(input.targetDate)
      : (input.deadline ? Timestamp.fromDate(input.deadline) : null),
    targetDate: input.targetDate ? Timestamp.fromDate(input.targetDate) : null,
    eventMightNotHappen: input.type === 'date' ? (input.eventMightNotHappen ?? false) : false,
    status: 'open',
    predictionCount: 0,
    totalCoinsStaked: 0,
    chanceSummary: calculateChanceSummary(input.options, []),
    resolution: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const targetUids = input.visibility === 'public'
    ? [ALL_ENABLED_TARGET_UID]
    : await (async () => {
      const masked = new Set(normalizeUsernames(input.maskedUsernames ?? []));
      const privateTargets = await uidsForUsernames(
        normalizeUsernames(input.invitedUsernames).filter((name) => !masked.has(name)),
      );

      if (input.groupId) {
        const groupSnap = await getDoc(doc(db, 'groups', input.groupId));
        if (groupSnap.exists()) {
          const groupData = groupSnap.data() as any;
          if (groupData.memberUids && Array.isArray(groupData.memberUids)) {
            privateTargets.push(...groupData.memberUids.filter((uid: string) => uid !== creator.uid));
          }
        }
      }

      return privateTargets;
    })();

  const uniqueTargetUids = [...new Set(targetUids)].filter(Boolean);

  await createNotification({
    type: 'bet_created',
    actor: creator,
    targetUids: uniqueTargetUids,
    title: `🎯 ${input.title.trim()} - New bet posted!`,
    body: `${creator.displayName || creator.username} created a new bet. Check it out and make your prediction!`,
    url: `/#/bets/${ref.id}`,
  });

  // Award daily bonus for creating a bet
  await awardDailyBonus(creator, 'bet');

  return ref.id;
}

export async function updateBetMetadata(betId: string, input: UpdateBetMetadataInput) {
  const betRef = doc(db, 'bets', betId);
  const betSnap = await getDoc(betRef);
  const current = betSnap.exists() ? ({ id: betSnap.id, ...betSnap.data() } as Bet) : null;
  const nextStatus =
    current?.status === 'resolved'
      ? undefined
      : input.deadline && input.deadline.getTime() <= Date.now()
        ? 'locked'
        : current?.status === 'locked'
          ? 'open'
          : undefined;

  await updateDoc(betRef, {
    title: input.title.trim(),
    category: input.category.trim(),
    description: input.description?.trim() || null,
    deadline: input.deadline ? Timestamp.fromDate(input.deadline) : null,
    imageUrl: input.imageUrl || null,
    ...(input.visibility ? { visibility: input.visibility } : {}),
    ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    ...(input.allowMultipleChoices !== undefined ? { allowMultipleChoices: input.allowMultipleChoices } : {}),
    ...(input.allowMultipleOutcomes !== undefined ? { allowMultipleOutcomes: input.allowMultipleOutcomes } : {}),
    ...(input.invitedUsernames ? { invitedUsernames: normalizeUsernames(input.invitedUsernames) } : {}),
    ...(input.maskedUsernames ? { maskedUsernames: normalizeUsernames(input.maskedUsernames) } : {}),
    ...(nextStatus ? { status: nextStatus } : {}),
    updatedAt: serverTimestamp(),
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
    const snap = await getDocs(query(betsRef, where('visibility', '==', 'public'), limit(80)));
    return sortedBetsFromSnapshot(snap);
  }

  if (user.isAdmin) {
    const snap = await getDocs(query(betsRef, where('visibility', '==', 'private'), limit(80)));
    return sortedBetsFromSnapshot(snap);
  }

  const [createdSnap, invitedSnap] = await Promise.all([
    getDocs(query(betsRef, where('visibility', '==', 'private'), where('creatorId', '==', user.uid), limit(80))),
    getDocs(query(betsRef, where('visibility', '==', 'private'), where('invitedUsernames', 'array-contains', user.username), limit(80))),
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
      try {
        const snap = await getDoc(doc(db, 'bets', id));
        return snap.exists() ? ([id, { id: snap.id, ...snap.data() } as Bet] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  return new Map(pairs.filter((pair): pair is readonly [string, Bet] => pair !== null));
}

export async function listChanceSnapshots(betId: string) {
  const snap = await getDocs(
    query(collection(db, 'chanceSnapshots'), where('betId', '==', betId), limit(80)),
  );
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }) as ChanceSnapshot)
    .sort((left, right) => left.createdAt.toMillis() - right.createdAt.toMillis());
}

export async function listCommentsForBet(betId: string) {
  const snap = await getDocs(query(collection(db, 'comments'), where('betId', '==', betId), limit(100)));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }) as BetComment)
    .sort((left, right) => left.createdAt.toMillis() - right.createdAt.toMillis());
}

export async function addBetComment(betId: string, user: UserProfile, body: string) {
  const text = body.trim();
  if (!text) throw new Error('Write a comment first.');
  if (text.length > 1000) throw new Error('Keep comments under 1000 characters.');

  await addDoc(collection(db, 'comments'), {
    betId,
    userId: user.uid,
    username: user.username,
    displayName: user.displayName,
    photoURL: user.photoURL ?? null,
    body: text,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const betSnap = await getDoc(doc(db, 'bets', betId));
  const bet = betSnap.exists() ? ({ id: betSnap.id, ...betSnap.data() } as Bet) : null;
  const predictionUserIds = await usersWhoPredictedBet(betId);
  const targetUids = [...new Set([...predictionUserIds, bet?.creatorId ?? ''])].filter(Boolean);

  await createNotification({
    type: 'bet_commented',
    actor: user,
    targetUids,
    title: `💬 ${bet?.title ?? 'A bet'} - New comment`,
    body: `${user.displayName || user.username} commented: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
    url: `/#/bets/${betId}`,
  });

  // Award daily bonus for commenting
  await awardDailyBonus(user, 'comment');
}

export async function deleteBetComment(commentId: string) {
  await deleteDoc(doc(db, 'comments', commentId));
}

export async function placePrediction(input: PredictionInput) {
  const predictionRef = doc(db, 'predictions', `${input.bet.id}_${input.user.uid}`);
  const betRef = doc(db, 'bets', input.bet.id);
  const userRef = doc(db, 'users', input.user.uid);
  const snapshotRef = doc(collection(db, 'chanceSnapshots'));
  const eventRef = doc(collection(db, 'predictionEvents'));
  const closest = isClosestType(input.bet.type);
  const openChoice = input.bet.type === 'openChoice';
  let notification:
    | { type: 'bet_joined' | 'prediction_updated'; targetUids: string[]; body: string }
    | null = null;

  await runTransaction(db, async (transaction) => {
    const [predictionSnap, betSnap, userSnap] = await Promise.all([
      transaction.get(predictionRef),
      transaction.get(betRef),
      transaction.get(userRef),
    ]);

    if (!betSnap.exists()) throw new Error('Bet not found.');
    if (!userSnap.exists()) throw new Error('Profile not found.');

    const bet = { id: betSnap.id, ...betSnap.data() } as Bet;
    const user = userSnap.data() as UserProfile;
    const existingPrediction = predictionSnap.exists()
      ? ({ id: predictionSnap.id, ...predictionSnap.data() } as Prediction)
      : null;
    if (bet.status !== 'open') throw new Error('This bet is not open.');
    if (bet.deadline && Timestamp.now().toMillis() >= bet.deadline.toMillis()) throw new Error('The deadline has passed.');
    if (input.stake < 10) throw new Error('Minimum stake is 10 coins.');

    const previousPredictions = await getDocs(
      query(collection(db, 'predictions'), where('betId', '==', bet.id)),
    );
    const existing = previousPredictions.docs.map((item) => ({ id: item.id, ...item.data() }) as Prediction);

    let nextOptions = bet.options;
    let effectiveOptionId = closest ? 'guess' : input.optionId;
    let effectiveOptionIds = closest
      ? ['guess']
      : (allowsMultipleChoices(bet) && input.optionIds?.length ? input.optionIds : [input.optionId]).filter(Boolean);
    const customOptionLabel = input.customOptionLabel?.trim();
    if (openChoice) {
      // New answers to create: an array (multi) or the single legacy label.
      const labels = (input.customOptionLabels?.length
        ? input.customOptionLabels
        : (customOptionLabel ? [customOptionLabel] : []))
        .map((label) => label.trim())
        .filter(Boolean);
      // Existing options the user selected (only meaningful with multi-choice).
      const selectedExistingIds = effectiveOptionIds.filter((id) => bet.options.some((option) => option.id === id));

      const usedIds = bet.options.map((option) => option.id);
      const newOptions: BetOption[] = [];
      const customIds: string[] = [];
      for (const label of labels) {
        const normalized = normalizeOptionLabel(label);
        const match = bet.options.find((option) => normalizeOptionLabel(option.label) === normalized)
          ?? newOptions.find((option) => normalizeOptionLabel(option.label) === normalized);
        if (match) {
          customIds.push(match.id);
        } else {
          const created = { id: optionId(label, usedIds), label, createdBy: user.uid };
          usedIds.push(created.id);
          newOptions.push(created);
          customIds.push(created.id);
        }
      }

      const combinedIds = [...new Set([...selectedExistingIds, ...customIds])];
      if (combinedIds.length === 0) throw new Error('Pick or add an answer.');
      // New typed answers take precedence for single-choice bets (legacy behaviour).
      effectiveOptionIds = allowsMultipleChoices(bet)
        ? combinedIds
        : [customIds[0] ?? selectedExistingIds[0]];
      effectiveOptionId = effectiveOptionIds[0];
      nextOptions = newOptions.length ? [...bet.options, ...newOptions] : bet.options;
    } else if (!closest) {
      const selectedExistingOptions = effectiveOptionIds
        .map((id) => bet.options.find((option) => option.id === id))
        .filter((option): option is NonNullable<typeof option> => Boolean(option));
      if (selectedExistingOptions.length) {
        effectiveOptionId = selectedExistingOptions[0].id;
        effectiveOptionIds = allowsMultipleChoices(bet)
          ? selectedExistingOptions.map((option) => option.id)
          : [selectedExistingOptions[0].id];
      } else {
        throw new Error('Pick an option.');
      }
    }
    if (bet.type === 'sports' && input.scorePrediction) {
      const scoreError = scoreConsistencyError(
        effectiveOptionId,
        input.scorePrediction.home,
        input.scorePrediction.away,
      );
      if (scoreError) throw new Error(scoreError);
    }
    const nowMsForChance = Date.now();
    const createdAtMs = bet.createdAt?.toMillis?.() ?? nowMsForChance;
    const deadlineMs = bet.deadline?.toMillis?.() ?? null;
    const targetDateMs = bet.targetDate?.toMillis?.() ?? null;
    const chanceForDateGuess = (guess?: string | null) =>
      guess
        ? dateGuessChance({
            guessMs: new Date(guess).getTime(),
            createdAtMs,
            deadlineMs,
            nowMs: nowMsForChance,
            guessCount: existing.length,
          })
        : 1 / (existing.length + 1);
    const chanceForOptionIds = (ids: string[]) => {
      const displayed = displayChanceSummary({
        options: nextOptions,
        summary: bet.chanceSummary,
        type: bet.type,
        createdAtMs,
        deadlineMs,
        targetDateMs,
        nowMs: nowMsForChance,
        status: bet.status,
      });
      return ids.reduce((sum, id) => sum + chanceForOption(displayed, id), 0)
        || 1 / Math.max(1, nextOptions.length);
    };

    const displayedChanceAtBetTime = closest
      ? chanceForDateGuess(bet.type === 'closestDate' ? input.dateGuess : null)
      : Math.min(0.95, chanceForOptionIds(effectiveOptionIds));

    // Current chance of the pick the user is leaving — drives the bailout fee.
    const currentChanceOfExistingPick = existingPrediction
      ? closest
        ? chanceForDateGuess(bet.type === 'closestDate' ? existingPrediction.dateGuess : null)
        : chanceForOptionIds(
            existingPrediction.optionIds?.length ? existingPrediction.optionIds : [existingPrediction.optionId],
          )
      : undefined;

    const now = Timestamp.now();
    const previousStake = existingPrediction?.stake ?? 0;
    const previousOptionId = existingPrediction?.optionId ?? null;
    const revisionCount = existingPrediction ? (existingPrediction.revisionCount ?? 0) + 1 : 0;
    const changeFee = existingPrediction
      ? calculatePredictionChangeFee({
          previousStake,
          nextStake: input.stake,
          revisionCount: existingPrediction.revisionCount ?? 0,
          betCreatedAtMs: bet.createdAt?.toMillis?.(),
          deadlineMs: bet.deadline?.toMillis?.() ?? null,
          nowMs: now.toMillis(),
          currentChanceOfExistingPick,
        })
      : 0;
    const balanceDelta = previousStake - input.stake - changeFee;
    if (user.coinBalance + previousStake < input.stake + changeFee) throw new Error('Insufficient coins.');

    const predictionPayload = {
      betId: bet.id,
      userId: user.uid,
      username: user.username,
      optionId: effectiveOptionId,
      optionIds: effectiveOptionIds,
      stake: input.stake,
      userBalanceAtBetTime: user.coinBalance,
      displayedChanceAtBetTime,
      userRating: user.rating,
      status: 'pending',
      originalOptionId: existingPrediction?.originalOptionId ?? effectiveOptionId,
      originalStake: existingPrediction?.originalStake ?? input.stake,
      originalChanceAtBetTime: existingPrediction?.originalChanceAtBetTime ?? displayedChanceAtBetTime,
      lastChangedAt: existingPrediction ? serverTimestamp() : null,
      revisionCount,
      changeFeesPaid: (existingPrediction?.changeFeesPaid ?? 0) + changeFee,
      lastChangeFee: changeFee,
      scorePrediction: input.scorePrediction ?? null,
      numericGuess: input.numericGuess ?? null,
      dateGuess: input.dateGuess ?? null,
      customOptionLabel: customOptionLabel ?? null,
      createdAt: existingPrediction?.createdAt ?? serverTimestamp(),
    };

    transaction.set(predictionRef, predictionPayload);

    transaction.update(userRef, {
      coinBalance: increment(balanceDelta),
      updatedAt: serverTimestamp(),
    });

    transaction.set(eventRef, {
      betId: bet.id,
      userId: user.uid,
      username: user.username,
      fromOptionId: previousOptionId,
      toOptionId: effectiveOptionId,
      fromStake: existingPrediction?.stake ?? null,
      toStake: input.stake,
      chanceBefore: existingPrediction?.displayedChanceAtBetTime ?? displayedChanceAtBetTime,
      chanceAfter: displayedChanceAtBetTime,
      fee: changeFee,
      createdAt: serverTimestamp(),
    });

    if (closest) {
      transaction.update(betRef, {
        predictionCount: existingPrediction ? bet.predictionCount : increment(1),
        totalCoinsStaked: increment(input.stake - previousStake),
        updatedAt: serverTimestamp(),
      });
    } else {
      const nextPredictions = [
        ...existing.filter((prediction) => prediction.id !== predictionRef.id),
        {
          id: predictionRef.id,
          betId: bet.id,
          userId: user.uid,
          username: user.username,
          optionId: effectiveOptionId,
          optionIds: effectiveOptionIds,
          stake: input.stake,
          userBalanceAtBetTime: user.coinBalance,
          displayedChanceAtBetTime,
          userRating: user.rating,
          status: 'pending',
          originalOptionId: existingPrediction?.originalOptionId ?? effectiveOptionId,
          originalStake: existingPrediction?.originalStake ?? input.stake,
          originalChanceAtBetTime: existingPrediction?.originalChanceAtBetTime ?? displayedChanceAtBetTime,
          lastChangedAt: existingPrediction ? Timestamp.now() : null,
          revisionCount,
          changeFeesPaid: (existingPrediction?.changeFeesPaid ?? 0) + changeFee,
          lastChangeFee: changeFee,
          createdAt: existingPrediction?.createdAt ?? Timestamp.now(),
        } as Prediction,
      ];
      const elapsedMs = Timestamp.now().toMillis() - bet.updatedAt.toMillis();
      const projectedPreviousSummary = projectChanceSummaryOverTime({
        options: nextOptions,
        summary: bet.chanceSummary,
        updatedAt: bet.updatedAt,
        status: bet.status,
      });
      const chanceSummary = calculateSmoothedChanceSummary({
        options: nextOptions,
        predictions: nextPredictions,
        previousSummary: projectedPreviousSummary,
        elapsedMs,
      });

      transaction.update(betRef, {
        ...(openChoice ? { options: nextOptions } : {}),
        predictionCount: existingPrediction ? bet.predictionCount : increment(1),
        totalCoinsStaked: increment(input.stake - previousStake),
        chanceSummary,
        updatedAt: serverTimestamp(),
      });

      transaction.set(snapshotRef, {
        betId: bet.id,
        summary: chanceSummary,
        createdAt: serverTimestamp(),
      });
    }

    const targetUids = [
      bet.creatorId,
      ...existing.map((prediction) => prediction.userId),
    ].filter((uid) => uid !== user.uid);
    const optionLabels = effectiveOptionIds
      .map((id) => nextOptions.find((option) => option.id === id)?.label)
      .filter(Boolean)
      .join(', ');
    notification = {
      type: existingPrediction ? 'prediction_updated' : 'bet_joined',
      targetUids,
      body: existingPrediction
        ? `${user.displayName || user.username} updated ${bet.title} with ${input.stake} coins${optionLabels ? ` on ${optionLabels}` : ''}.`
        : `${user.displayName || user.username} bet ${input.stake} coins on ${bet.title}${optionLabels ? ` (${optionLabels})` : ''}.`,
    };
  });

  const notificationPayload = notification as
    | { type: 'bet_joined' | 'prediction_updated'; targetUids: string[]; body: string }
    | null;
  if (notificationPayload) {
    await createNotification({
      type: notificationPayload.type,
      actor: input.user,
      targetUids: notificationPayload.targetUids,
      title: notificationPayload.type === 'bet_joined'
        ? `👥 ${input.bet.title} - Someone joined!`
        : `📊 ${input.bet.title} - Prediction updated`,
      body: notificationPayload.body,
      url: `/#/bets/${input.bet.id}`,
    });

    // Award daily bonus for making a new prediction
    if (notificationPayload.type === 'bet_joined') {
      await awardDailyBonus(input.user, 'prediction');
    }
  }
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
  const betRef = doc(db, 'bets', bet.id);
  const closest = isClosestType(bet.type);
  const predictionSnap = await getDocs(
    query(collection(db, 'predictions'), where('betId', '==', bet.id)),
  );
  const predictions = predictionSnap.docs.map((item) => ({ id: item.id, ...item.data() }) as Prediction);

  // Captured during the transaction (reset per attempt) to detect leaderboard moves afterwards.
  let ratingChanges: Array<{ uid: string; oldRating: number; newRating: number }> = [];

  await runTransaction(db, async (transaction) => {
    ratingChanges = [];
    const userRefs = [...new Set(predictions.map((prediction) => prediction.userId))]
      .map((userId) => doc(db, 'users', userId));
    const [betSnap, ...userSnaps] = await Promise.all([
      transaction.get(betRef),
      ...userRefs.map((userRef) => transaction.get(userRef)),
    ]);
    if (!betSnap.exists()) throw new Error('Bet not found.');
    const freshBet = { id: betSnap.id, ...betSnap.data() } as Bet;
    if (freshBet.status === 'resolved') throw new Error('Bet is already resolved.');

    const usersById = new Map(
      userSnaps
        .filter((snap) => snap.exists())
        .map((snap) => [snap.id, snap.data() as UserProfile]),
    );

    // --- Event did not happen: refund every prediction, no winners/losers. ---
    if (resolution.eventDidNotHappen) {
      for (const prediction of predictions) {
        if (!usersById.has(prediction.userId)) continue;
        transaction.update(doc(db, 'users', prediction.userId), {
          coinBalance: increment(prediction.stake),
          updatedAt: serverTimestamp(),
        });
        transaction.update(doc(db, 'predictions', prediction.id), {
          status: 'refunded',
          correct: false,
          coinDelta: prediction.stake,
          ratingDelta: 0,
          resolvedAt: serverTimestamp(),
        });
      }
      transaction.update(betRef, {
        status: 'resolved',
        resolution: { ...resolution, eventDidNotHappen: true },
        resolvedBy: resolverUid,
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // --- Determine winners and payouts ---
    let winnerPredictionIds: string[] = [];
    let coinPayouts: Array<{
      userId: string;
      predictionId: string;
      coinDelta: number;
      isWinner: boolean;
      stake: number;
      poolProfit?: number;
      mintedReward?: number;
      timingMultiplier?: number;
    }>;
    let scoreBonusResult: ScoreBonusResult = { bonusPool: 0, winners: [] };

    if (closest) {
      if (bet.type === 'closestNumber' && resolution.actualValue !== undefined) {
        winnerPredictionIds = resolveClosestNumber(predictions, resolution.actualValue).winnerPredictionIds;
      } else if (bet.type === 'closestDate' && resolution.actualDateValue) {
        winnerPredictionIds = resolveClosestDate(predictions, resolution.actualDateValue).winnerPredictionIds;
      }
      coinPayouts = calculateClosestPayouts(predictions, winnerPredictionIds);
    } else {
      const winnerIds = winningOptionIds(resolution);
      if (winnerIds.length === 0) throw new Error('Choose at least one winning option.');
      if (
        freshBet.type === 'sports' &&
        resolution.actualHomeScore !== undefined &&
        resolution.actualAwayScore !== undefined
      ) {
        const scoreError = scoreConsistencyError(
          winnerIds[0] ?? '',
          resolution.actualHomeScore,
          resolution.actualAwayScore,
        );
        if (scoreError) throw new Error(scoreError);
      }
      const primaryWinnerId = winnerIds[0] ?? '';
      const losingStakeTotal = predictions
        .filter((p) => !predictionOptionIds(p).some((id) => winnerIds.includes(id)))
        .reduce((sum, p) => sum + p.stake, 0);

      scoreBonusResult = freshBet.type === 'sports'
        ? calculateSportsScoreBonus({
            predictions,
            winningOptionId: primaryWinnerId,
            actualHomeScore: resolution.actualHomeScore,
            actualAwayScore: resolution.actualAwayScore,
            losingStakeTotal,
          })
        : { bonusPool: 0, winners: [] };

      coinPayouts = calculatePredictionRewards({
        predictions,
        winningOptionId: winnerIds,
        bonusPool: scoreBonusResult.bonusPool,
        betCreatedAtMs: freshBet.createdAt?.toMillis?.(),
        deadlineMs: freshBet.deadline?.toMillis?.() ?? null,
        resolvedAtMs: Timestamp.now().toMillis(),
      }).map((p) => ({
        userId: p.userId,
        predictionId: p.predictionId,
        coinDelta: p.coinDelta + (scoreBonusResult.winners.find((w) => w.predictionId === p.predictionId)?.coinBonus ?? 0),
        isWinner: p.isWinner,
        stake: p.stake,
        poolProfit: p.poolProfit,
        mintedReward: p.mintedReward,
        timingMultiplier: p.timingMultiplier,
      }));
    }

    const finalResolution: BetResolution = { ...resolution };
    if (closest) {
      finalResolution.winnerPredictionIds = winnerPredictionIds;
    } else {
      const winnerIds = winningOptionIds(resolution);
      finalResolution.winningOptionId = winnerIds[0] ?? resolution.winningOptionId;
      finalResolution.winningOptionIds = winnerIds;
    }

    // --- Apply results to each predictor ---
    for (const prediction of predictions) {
      const userRef = doc(db, 'users', prediction.userId);
      const user = usersById.get(prediction.userId);
      if (!user) continue;

      const correct = closest
        ? winnerPredictionIds.includes(prediction.id)
        : predictionOptionIds(prediction).some((id) => winningOptionIds(finalResolution).includes(id));

      const scoreBonus = scoreBonusResult.winners.find((w) => w.predictionId === prediction.id);
      const payout = coinPayouts.find((p) => p.predictionId === prediction.id);
      const pendingBonuses = user.pendingSpicyForecasts ?? [];
      const totalSpicyBonus = correct ? pendingBonuses.reduce((sum, b) => sum + b.bonus, 0) : 0;
      const ratingDelta = calculateRatingDelta({
        displayedChanceAtBetTime: prediction.displayedChanceAtBetTime,
        correct,
        stake: prediction.stake,
        userCoinBalanceAtBetTime: prediction.userBalanceAtBetTime,
        currentRating: user.rating,
        timingMultiplier: payout?.timingMultiplier,
        revisionCount: prediction.revisionCount ?? 0,
      }) + (scoreBonus?.ratingBonus ?? 0);

      const nextRating = applyRatingDelta(user.rating, ratingDelta);
      ratingChanges.push({ uid: prediction.userId, oldRating: user.rating, newRating: nextRating });
      const coinDelta = (payout?.coinDelta ?? 0) + totalSpicyBonus;
      const netCoinDelta = correct ? coinDelta - prediction.stake : -prediction.stake;

      transaction.update(userRef, {
        coinBalance: increment(coinDelta),
        rating: nextRating,
        rank: rankForRating(nextRating),
        ...(pendingBonuses.length > 0 ? { pendingSpicyForecasts: [] } : {}),
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
        poolCoinProfit: payout?.poolProfit ?? 0,
        mintedCoinReward: payout?.mintedReward ?? 0,
        timingMultiplier: payout?.timingMultiplier ?? 1,
        spicyForecastBonus: totalSpicyBonus,
        resolvedAt: serverTimestamp(),
        winningOptionId: closest
          ? (resolution.actualValue?.toString() ?? resolution.actualDateValue ?? '')
          : (winningOptionIds(finalResolution)[0] ?? ''),
      });
    }

    transaction.update(betRef, {
      status: 'resolved',
      resolution: finalResolution,
      resolvedBy: resolverUid,
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const resolverSnap = await getDoc(doc(db, 'users', resolverUid));
  const resolver = resolverSnap.exists() ? (resolverSnap.data() as UserProfile) : null;
  if (resolver) {
    // Resolution is a user action, so the client is the single source for this
    // notification (the worker does not also scan for resolved bets).
    await createNotification({
      type: 'bet_resolved',
      actor: resolver,
      targetUids: await usersWhoCanSeeBet(bet.id),
      title: `🎯 "${bet.title}" just got resolved!`,
      body: 'Check the results and see if you won.',
      url: `/#/bets/${bet.id}`,
    });
    await notifyLeaderboardMoves(resolver, ratingChanges).catch(() => {});
  }
}

// After a resolve changes ratings, tell anyone whose leaderboard (top 50) rank
// shifted up or down. Old ranks are recomputed by swapping changed users back to
// their pre-resolution ratings within the freshly-fetched board.
async function notifyLeaderboardMoves(
  actor: UserProfile,
  changes: Array<{ uid: string; oldRating: number; newRating: number }>,
) {
  if (changes.length === 0) return;
  const changeByUid = new Map(changes.map((change) => [change.uid, change]));
  const board = await getLeaderboard();
  if (board.length === 0) return;

  const newRank = new Map(
    [...board].sort((a, b) => b.rating - a.rating).map((user, index) => [user.uid, index + 1]),
  );
  const oldRank = new Map(
    board
      .map((user) => ({ uid: user.uid, rating: changeByUid.get(user.uid)?.oldRating ?? user.rating }))
      .sort((a, b) => b.rating - a.rating)
      .map((user, index) => [user.uid, index + 1]),
  );

  await Promise.all(changes.map(async (change) => {
    const nr = newRank.get(change.uid);
    const or = oldRank.get(change.uid);
    if (!nr || !or || nr === or) return;
    const movedUp = nr < or;
    await createNotification({
      type: 'leaderboard_moved',
      actor,
      targetUids: [change.uid],
      includeActor: true,
      title: movedUp ? '📈 You climbed the leaderboard!' : '📉 You slipped on the leaderboard',
      body: movedUp ? `You moved up to #${nr}.` : `You dropped to #${nr}.`,
      url: '/#/leaderboard',
    });
  }));
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

export async function deleteBet(bet: Bet) {
  if (bet.status === 'open' && bet.predictionCount > 0) {
    throw new Error('Cannot delete an open bet that already has predictions. Resolve it first.');
  }
  await deleteDoc(doc(db, 'bets', bet.id));
}
