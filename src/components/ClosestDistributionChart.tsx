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
import { dateGuessChance } from '../utils/probability';

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

type Guess = { value: number; chance: number };

type CurvePoint = {
  x: number;
  density: number;
  // Only the guess peaks carry these, so the scatter renders a dot and the
  // tooltip shows a chance only when hovering a peak.
  peak?: number;
  chance?: number;
};

// Every guess becomes its own hill. The peak height is proportional to the
// guess's chance, while the width is inversely proportional to it: a confident
// (high-chance) guess is a tall, thin spike, and an unlikely one flattens into a
// low, wide mound. The drawn curve is the sum of all hills, so it stays smooth.
function buildCurve(guesses: Guess[], range: number): CurvePoint[] {
  const maxChance = Math.max(...guesses.map((guess) => guess.chance)) || 1;
  const sigmaMin = Math.max(range * 0.02, 1e-6);
  const sigmaMax = Math.max(range * 0.16, sigmaMin * 4);
  const shaped = guesses.map((guess) => {
    const relative = guess.chance / maxChance; // 1 = most likely guess
    const sigma = sigmaMin + (sigmaMax - sigmaMin) * (1 - relative);
    return { ...guess, sigma };
  });

  const amplitude = (x: number) =>
    shaped.reduce((sum, guess) => {
      const u = (x - guess.value) / guess.sigma;
      return sum + guess.chance * Math.exp(-0.5 * u * u);
    }, 0);

  const widest = Math.max(...shaped.map((guess) => guess.sigma));
  const values = guesses.map((guess) => guess.value);
  const minX = Math.min(...values) - widest * 3;
  const maxX = Math.max(...values) + widest * 3;
  const steps = 220;
  const grid: CurvePoint[] = Array.from({ length: steps + 1 }, (_, index) => {
    const x = minX + ((maxX - minX) * index) / steps;
    return { x, density: amplitude(x) };
  });

  // Exact sample at each guess so the peak dot and its tooltip sit right on top.
  const peaks: CurvePoint[] = shaped.map((guess) => ({
    x: guess.value,
    density: amplitude(guess.value),
    peak: amplitude(guess.value),
    chance: guess.chance,
  }));

  return [...grid, ...peaks].sort((a, b) => a.x - b.x);
}

export function ClosestDistributionChart({ bet, predictions }: { bet: Bet; predictions: Prediction[] }) {
  const createdAtMs = bet.createdAt ? asDate(bet.createdAt).getTime() : Date.now();
  const deadlineMs = bet.deadline ? asDate(bet.deadline).getTime() : null;
  const nowMs = Date.now();

  // Closest-date guesses use the same date-aware chance that drives rewards.
  const entries: Guess[] = bet.type === 'closestNumber'
    ? predictions
      .map((prediction) => prediction.numericGuess)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map((value) => ({ value, chance: 0 }))
    : predictions
      .map((prediction) => asTime(prediction.dateGuess))
      .filter((value): value is number => value !== null)
      .map((value) => ({
        value,
        chance: dateGuessChance({ guessMs: value, createdAtMs, deadlineMs, nowMs, guessCount: predictions.length }),
      }));

  if (entries.length < 2) {
    return (
      <div className="grid h-48 place-items-center rounded-md border border-line bg-field px-4 text-center text-sm text-ink/60">
        Guess distribution appears after more predictions arrive.
      </div>
    );
  }

  // Number guesses have no time model, so likelihood follows wisdom-of-crowd:
  // guesses near the consensus (mean) are likelier than far-out outliers.
  if (bet.type === 'closestNumber') {
    const values = entries.map((entry) => entry.value);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const spread = Math.sqrt(variance) || (Math.max(...values) - Math.min(...values)) / 4 || 1;
    entries.forEach((entry) => {
      entry.chance = Math.exp(-0.5 * ((entry.value - mean) / spread) ** 2);
    });
  }

  // Normalize so each peak reads as a real probability (the chances sum to 1).
  const totalChance = entries.reduce((sum, entry) => sum + entry.chance, 0) || entries.length;
  entries.forEach((entry) => {
    entry.chance = entry.chance / totalChance;
  });

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
