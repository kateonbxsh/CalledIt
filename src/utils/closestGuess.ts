import type { Prediction } from '../types';

export interface ClosestPayoutResult {
  winnerPredictionIds: string[];
  payouts: Array<{
    userId: string;
    predictionId: string;
    stake: number;
    isWinner: boolean;
    coinDelta: number;
  }>;
}

function dateToMs(dateStr: string) {
  return new Date(dateStr).getTime();
}

export function resolveClosestNumber(
  predictions: Prediction[],
  actualValue: number,
): { winnerPredictionIds: string[] } {
  const withGuess = predictions.filter((p) => p.numericGuess !== undefined && p.numericGuess !== null);
  if (withGuess.length === 0) return { winnerPredictionIds: [] };

  const distances = withGuess.map((p) => ({
    id: p.id,
    dist: Math.abs(p.numericGuess! - actualValue),
  }));
  const min = Math.min(...distances.map((d) => d.dist));
  return { winnerPredictionIds: distances.filter((d) => d.dist === min).map((d) => d.id) };
}

export function resolveClosestDate(
  predictions: Prediction[],
  actualDateValue: string,
): { winnerPredictionIds: string[] } {
  const actualMs = dateToMs(actualDateValue);
  const withGuess = predictions.filter((p) => p.dateGuess);
  if (withGuess.length === 0) return { winnerPredictionIds: [] };

  const distances = withGuess.map((p) => ({
    id: p.id,
    dist: Math.abs(dateToMs(p.dateGuess!) - actualMs),
  }));
  const min = Math.min(...distances.map((d) => d.dist));
  return { winnerPredictionIds: distances.filter((d) => d.dist === min).map((d) => d.id) };
}

export function calculateClosestPayouts(
  predictions: Prediction[],
  winnerPredictionIds: string[],
): ClosestPayoutResult['payouts'] {
  const winners = predictions.filter((p) => winnerPredictionIds.includes(p.id));
  const losers = predictions.filter((p) => !winnerPredictionIds.includes(p.id));
  const winnerStake = winners.reduce((sum, p) => sum + p.stake, 0);
  const losingPool = losers.reduce((sum, p) => sum + p.stake, 0);

  return predictions.map((p) => {
    const isWinner = winnerPredictionIds.includes(p.id);
    if (!isWinner || winnerStake <= 0) {
      return { userId: p.userId, predictionId: p.id, stake: p.stake, isWinner: false, coinDelta: 0 };
    }
    const profit = Math.floor((p.stake / winnerStake) * Math.max(0, losingPool));
    return { userId: p.userId, predictionId: p.id, stake: p.stake, isWinner: true, coinDelta: p.stake + profit };
  });
}

export function closestNumberGuessLabel(guess: number | undefined) {
  if (guess === undefined || guess === null) return '—';
  return String(guess);
}

export function closestDateGuessLabel(dateStr: string | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function closestNumberDistance(guess: number | undefined, actual: number) {
  if (guess === undefined || guess === null) return null;
  return Math.abs(guess - actual);
}

export function closestDateDistance(dateStr: string | undefined, actualStr: string) {
  if (!dateStr) return null;
  const days = Math.round(Math.abs(dateToMs(dateStr) - dateToMs(actualStr)) / (1000 * 60 * 60 * 24));
  return days;
}
