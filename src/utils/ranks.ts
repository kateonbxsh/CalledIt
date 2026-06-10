import type { Rank } from '../types';

export function rankForRating(rating: number): Rank {
  if (rating < 250) return 'Iron';
  if (rating < 700) return 'Bronze';
  if (rating < 1100) return 'Silver';
  if (rating < 1450) return 'Gold';
  if (rating < 1750) return 'Platinum';
  if (rating < 2000) return 'Diamond';
  if (rating < 2250) return 'Master';
  return 'Legend';
}

export const rankRanges: Array<{ rank: Rank; range: string; className: string }> = [
  { rank: 'Iron', range: '0-249 ELO', className: 'bg-[#5a5a5a] text-white' },
  { rank: 'Bronze', range: '250-699 ELO', className: 'bg-[#8f5f3d] text-white' },
  { rank: 'Silver', range: '700-1099 ELO', className: 'bg-[#8c98a5] text-white' },
  { rank: 'Gold', range: '1100-1449 ELO', className: 'bg-[#d49a25] text-white' },
  { rank: 'Platinum', range: '1450-1749 ELO', className: 'bg-[#6aa6b8] text-white' },
  { rank: 'Diamond', range: '1750-1999 ELO', className: 'bg-[#5f82d9] text-white' },
  { rank: 'Master', range: '2000-2249 ELO', className: 'bg-[#7b5aa6] text-white' },
  { rank: 'Legend', range: '2250+ ELO', className: 'bg-ink text-white' },
];

export function rankMeta(rank: Rank) {
  return rankRanges.find((item) => item.rank === rank) ?? rankRanges[0];
}

export function rankProgress(rating: number) {
  const boundaries = [
    { min: 0, max: 249 },
    { min: 250, max: 699 },
    { min: 700, max: 1099 },
    { min: 1100, max: 1449 },
    { min: 1450, max: 1749 },
    { min: 1750, max: 1999 },
    { min: 2000, max: 2249 },
    { min: 2250, max: 3000 },
  ];
  const rank = rankForRating(rating);
  const index = rankRanges.findIndex((item) => item.rank === rank);
  const boundary = boundaries[Math.max(0, index)];
  const percent = Math.min(100, Math.max(0, ((rating - boundary.min) / (boundary.max - boundary.min)) * 100));
  return {
    rank,
    percent,
    currentRange: rankRanges[Math.max(0, index)].range,
    nextRank: rankRanges[index + 1]?.rank ?? null,
  };
}
