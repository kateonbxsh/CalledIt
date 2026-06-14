import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Bet, Prediction } from '../types';
import { closestDateGuessLabel } from '../utils/closestGuess';
import { asDate } from '../utils/format';
import { calculateClosestGuessChances } from '../utils/probability';

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

type Guess = { value: number; chance: number; users: number; coins: number };

type CurvePoint = {
  x: number;
  density: number;
  // Only the guess peaks carry these, so the scatter renders a dot and the
  // tooltip shows a chance only when hovering a peak.
  peak?: number;
  chance?: number;
  users?: number;
  coins?: number;
};

// Use one deliberately broad bandwidth for every guess. Chance changes the
// amount of probability mass, never the sharpness, so the result reads as one
// smooth distribution rather than a row of narrow spikes.
function buildCurve(guesses: Guess[], range: number): CurvePoint[] {
  const sorted = guesses.map((guess) => guess.value).sort((left, right) => left - right);
  const gaps = sorted.slice(1).map((value, index) => value - sorted[index]).filter((gap) => gap > 0);
  const averageGap = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : range;
  const sigma = Math.max(range * 0.24, averageGap * 0.55, 1e-6);
  const gaussianScale = sigma * Math.sqrt(2 * Math.PI);

  const amplitude = (x: number) =>
    guesses.reduce((sum, guess) => {
      const u = (x - guess.value) / sigma;
      return sum + (guess.chance * Math.exp(-0.5 * u * u)) / gaussianScale;
    }, 0);

  const values = guesses.map((guess) => guess.value);
  const minX = Math.min(...values) - sigma * 3;
  const maxX = Math.max(...values) + sigma * 3;
  const steps = 320;
  const grid: CurvePoint[] = Array.from({ length: steps + 1 }, (_, index) => {
    const x = minX + ((maxX - minX) * index) / steps;
    return { x, density: amplitude(x) };
  });

  // Exact sample at each guess so the peak dot and its tooltip sit right on top.
  const peaks: CurvePoint[] = guesses.map((guess) => ({
    x: guess.value,
    density: amplitude(guess.value),
    peak: amplitude(guess.value),
    chance: guess.chance,
    users: guess.users,
    coins: guess.coins,
  }));

  return [...grid, ...peaks].sort((a, b) => a.x - b.x);
}

export function ClosestDistributionChart({ bet, predictions }: { bet: Bet; predictions: Prediction[] }) {
  const createdAtMs = bet.createdAt ? asDate(bet.createdAt).getTime() : Date.now();
  const deadlineMs = bet.deadline ? asDate(bet.deadline).getTime() : null;
  const nowMs = Date.now();

  const entries = calculateClosestGuessChances({
    predictions,
    type: bet.type === 'closestNumber' ? 'closestNumber' : 'closestDate',
    createdAtMs,
    deadlineMs,
    nowMs,
  });

  if (entries.length < 2) {
    return (
      <div className="grid h-48 place-items-center rounded-md border border-line bg-field px-4 text-center text-sm text-ink/60">
        Guess distribution appears after more predictions arrive.
      </div>
    );
  }

  const values = entries.map((entry) => entry.value);
  const range = Math.max(1e-6, Math.max(...values) - Math.min(...values));
  const data = buildCurve(entries, range);

  const numberDecimals = range < 10 ? 1 : 0;
  const formatX = bet.type === 'closestNumber'
    ? (x: number) => x.toFixed(numberDecimals)
    : (x: number) => compactDate(x);

  const actual =
    bet.status === 'resolved' && bet.type === 'closestNumber' && bet.resolution?.actualValue !== undefined
      ? bet.resolution.actualValue
      : bet.status === 'resolved' && bet.type === 'closestDate'
        ? asTime(bet.resolution?.actualDateValue)
        : null;

  return (
    <div className="h-56 rounded-md border border-line bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 14, bottom: 0, left: 6 }}>
          <defs>
            <linearGradient id="guessDensityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2f7d63" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#2f7d63" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e8e5dc" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatX}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10 }}
          />
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            cursor={false}
            // Only guess peaks carry a chance, so the tooltip stays hidden while
            // hovering the smooth body of the curve and appears only on peaks.
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0]?.payload as CurvePoint | undefined;
              if (!point || point.chance == null) return null;
              const pct = point.chance * 100;
              return (
                <div className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs shadow-soft">
                  <p className="font-semibold text-ink">{formatX(point.x)}</p>
                  <p className="text-ink/60">{pct < 10 ? pct.toFixed(1) : Math.round(pct)}% chance</p>
                  <p className="text-ink/45">{point.users} {point.users === 1 ? 'person' : 'people'} · {point.coins} coins</p>
                </div>
              );
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
            activeDot={false}
            isAnimationActive
          />
          <Scatter
            dataKey="peak"
            isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number }) =>
              typeof props.cx === 'number' && typeof props.cy === 'number' ? (
                <circle cx={props.cx} cy={props.cy} r={4} fill="#2f7d63" stroke="#f7f5ee" strokeWidth={1.5} />
              ) : <g />
            }
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
