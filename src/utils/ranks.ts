import type { Rank } from '../types';

export function rankForRating(rating: number): Rank {
  if (rating < 1100) return 'Bronze';
  if (rating < 1250) return 'Silver';
  if (rating < 1400) return 'Gold';
  if (rating < 1550) return 'Platinum';
  if (rating < 1700) return 'Diamond';
  if (rating < 1850) return 'Master';
  return 'Legend';
}

export const rankRanges: Array<{ rank: Rank; range: string; className: string }> = [
  { rank: 'Bronze', range: '300-1099 ELO', className: 'bg-[#8f5f3d] text-white' },
  { rank: 'Silver', range: '1100-1249 ELO', className: 'bg-[#8c98a5] text-white' },
  { rank: 'Gold', range: '1250-1399 ELO', className: 'bg-[#d49a25] text-white' },
  { rank: 'Platinum', range: '1400-1549 ELO', className: 'bg-[#6aa6b8] text-white' },
  { rank: 'Diamond', range: '1550-1699 ELO', className: 'bg-[#5f82d9] text-white' },
  { rank: 'Master', range: '1700-1849 ELO', className: 'bg-[#7b5aa6] text-white' },
  { rank: 'Legend', range: '1850+ ELO', className: 'bg-ink text-white' },
];

export function rankMeta(rank: Rank) {
  return rankRanges.find((item) => item.rank === rank) ?? rankRanges[0];
}

export function rankProgress(rating: number) {
  const boundaries = [
    { min: 300, max: 1099 },
    { min: 1100, max: 1249 },
    { min: 1250, max: 1399 },
    { min: 1400, max: 1549 },
    { min: 1550, max: 1699 },
    { min: 1700, max: 1849 },
    { min: 1850, max: 2100 },
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
