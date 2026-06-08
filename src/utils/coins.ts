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

export function canClaimDailyReward(lastClaimAt?: Date | null) {
  if (!lastClaimAt) return true;
  const oneDay = 24 * 60 * 60 * 1000;
  return Date.now() - lastClaimAt.getTime() >= oneDay;
}

export function calculatePredictionChangeFee(params: {
  previousStake: number;
  nextStake: number;
  revisionCount: number;
  betCreatedAtMs?: number;
  deadlineMs?: number | null;
  nowMs?: number;
}) {
  const nowMs = params.nowMs ?? Date.now();
  const movedStake = Math.abs(params.nextStake - params.previousStake);
  const totalWindow = params.deadlineMs && params.betCreatedAtMs
    ? Math.max(1, params.deadlineMs - params.betCreatedAtMs)
    : 7 * 24 * 60 * 60 * 1000;
  const elapsed = params.betCreatedAtMs ? Math.max(0, nowMs - params.betCreatedAtMs) : totalWindow * 0.25;
  const latePressure = clamp(elapsed / totalWindow, 0, 1);
  const revisionPressure = Math.min(3, params.revisionCount) * 2;
  return Math.max(1, Math.round(3 + movedStake * (0.02 + latePressure * 0.08) + revisionPressure));
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
  const winners = input.predictions.filter((prediction) => winningOptionIds.includes(prediction.optionId));
  const losers = input.predictions.filter((prediction) => !winningOptionIds.includes(prediction.optionId));
  const winningStake = winners.reduce((sum, prediction) => sum + prediction.stake, 0);
  const losingPool = Math.max(0, losers.reduce((sum, prediction) => sum + prediction.stake, 0) - (input.bonusPool ?? 0));

  return input.predictions.map((prediction) => {
    const isWinner = winningOptionIds.includes(prediction.optionId);
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
    const difficultyMultiplier = clamp(Math.sqrt(1 / chance), 1.05, 4);
    const timingMultiplier = calculateTimingMultiplier({
      predictionTimeMs: timestampMs(prediction.lastChangedAt ?? prediction.createdAt),
      betCreatedAtMs: input.betCreatedAtMs,
      deadlineMs: input.deadlineMs,
      resolvedAtMs: input.resolvedAtMs,
    });
    const revisionMultiplier = Math.max(0.45, 1 - (prediction.revisionCount ?? 0) * 0.15);
    const stakeWeight = Math.sqrt(Math.max(10, prediction.stake) / 50);
    const mintedReward = Math.round(10 * stakeWeight * difficultyMultiplier * timingMultiplier * revisionMultiplier);

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
