import type { Prediction } from '../types';

export interface ScoreBonusResult {
  bonusPool: number;
  winners: Array<{
    userId: string;
    predictionId: string;
    ratingBonus: number;
    coinBonus: number;
    exact: boolean;
  }>;
}

export function calculateSportsScoreBonus(params: {
  predictions: Prediction[];
  winningOptionId: string;
  actualHomeScore?: number;
  actualAwayScore?: number;
  losingStakeTotal: number;
}): ScoreBonusResult {
  const { actualHomeScore, actualAwayScore } = params;
  if (actualHomeScore == null || actualAwayScore == null) {
    return { bonusPool: 0, winners: [] };
  }

  const eligible = params.predictions.filter(
    (prediction) =>
      prediction.optionId === params.winningOptionId && prediction.scorePrediction,
  );

  if (eligible.length === 0) {
    return { bonusPool: 0, winners: [] };
  }

  const bonusPool = Math.floor(params.losingStakeTotal * 0.1);
  const scored = eligible.map((prediction) => {
    const distance =
      Math.abs(prediction.scorePrediction!.home - actualHomeScore) +
      Math.abs(prediction.scorePrediction!.away - actualAwayScore);
    return { prediction, distance };
  });

  const exact = scored.filter((item) => item.distance === 0);
  const chosen = exact.length > 0
    ? exact
    : scored.filter((item) => item.distance === Math.min(...scored.map((item) => item.distance)));

  return {
    bonusPool,
    winners: chosen.map(({ prediction, distance }) => ({
      userId: prediction.userId,
      predictionId: prediction.id,
      exact: distance === 0,
      ratingBonus: distance === 0 ? 15 : 7,
      coinBonus: Math.floor(bonusPool / chosen.length),
    })),
  };
}
