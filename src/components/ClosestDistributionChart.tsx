import {
  Area,
  AreaChart,
  CartesianGrid,
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

type DensityPoint = {
  x: number;
  density: number;
  label: string;
};

type DensityCurve = {
  data: DensityPoint[];
  minX: number;
  maxX: number;
  bandwidth: number;
  toLabel: (x: number) => string;
};

function normalizeDensity(points: DensityPoint[]) {
  const area = points.slice(1).reduce((sum, point, index) => {
    const previous = points[index];
    return sum + ((previous.density + point.density) / 2) * (point.x - previous.x);
  }, 0);

  if (area <= 0) return points;
  return points.map((point) => ({ ...point, density: point.density / area }));
}

function buildDensityCurve(values: number[], toLabel: (x: number) => string): DensityCurve {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const sortedValues = [...values].sort((a, b) => a - b);
  const gaps = sortedValues
    .slice(1)
    .map((value, index) => value - sortedValues[index])
    .filter((gap) => gap > 0);
  const typicalGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : range;
  const bandwidth = Math.max(
    Math.min(range / 9, typicalGap * 0.28, range / Math.sqrt(values.length) * 0.38),
    range / 85,
    0.18,
  );
  const minX = min - bandwidth * 5;
  const maxX = max + bandwidth * 5;
  const steps = 240;
  const rawPoints = Array.from({ length: steps + 1 }, (_, index) => {
    const x = minX + ((maxX - minX) * index) / steps;
    const density = values.reduce((sum, value) => {
      const u = (x - value) / bandwidth;
      return sum + Math.exp(-0.5 * u * u);
    }, 0) / (values.length * bandwidth * Math.sqrt(2 * Math.PI));

    return {
      x,
      density,
      label: toLabel(x),
    };
  });

  return {
    data: normalizeDensity(rawPoints),
    minX,
    maxX,
    bandwidth,
    toLabel,
  };
}

export function ClosestDistributionChart({ bet, predictions }: { bet: Bet; predictions: Prediction[] }) {
  const rawValues = bet.type === 'closestNumber'
    ? predictions
      .map((prediction) => prediction.numericGuess)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : predictions
      .map((prediction) => asTime(prediction.dateGuess))
      .filter((value): value is number => value !== null);

  if (rawValues.length < 2) {
    return (
      <div className="grid h-48 place-items-center rounded-md border border-line bg-field px-4 text-center text-sm text-ink/60">
        Guess distribution appears after more predictions arrive.
      </div>
    );
  }

  const firstDateMs = bet.type === 'closestDate' ? Math.min(...rawValues) : null;
  const startDayMs = firstDateMs === null
    ? null
    : new Date(firstDateMs).setHours(0, 0, 0, 0);
  const values = bet.type === 'closestNumber'
    ? rawValues
    : rawValues.map((value) => ((value - (startDayMs ?? value)) / DAY_MS));
  const numberRange = bet.type === 'closestNumber'
    ? Math.max(1, Math.max(...values) - Math.min(...values))
    : 1;
  const numberDecimals = numberRange < 10 ? 1 : 0;
  const curve = buildDensityCurve(
    values,
    bet.type === 'closestNumber'
      ? (x) => x.toFixed(numberDecimals)
      : (x) => compactDate((startDayMs ?? 0) + x * DAY_MS),
  );
  const actual =
    bet.status === 'resolved' && bet.type === 'closestNumber' && bet.resolution?.actualValue !== undefined
      ? bet.resolution.actualValue
      : bet.status === 'resolved' && bet.type === 'closestDate'
        ? (() => {
          const time = asTime(bet.resolution?.actualDateValue);
          return time === null || startDayMs === null ? null : (time - startDayMs) / DAY_MS;
        })()
        : null;

  return (
    <div className="h-56 rounded-md border border-line bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={curve.data} margin={{ top: 8, right: 14, bottom: 0, left: 10 }}>
          <defs>
            <linearGradient id="guessDensityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2f7d63" stopOpacity={0.34} />
              <stop offset="95%" stopColor="#2f7d63" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e8e5dc" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[curve.minX, curve.maxX]}
            tickFormatter={curve.toLabel}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            dataKey="density"
            tickLine={false}
            axisLine={false}
            width={34}
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => Number(value).toFixed(2)}
          />
          <Tooltip
            formatter={(value) => [Number(value).toFixed(3), 'Probability density']}
            labelFormatter={(_, payload) => {
              const point = payload?.[0]?.payload as DensityPoint | undefined;
              return point ? `Guess: ${point.label}` : 'Guess';
            }}
          />
          {actual !== null ? (
            <ReferenceLine
              x={actual}
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
          <Area
            type="monotone"
            dataKey="density"
            stroke="#2f7d63"
            strokeWidth={3}
            fill="url(#guessDensityFill)"
            dot={false}
            activeDot={{ r: 4, stroke: '#163d31', strokeWidth: 1, fill: '#f7f5ee' }}
            isAnimationActive
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
