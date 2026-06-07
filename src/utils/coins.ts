import type { Prediction } from '../types';

export interface CoinPayout {
  userId: string;
  predictionId: string;
  stake: number;
  isWinner: boolean;
  coinDelta: number;
  returnedCoins: number;
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

export function calculateCoinPayouts(
  predictions: Prediction[],
  winningOptionId: string,
  bonusPool = 0,
): CoinPayout[] {
  const winners = predictions.filter((prediction) => prediction.optionId === winningOptionId);
  const losers = predictions.filter((prediction) => prediction.optionId !== winningOptionId);
  const winningStake = winners.reduce((sum, prediction) => sum + prediction.stake, 0);
  const losingPool = losers.reduce((sum, prediction) => sum + prediction.stake, 0) - bonusPool;

  return predictions.map((prediction) => {
    const isWinner = prediction.optionId === winningOptionId;
    if (!isWinner || winningStake <= 0) {
      return {
        userId: prediction.userId,
        predictionId: prediction.id,
        stake: prediction.stake,
        isWinner: false,
        coinDelta: 0,
        returnedCoins: 0,
      };
    }

    const profit = Math.floor((prediction.stake / winningStake) * Math.max(0, losingPool));
    return {
      userId: prediction.userId,
      predictionId: prediction.id,
      stake: prediction.stake,
      isWinner: true,
      coinDelta: prediction.stake + profit,
      returnedCoins: prediction.stake + profit,
    };
  });
}
