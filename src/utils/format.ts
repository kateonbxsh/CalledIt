import { formatDistanceToNowStrict } from 'date-fns';
import type { Timestamp } from 'firebase/firestore';

export function asDate(value: Timestamp | Date) {
  return value instanceof Date ? value : value.toDate();
}

export function relativeTime(value: Timestamp | Date) {
  return formatDistanceToNowStrict(asDate(value), { addSuffix: true });
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
