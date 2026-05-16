export interface RatingDeltaInput {
  displayedChanceAtBetTime: number;
  correct: boolean;
  stake: number;
  userCoinBalanceAtBetTime: number;
  currentRating: number;
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
  let rawDelta = 32 * stakeMultiplier * (result - p) * upsetMultiplier;
  rawDelta = clamp(rawDelta, -45, 80);

  if (input.currentRating < 500 && rawDelta < 0) {
    rawDelta *= 0.5;
  }

  return Math.round(rawDelta);
}

export function applyRatingDelta(currentRating: number, delta: number) {
  return Math.max(300, currentRating + delta);
}
