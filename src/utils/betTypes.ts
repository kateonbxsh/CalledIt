import type { BetType } from '../types';

export const betTypeOptions: Array<{
  type: BetType;
  label: string;
  description: string;
}> = [
  { type: 'binary', label: 'Yes / No', description: 'Two clear sides' },
  { type: 'multi', label: 'Multiple Choice', description: 'Several possible outcomes' },
  { type: 'sports', label: 'Sports Match', description: 'Teams, result, optional score' },
  { type: 'overUnder', label: 'Over / Under', description: 'Above or below a number' },
  { type: 'date', label: 'Before / After', description: 'Whether it happens before a date' },
  { type: 'closestNumber', label: 'Closest Number', description: 'Guess the number, closest wins' },
  { type: 'closestDate', label: 'Closest Date', description: 'Guess the date, closest wins' },
];

export function betTypeLabel(type: BetType) {
  return betTypeOptions.find((item) => item.type === type)?.label ?? 'Bet';
}

export function isClosestType(type: BetType) {
  return type === 'closestNumber' || type === 'closestDate';
}
