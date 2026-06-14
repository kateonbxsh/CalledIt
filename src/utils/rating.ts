export interface RatingDeltaInput {
  displayedChanceAtBetTime: number;
  correct: boolean;
  stake: number;
  userCoinBalanceAtBetTime: number;
  currentRating: number;
  timingMultiplier?: number;
  revisionCount?: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function calculateRatingDelta(input: RatingDeltaInput) {
  const p = clamp(input.displayedChanceAtBetTime, 0.05, 0.95);
  const result = input.correct ? 1 : 0;
  const confidence = clamp(input.stake / Math.max(50, input.userCoinBalanceAtBetTime), 0.05, 0.35);
  const stakeMultiplier = 0.75 + confidence;
  const upsetMultiplier = input.correct ? Math.sqrt(1 / p) : Math.sqrt(1 / (1 - p));
  const timingMultiplier = clamp(input.timingMultiplier ?? 1, 0.65, 1.25);
  const revisionMultiplier = clamp(1 - (input.revisionCount ?? 0) * 0.12, 0.5, 1);
  let rawDelta = 32 * stakeMultiplier * (result - p) * upsetMultiplier * timingMultiplier * revisionMultiplier;
  // Losing should sting noticeably less than winning rewards, so dampen the
  // negative swing and keep its floor tighter than the win ceiling.
  if (!input.correct) rawDelta *= 0.5;
  rawDelta = clamp(rawDelta, -22, 80);

  if (input.currentRating < 500 && rawDelta < 0) {
    rawDelta *= 0.5;
  }

  return Math.round(rawDelta);
}

export function applyRatingDelta(currentRating: number, delta: number) {
  return Math.max(300, currentRating + delta);
}
