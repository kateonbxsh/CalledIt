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
  // How much of your stack you put on the line — the core "risk" of the bet.
  const confidence = clamp(input.stake / Math.max(50, input.userCoinBalanceAtBetTime), 0.05, 0.5);
  const timingMultiplier = clamp(input.timingMultiplier ?? 1, 0.65, 1.25);

  if (!input.correct) {
    // A loss always stings (at least 10) and scales with risk (stake) and how
    // confident the losing pick was — backing a likely option that fails hurts more.
    let loss = 10 + 30 * confidence + 16 * p;
    loss *= timingMultiplier;
    let rawDelta = -clamp(loss, 10, 70);
    if (input.currentRating < 500) rawDelta *= 0.5; // go easier on newcomers
    return Math.round(rawDelta);
  }

  const stakeMultiplier = 0.75 + confidence;
  const upsetMultiplier = Math.sqrt(1 / p);
  const revisionMultiplier = clamp(1 - (input.revisionCount ?? 0) * 0.12, 0.5, 1);
  const rawDelta = clamp(32 * stakeMultiplier * (1 - p) * upsetMultiplier * timingMultiplier * revisionMultiplier, 0, 80);
  return Math.round(rawDelta);
}

export function applyRatingDelta(currentRating: number, delta: number) {
  return Math.max(300, currentRating + delta);
}
