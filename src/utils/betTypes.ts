import {
  BarChart2,
  CalendarDays,
  Hash,
  HelpCircle,
  ListPlus,
  Swords,
  TrendingUp,
} from 'lucide-react';
import type { BetType } from '../types';

export const betTypeOptions: Array<{
  type: BetType;
  label: string;
  description: string;
}> = [
  { type: 'binary', label: 'Yes / No', description: 'Two clear sides' },
  { type: 'multi', label: 'Multiple Choice', description: 'Several possible outcomes' },
  { type: 'openChoice', label: 'Open Choice', description: 'Players can add answers' },
  { type: 'sports', label: 'Sports Match', description: 'Teams, result, optional score' },
  { type: 'overUnder', label: 'Over / Under', description: 'Above or below a number' },
  { type: 'date', label: 'Before / After', description: 'Whether it happens before a date' },
  { type: 'closestNumber', label: 'Closest Number', description: 'Guess the number, closest wins' },
  { type: 'closestDate', label: 'Closest Date', description: 'Guess the date, closest wins' },
];

export const betTypeMeta: Record<
  BetType,
  { icon: React.ElementType; color: string; bg: string }
> = {
  binary:        { icon: HelpCircle,   color: 'text-mint',   bg: 'bg-mint/12'   },
  sports:        { icon: Swords,       color: 'text-sky',    bg: 'bg-sky/12'    },
  overUnder:     { icon: TrendingUp,   color: 'text-citrus', bg: 'bg-citrus/12' },
  date:          { icon: CalendarDays, color: 'text-plum',   bg: 'bg-plum/12'   },
  multi:         { icon: BarChart2,    color: 'text-coral',  bg: 'bg-coral/12'  },
  openChoice:    { icon: ListPlus,     color: 'text-plum',   bg: 'bg-plum/12'   },
  closestNumber: { icon: Hash,         color: 'text-aqua',   bg: 'bg-aqua/12'   },
  closestDate:   { icon: CalendarDays, color: 'text-aqua',   bg: 'bg-aqua/12'   },
};

export function betTypeLabel(type: BetType) {
  return betTypeOptions.find((item) => item.type === type)?.label ?? 'Bet';
}

export function isClosestType(type: BetType) {
  return type === 'closestNumber' || type === 'closestDate';
}
