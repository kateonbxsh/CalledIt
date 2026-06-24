import type { Bet, ChanceOptionSummary, FootballLiveMatch } from '../types';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function applyLiveFootballChances(
  bet: Bet,
  summary: ChanceOptionSummary[],
  live: FootballLiveMatch | null,
) {
  if (bet.type !== 'sports' || !live || live.score.home === null || live.score.away === null) return summary;
  const minute = clamp(live.minute ?? 0, 0, 120);
  const progress = clamp(minute / 90, 0, 1);
  const scoreDiff = live.score.home - live.score.away;
  const evidence = 0.65 + 2.4 * progress;

  const weighted = summary.map((item) => {
    const side = bet.options.find((option) => option.id === item.optionId)?.teamSide;
    let scoreWeight = 1;
    if (side === 'home') scoreWeight = Math.exp(scoreDiff * evidence);
    if (side === 'away') scoreWeight = Math.exp(-scoreDiff * evidence);
    if (side === 'draw') {
      scoreWeight = scoreDiff === 0
        ? 1 + 3.5 * progress * progress
        : Math.exp(-Math.abs(scoreDiff) * evidence * 1.25);
    }
    return { ...item, chance: Math.max(0.002, item.chance * scoreWeight) };
  });
  const total = weighted.reduce((sum, item) => sum + item.chance, 0) || 1;
  return weighted.map((item) => ({ ...item, chance: item.chance / total }));
}
