import type { BetOption, ChanceOptionSummary, Prediction } from '../types';

const MIN_SMOOTHING_WEIGHT = 0.18;
const SMOOTHING_TIME_CONSTANT_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RATING = 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_SIGNAL_LIFT_MAX = 0.35;
const DAILY_SIGNAL_TAU_DAYS = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type PredictionSlice = Pick<Prediction, 'optionId' | 'optionIds' | 'stake' | 'userRating'>;
type TimeLike = { toMillis?: () => number } | Date | number | null | undefined;

function predictionOptionIds(prediction: PredictionSlice) {
  return prediction.optionIds?.length ? prediction.optionIds : [prediction.optionId];
}

export function calculateRawChanceSummary(
  options: BetOption[],
  predictions: PredictionSlice[],
): ChanceOptionSummary[] {
  const totalUsers = predictions.length;
  const totalCoins = predictions.reduce((sum, p) => sum + p.stake, 0);
  const totalRating = predictions.reduce((sum, p) => sum + (p.userRating ?? DEFAULT_RATING), 0);

  if (totalUsers === 0 || totalCoins === 0) {
    const equal = options.length > 0 ? 1 / options.length : 0;
    return options.map((option) => ({ optionId: option.id, users: 0, coins: 0, chance: equal }));
  }

  return options.map((option) => {
    const weightedPredictions = predictions
      .map((prediction) => {
        const optionIds = predictionOptionIds(prediction);
        return optionIds.includes(option.id)
          ? { prediction, weight: 1 / Math.max(1, optionIds.length) }
          : null;
      })
      .filter((item): item is { prediction: PredictionSlice; weight: number } => item !== null);
    const coins = weightedPredictions.reduce((sum, item) => sum + item.prediction.stake * item.weight, 0);
    const ratingSum = weightedPredictions.reduce((sum, item) => sum + (item.prediction.userRating ?? DEFAULT_RATING) * item.weight, 0);

    const userShare = weightedPredictions.reduce((sum, item) => sum + item.weight, 0) / totalUsers;
    const stakeShare = coins / totalCoins;
    const ratingShare = totalRating > 0 ? ratingSum / totalRating : 1 / options.length;

    return {
      optionId: option.id,
      users: weightedPredictions.length,
      coins: Math.round(coins),
    // Coins should matter, but not dominate: crowd signal is primary, stake is secondary.
    chance: 0.62 * userShare + 0.23 * stakeShare + 0.15 * ratingShare,
    };
  });
}

export function calculateChanceSummary(
  options: BetOption[],
  predictions: PredictionSlice[],
) {
  return calculateRawChanceSummary(options, predictions);
}

export function calculateSmoothedChanceSummary(params: {
  options: BetOption[];
  predictions: PredictionSlice[];
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
      params.previousSummary.find((s) => s.optionId === raw.optionId)?.chance ??
      1 / Math.max(1, params.options.length);

    return {
      ...raw,
      chance: previousChance + (raw.chance - previousChance) * smoothingWeight,
    };
  });
}

function timeMs(value: TimeLike) {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return value?.toMillis?.() ?? Date.now();
}

function normalizeSummary(summary: ChanceOptionSummary[], optionCount: number) {
  const minChance = optionCount > 1 ? 0.02 : 1;
  const clamped = summary.map((item) => ({
    ...item,
    chance: clamp(item.chance, minChance, 1),
  }));
  const total = clamped.reduce((sum, item) => sum + item.chance, 0) || 1;
  return clamped.map((item) => ({ ...item, chance: item.chance / total }));
}

export function projectChanceSummaryOverTime(params: {
  options: BetOption[];
  summary: ChanceOptionSummary[];
  updatedAt?: TimeLike;
  now?: TimeLike;
  status?: string;
}): ChanceOptionSummary[] {
  const optionCount = params.options.length;
  if (optionCount === 0) return [];
  if (params.status === 'resolved') return params.summary;

  const neutral = 1 / optionCount;
  const updatedAtMs = timeMs(params.updatedAt);
  const nowMs = timeMs(params.now);
  const daysElapsed = Math.max(0, Math.floor((nowMs - updatedAtMs) / ONE_DAY_MS));
  if (daysElapsed === 0) return normalizeSummary(params.summary, optionCount);

  const lift = DAILY_SIGNAL_LIFT_MAX * (1 - Math.exp(-daysElapsed / DAILY_SIGNAL_TAU_DAYS));
  const projected = params.options.map((option) => {
    const stored = params.summary.find((item) => item.optionId === option.id) ?? {
      optionId: option.id,
      users: 0,
      coins: 0,
      chance: neutral,
    };
    return {
      ...stored,
      chance: neutral + (stored.chance - neutral) * (1 + lift),
    };
  });

  return normalizeSummary(projected, optionCount);
}

export function chanceForOption(summary: ChanceOptionSummary[], optionId: string) {
  return summary.find((option) => option.optionId === optionId)?.chance ?? 0;
}
