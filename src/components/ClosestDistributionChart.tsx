import {
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Bet, Prediction } from '../types';
import { closestDateGuessLabel } from '../utils/closestGuess';

const DAY_MS = 24 * 60 * 60 * 1000;

function asTime(date?: string | null) {
  if (!date) return null;
  const time = new Date(date).getTime();
  return Number.isFinite(time) ? time : null;
}

function compactDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function numberBuckets(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const bucketCount = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(values.length) + 2)));
  const size = range / bucketCount;

  return Array.from({ length: bucketCount }, (_, index) => {
    const start = min + size * index;
    const end = index === bucketCount - 1 ? max : start + size;
    const count = values.filter((value) => (
      index === bucketCount - 1 ? value >= start && value <= end : value >= start && value < end
    )).length;
    const decimals = range < 10 ? 1 : 0;
    return {
      label: `${start.toFixed(decimals)}-${end.toFixed(decimals)}`,
      count,
      center: start + (end - start) / 2,
    };
  });
}

function dateBuckets(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rangeDays = Math.max(1, Math.ceil((max - min) / DAY_MS));
  const bucketCount = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(values.length) + 2)));
  const sizeDays = Math.max(1, Math.ceil(rangeDays / bucketCount));
  const startDay = new Date(min);
  startDay.setHours(0, 0, 0, 0);
  const startMs = startDay.getTime();

  return Array.from({ length: bucketCount }, (_, index) => {
    const start = startMs + index * sizeDays * DAY_MS;
    const end = start + sizeDays * DAY_MS - 1;
    const count = values.filter((value) => value >= start && value <= end).length;
    return {
      label: sizeDays === 1 ? compactDate(start) : `${compactDate(start)}-${compactDate(end)}`,
      count,
      center: start + (end - start) / 2,
    };
  }).filter((bucket) => bucket.count > 0 || bucket.center <= max + sizeDays * DAY_MS);
}

export function ClosestDistributionChart({ bet, predictions }: { bet: Bet; predictions: Prediction[] }) {
  const values = bet.type === 'closestNumber'
    ? predictions
        .map((prediction) => prediction.numericGuess)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : predictions
        .map((prediction) => asTime(prediction.dateGuess))
        .filter((value): value is number => value !== null);

  if (values.length < 2) {
    return (
      <div className="grid h-48 place-items-center rounded-md border border-line bg-field px-4 text-center text-sm text-ink/60">
        Guess distribution appears after more predictions arrive.
      </div>
    );
  }

  const data = bet.type === 'closestNumber' ? numberBuckets(values) : dateBuckets(values);
  const actual =
    bet.status === 'resolved' && bet.type === 'closestNumber' && bet.resolution?.actualValue !== undefined
      ? bet.resolution.actualValue
      : bet.status === 'resolved' && bet.type === 'closestDate'
        ? asTime(bet.resolution?.actualDateValue)
        : null;
  const actualBucket = actual === null
    ? null
    : data.reduce((best, bucket) => (
        Math.abs(bucket.center - actual) < Math.abs(best.center - actual) ? bucket : best
      ), data[0]);

  return (
    <div className="h-56 rounded-md border border-line bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={28}
            tick={{ fontSize: 10 }}
          />
          <Tooltip
            formatter={(value) => [`${value} guesses`, 'Count']}
            labelFormatter={(label) => `Range: ${label}`}
          />
          {actualBucket ? (
            <ReferenceLine
              x={actualBucket.label}
              stroke="#d95f46"
              strokeDasharray="4 4"
              label={{
                value: bet.type === 'closestNumber' ? `Actual ${actual}` : `Actual ${closestDateGuessLabel(bet.resolution?.actualDateValue)}`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: '#d95f46',
              }}
            />
          ) : null}
          <Bar dataKey="count" fill="#2f7d63" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
