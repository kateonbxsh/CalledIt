import type { Prediction } from '../types';

export interface CoinPayout {
  userId: string;
  predictionId: string;
  stake: number;
  isWinner: boolean;
  coinDelta: number;
  returnedCoins: number;
  poolProfit: number;
  mintedReward: number;
  timingMultiplier: number;
}

export interface PredictionRewardInput {
  predictions: Prediction[];
  winningOptionId: string | string[];
  bonusPool?: number;
  betCreatedAtMs?: number;
  deadlineMs?: number | null;
  resolvedAtMs?: number;
}

export function maxStakeForBalance(balance: number, configuredMax = 250) {
  return Math.max(0, Math.min(balance, Math.max(configuredMax, Math.floor(balance * 0.25))));
}

export function canClaimDailyRefill(balance: number, lastRefillAt?: Date | null) {
  if (balance >= 50) return false;
  if (!lastRefillAt) return true;
  const oneDay = 24 * 60 * 60 * 1000;
  return Date.now() - lastRefillAt.getTime() >= oneDay;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function timestampMs(value: Prediction['createdAt'] | Prediction['lastChangedAt'] | undefined | null) {
  return value?.toMillis?.() ?? Date.now();
}

function predictionOptionIds(prediction: Prediction) {
  return prediction.optionIds?.length ? prediction.optionIds : [prediction.optionId];
}

export function canClaimDailyReward(lastClaimAt?: Date | null) {
  if (!lastClaimAt) return true;
  const oneDay = 24 * 60 * 60 * 1000;
  return Date.now() - lastClaimAt.getTime() >= oneDay;
}

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

export function calculatePredictionChangeFee(params: {
  previousStake: number;
  nextStake: number;
  revisionCount: number;
  betCreatedAtMs?: number;
  deadlineMs?: number | null;
  nowMs?: number;
  // Current displayed chance of the prediction the user is leaving.
  currentChanceOfExistingPick?: number;
}) {
  const nowMs = params.nowMs ?? Date.now();
  const hasDeadlineWindow = Boolean(
    params.deadlineMs
    && params.betCreatedAtMs
    && params.deadlineMs > params.betCreatedAtMs,
  );
  const latePressure = hasDeadlineWindow
    ? clamp(
        (nowMs - (params.betCreatedAtMs as number))
          / ((params.deadlineMs as number) - (params.betCreatedAtMs as number)),
        0,
        1,
      )
    : 0;
  const oldChance = clamp(params.currentChanceOfExistingPick ?? 0.5, 0, 1);

  // Early edits cost the old stake weighted by how unlikely that pick currently
  // is. As the deadline approaches, every edit converges to the full old stake.
  const deadlineCurve = Math.pow(latePressure, 1.5);
  const feeShare = (1 - oldChance) + oldChance * deadlineCurve;
  return Math.min(
    Math.max(0, Math.round(params.previousStake)),
    Math.max(1, Math.round(params.previousStake * feeShare)),
  );
}

export function calculateTimingMultiplier(params: {
  predictionTimeMs: number;
  betCreatedAtMs?: number;
  deadlineMs?: number | null;
  resolvedAtMs?: number;
}) {
  if (!params.betCreatedAtMs || !params.deadlineMs) return 1;
  const totalWindow = Math.max(1, params.deadlineMs - params.betCreatedAtMs);
  const timeRemaining = clamp(params.deadlineMs - params.predictionTimeMs, 0, totalWindow);
  const remainingRatio = timeRemaining / totalWindow;
  return clamp(0.7 + 0.55 * Math.sqrt(remainingRatio), 0.7, 1.25);
}

export function calculatePredictionRewards(input: PredictionRewardInput): CoinPayout[] {
  const winningOptionIds = Array.isArray(input.winningOptionId) ? input.winningOptionId : [input.winningOptionId];
  const winners = input.predictions.filter((prediction) => predictionOptionIds(prediction).some((id) => winningOptionIds.includes(id)));
  const losers = input.predictions.filter((prediction) => !predictionOptionIds(prediction).some((id) => winningOptionIds.includes(id)));
  const winningStake = winners.reduce((sum, prediction) => sum + prediction.stake, 0);
  const losingPool = Math.max(0, losers.reduce((sum, prediction) => sum + prediction.stake, 0) - (input.bonusPool ?? 0));

  return input.predictions.map((prediction) => {
    const isWinner = predictionOptionIds(prediction).some((id) => winningOptionIds.includes(id));
    if (!isWinner || winningStake <= 0) {
      return {
        userId: prediction.userId,
        predictionId: prediction.id,
        stake: prediction.stake,
        isWinner: false,
        coinDelta: 0,
        returnedCoins: 0,
        poolProfit: 0,
        mintedReward: 0,
        timingMultiplier: 1,
      };
    }

    const poolProfit = Math.floor((prediction.stake / winningStake) * losingPool);
    const chance = clamp(prediction.displayedChanceAtBetTime || 0.5, 0.05, 0.95);
    // High upside: long-shot calls that come in pay big. Cap raised so a correct
    // ~5% pick can earn ~6x the base mint.
    const difficultyMultiplier = clamp(Math.sqrt(1 / chance), 1.05, 6);
    const timingMultiplier = calculateTimingMultiplier({
      predictionTimeMs: timestampMs(prediction.lastChangedAt ?? prediction.createdAt),
      betCreatedAtMs: input.betCreatedAtMs,
      deadlineMs: input.deadlineMs,
      resolvedAtMs: input.resolvedAtMs,
    });
    const revisionMultiplier = Math.max(0.45, 1 - (prediction.revisionCount ?? 0) * 0.15);
    const stakeWeight = Math.sqrt(Math.max(10, prediction.stake) / 50);
    const mintedReward = Math.round(35 * stakeWeight * difficultyMultiplier * timingMultiplier * revisionMultiplier);

    return {
      userId: prediction.userId,
      predictionId: prediction.id,
      stake: prediction.stake,
      isWinner: true,
      coinDelta: prediction.stake + poolProfit + mintedReward,
      returnedCoins: prediction.stake + poolProfit + mintedReward,
      poolProfit,
      mintedReward,
      timingMultiplier,
    };
  });
}

export function calculateCoinPayouts(
  predictions: Prediction[],
  winningOptionId: string | string[],
  bonusPool = 0,
): CoinPayout[] {
  return calculatePredictionRewards({ predictions, winningOptionId, bonusPool });
}
