import type { BetOption, BetType, ChanceOptionSummary, Prediction } from '../types';

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

// Fraction of the way from the bet's creation to its deadline: 0 at creation,
// 1 at/after the deadline. null when there is no usable deadline. The
// convergence/decay ramps linearly with this fraction, so its real-time speed is
// set by (i.e. spans) the creation->deadline distance — short bets converge
// fast, long bets slowly, both completing exactly at the deadline.
function deadlineProgress(createdAtMs: number, deadlineMs: number | null | undefined, nowMs: number) {
  if (!deadlineMs || deadlineMs <= createdAtMs) return null;
  return clamp((nowMs - createdAtMs) / (deadlineMs - createdAtMs), 0, 1);
}

// The chance shown to users and stored as displayedChanceAtBetTime. Layers a
// date-aware adjustment on top of the crowd chance:
//  - generic deadline bets: early on, chances barely move (stay near neutral),
//    and smoothly converge to the crowd chance as the deadline approaches.
//  - 'date' (Before / After a target date): the "before" side decays toward 0
//    as the date approaches, and is exactly 0 once the date has passed.
//  - bets with no deadline: just show the crowd chance.
export function displayChanceSummary(params: {
  options: BetOption[];
  summary: ChanceOptionSummary[];
  type: BetType;
  createdAtMs: number;
  deadlineMs?: number | null;
  // For 'date' (Before/After) bets, the date the "before" side decays toward.
  targetDateMs?: number | null;
  nowMs?: number;
  status?: string;
}): ChanceOptionSummary[] {
  const { options } = params;
  const optionCount = options.length;
  if (optionCount === 0) return [];

  const nowMs = params.nowMs ?? Date.now();
  const neutral = 1 / optionCount;
  const baseSummary = params.summary.length
    ? params.summary
    : options.map((option) => ({ optionId: option.id, users: 0, coins: 0, chance: neutral }));
  const crowd = normalizeSummary(baseSummary, optionCount);
  if (params.status === 'resolved') return crowd;

  const progress = deadlineProgress(params.createdAtMs, params.deadlineMs, nowMs);

  // Before / After a target date. Decay is driven by the target date itself
  // (falling back to the deadline for older bets without a stored target date).
  if (params.type === 'date') {
    const dateMs = params.targetDateMs ?? params.deadlineMs ?? null;
    const dateProgress = deadlineProgress(params.createdAtMs, dateMs, nowMs);
    const crowdBefore = crowd.find((item) => item.optionId === 'before')?.chance ?? neutral;
    const past = dateMs ? nowMs >= dateMs : false;
    const ease = dateProgress ?? 0;
    const beforeChance = past ? 0 : crowdBefore * (1 - ease);
    return options.map((option) => {
      const stored = crowd.find((item) => item.optionId === option.id) ?? { optionId: option.id, users: 0, coins: 0, chance: neutral };
      const chance = option.id === 'before' ? beforeChance : 1 - beforeChance;
      return { ...stored, chance };
    });
  }

  // Generic deadline bets: blend neutral -> crowd chance as the deadline nears.
  if (progress !== null) {
    const blended = crowd.map((item) => ({ ...item, chance: neutral + (item.chance - neutral) * progress }));
    return normalizeSummary(blended, optionCount);
  }

  return crowd;
}

export interface ClosestGuessChance {
  value: number;
  chance: number;
  users: number;
  coins: number;
}

// Closest guesses follow the same crowd signal as ordinary options:
// 62% people, 23% stake, and 15% predictor rating. At creation every distinct
// guess starts equally likely; the crowd signal takes over smoothly toward the
// deadline. Date guesses additionally lose probability as their date expires.
export function calculateClosestGuessChances(params: {
  predictions: Array<Pick<Prediction, 'numericGuess' | 'dateGuess' | 'stake' | 'userRating'>>;
  type: 'closestNumber' | 'closestDate';
  createdAtMs: number;
  deadlineMs?: number | null;
  nowMs?: number;
}): ClosestGuessChance[] {
  const nowMs = params.nowMs ?? Date.now();
  const groups = new Map<number, Array<(typeof params.predictions)[number]>>();

  params.predictions.forEach((prediction) => {
    const value = params.type === 'closestNumber'
      ? prediction.numericGuess
      : prediction.dateGuess
        ? new Date(prediction.dateGuess).getTime()
        : null;
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    groups.set(value, [...(groups.get(value) ?? []), prediction]);
  });

  if (groups.size === 0) return [];

  const validPredictions = Array.from(groups.values()).flat();
  const totalUsers = validPredictions.length;
  const totalCoins = validPredictions.reduce((sum, prediction) => sum + prediction.stake, 0) || 1;
  const totalRating = validPredictions.reduce(
    (sum, prediction) => sum + (prediction.userRating ?? DEFAULT_RATING),
    0,
  ) || 1;
  const neutral = 1 / groups.size;
  const rawProgress = deadlineProgress(params.createdAtMs, params.deadlineMs, nowMs);
  const linearProgress = rawProgress ?? clamp(
    (nowMs - params.createdAtMs) / (30 * ONE_DAY_MS),
    0,
    1,
  );
  // Smoothstep keeps the opening of the bet visibly close to uniform.
  const convergence = linearProgress * linearProgress * (3 - 2 * linearProgress);

  const weighted = Array.from(groups.entries()).map(([value, predictions]) => {
    const coins = predictions.reduce((sum, prediction) => sum + prediction.stake, 0);
    const rating = predictions.reduce(
      (sum, prediction) => sum + (prediction.userRating ?? DEFAULT_RATING),
      0,
    );
    const crowdChance =
      0.62 * (predictions.length / totalUsers)
      + 0.23 * (coins / totalCoins)
      + 0.15 * (rating / totalRating);
    const blendedChance = neutral + (crowdChance - neutral) * convergence;

    let expiryWeight = 1;
    if (params.type === 'closestDate') {
      const fullWindow = Math.max(ONE_DAY_MS, value - params.createdAtMs);
      const remainingRatio = clamp((value - nowMs) / fullWindow, 0, 1);
      // The date is almost unpenalized early, then falls increasingly quickly
      // as both the bet deadline and the guessed date approach.
      expiryWeight = Math.pow(remainingRatio, 0.45 + convergence * 1.1);
      if (value <= nowMs) expiryWeight = 0.001;
    }

    return {
      value,
      users: predictions.length,
      coins: Math.round(coins),
      chance: blendedChance * expiryWeight,
    };
  });

  const total = weighted.reduce((sum, guess) => sum + guess.chance, 0) || 1;
  return weighted
    .map((guess) => ({ ...guess, chance: guess.chance / total }))
    .sort((left, right) => left.value - right.value);
}
