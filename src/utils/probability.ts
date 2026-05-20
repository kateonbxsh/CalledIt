import type { BetOption, ChanceOptionSummary, Prediction } from '../types';

const MIN_SMOOTHING_WEIGHT = 0.18;
const SMOOTHING_TIME_CONSTANT_MS = 6 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function calculateRawChanceSummary(
  options: BetOption[],
  predictions: Pick<Prediction, 'optionId' | 'stake'>[],
): ChanceOptionSummary[] {
  const totalUsers = predictions.length;
  const totalCoins = predictions.reduce((sum, prediction) => sum + prediction.stake, 0);

  if (totalUsers === 0 || totalCoins === 0) {
    const equal = options.length > 0 ? 1 / options.length : 0;
    return options.map((option) => ({
      optionId: option.id,
      users: 0,
      coins: 0,
      chance: equal,
    }));
  }

  return options.map((option) => {
    const optionPredictions = predictions.filter(
      (prediction) => prediction.optionId === option.id,
    );
    const coins = optionPredictions.reduce((sum, prediction) => sum + prediction.stake, 0);
    const userShare = optionPredictions.length / totalUsers;
    const stakeShare = coins / totalCoins;

    return {
      optionId: option.id,
      users: optionPredictions.length,
      coins,
      chance: 0.45 * userShare + 0.55 * stakeShare,
    };
  });
}

export function calculateChanceSummary(
  options: BetOption[],
  predictions: Pick<Prediction, 'optionId' | 'stake'>[],
) {
  return calculateRawChanceSummary(options, predictions);
}

export function calculateSmoothedChanceSummary(params: {
  options: BetOption[];
  predictions: Pick<Prediction, 'optionId' | 'stake'>[];
  previousSummary: ChanceOptionSummary[];
  elapsedMs: number;
}): ChanceOptionSummary[] {
  const rawSummary = calculateRawChanceSummary(params.options, params.predictions);
  const hasPredictions = params.predictions.length > 0;
  if (!hasPredictions) return rawSummary;

  const timeWeight = 1 - Math.exp(-Math.max(0, params.elapsedMs) / SMOOTHING_TIME_CONSTANT_MS);
  const smoothingWeight = clamp(timeWeight, MIN_SMOOTHING_WEIGHT, 0.92);

  return rawSummary.map((raw) => {
    const previousChance =
      params.previousSummary.find((summary) => summary.optionId === raw.optionId)?.chance ??
      1 / Math.max(1, params.options.length);

    return {
      ...raw,
      chance: previousChance + (raw.chance - previousChance) * smoothingWeight,
    };
  });
}

export function chanceForOption(summary: ChanceOptionSummary[], optionId: string) {
  return summary.find((option) => option.optionId === optionId)?.chance ?? 0;
}
