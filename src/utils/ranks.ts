import type { Rank } from '../types';

export function rankForRating(rating: number): Rank {
  if (rating < 1250) return 'Bronze';
  if (rating < 1500) return 'Silver';
  if (rating < 1750) return 'Gold';
  if (rating < 2050) return 'Platinum';
  if (rating < 2400) return 'Diamond';
  if (rating < 2800) return 'Master';
  return 'Legend';
}

export const rankRanges: Array<{ rank: Rank; range: string; className: string }> = [
  { rank: 'Bronze', range: '300-1249 ELO', className: 'bg-[#8f5f3d] text-white' },
  { rank: 'Silver', range: '1250-1499 ELO', className: 'bg-[#8c98a5] text-white' },
  { rank: 'Gold', range: '1500-1749 ELO', className: 'bg-[#d49a25] text-white' },
  { rank: 'Platinum', range: '1750-2049 ELO', className: 'bg-[#6aa6b8] text-white' },
  { rank: 'Diamond', range: '2050-2399 ELO', className: 'bg-[#5f82d9] text-white' },
  { rank: 'Master', range: '2400-2799 ELO', className: 'bg-[#7b5aa6] text-white' },
  { rank: 'Legend', range: '2800+ ELO', className: 'bg-ink text-white' },
];

export function rankMeta(rank: Rank) {
  return rankRanges.find((item) => item.rank === rank) ?? rankRanges[0];
}

export function rankProgress(rating: number) {
  const boundaries = [
    { min: 300, max: 1249 },
    { min: 1250, max: 1499 },
    { min: 1500, max: 1749 },
    { min: 1750, max: 2049 },
    { min: 2050, max: 2399 },
    { min: 2400, max: 2799 },
    { min: 2800, max: 3200 },
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
