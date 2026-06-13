import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Bet, ChanceSnapshot } from '../types';
import { isClosestType } from '../utils/betTypes';
import { asDate } from '../utils/format';
import { displayChanceSummary } from '../utils/probability';

const colors = ['#2f7d63', '#d95f46', '#3b75af', '#d49a25', '#6f5ca8'];

function startOfDayMs(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function compactDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function ChanceChart({ bet, snapshots }: { bet: Bet; snapshots: ChanceSnapshot[] }) {
  if (isClosestType(bet.type)) return null;

  const sortedSnapshots = [...snapshots].sort((left, right) => asDate(left.createdAt).getTime() - asDate(right.createdAt).getTime());
  const createdAtMs = asDate(bet.createdAt).getTime();
  const deadlineMs = bet.deadline ? asDate(bet.deadline).getTime() : null;
  const targetDateMs = bet.targetDate ? asDate(bet.targetDate).getTime() : null;
  const startMs = startOfDayMs(createdAtMs);
  const naturalEnd = bet.status === 'resolved' && bet.resolvedAt
    ? asDate(bet.resolvedAt).getTime()
    : Math.min(
        Date.now(),
        bet.deadline ? asDate(bet.deadline).getTime() : Date.now(),
      );
  const oneDay = 24 * 60 * 60 * 1000;
  const sixHours = oneDay / 4; // 4 points per day for a smooth multi-day curve
  // The curve ends exactly at "now" (or the resolve time), so its last point
  // equals the option breakdown rendered on the page.
  const lastMs = Math.max(startMs + 1, naturalEnd);
  let snapshotIndex = 0;
  let latestSummary = bet.options.map((option) => ({
    optionId: option.id,
    users: 0,
    coins: 0,
    chance: 1 / Math.max(1, bet.options.length),
  }));

  const dayTicks: number[] = [];
  for (let d = startMs; d <= lastMs; d += oneDay) dayTicks.push(d);

  // Sample at 6h steps for the history, then always include the exact end point.
  const sampleTimes: number[] = [];
  for (let t = startMs; t < lastMs; t += sixHours) sampleTimes.push(t);
  sampleTimes.push(lastMs);

  const data = [];
  for (const t of sampleTimes) {
    while (
      snapshotIndex < sortedSnapshots.length &&
      asDate(sortedSnapshots[snapshotIndex].createdAt).getTime() <= t
    ) {
      latestSummary = sortedSnapshots[snapshotIndex].summary;
      snapshotIndex += 1;
    }
    const resolved = bet.status === 'resolved' && bet.resolvedAt && asDate(bet.resolvedAt).getTime() <= t;
    const displayed = displayChanceSummary({
      options: bet.options,
      summary: latestSummary,
      type: bet.type,
      createdAtMs,
      deadlineMs,
      targetDateMs,
      nowMs: t,
      status: resolved ? 'resolved' : 'open',
    });
    const point: Record<string, number> = { t };
    bet.options.forEach((option) => {
      const summary = displayed.find((item) => item.optionId === option.id);
      point[option.id] = Math.round((summary?.chance ?? 0) * 100);
    });
    data.push(point);
  }

  if (data.length < 2 || sortedSnapshots.length === 0) {
    return (
      <div className="grid h-48 place-items-center rounded-md border border-line bg-field text-sm text-ink/60">
        Chance history appears after more predictions arrive.
      </div>
    );
  }

  // Zoom the Y axis around the actual min/max so tiny movements are visible
  // instead of being lost in empty space above and below.
  const allValues = data.flatMap((point) => bet.options.map((option) => point[option.id]));
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const pad = Math.max(2, Math.round((dataMax - dataMin) * 0.2));
  const yMin = Math.max(0, dataMin - pad);
  const yMax = Math.min(100, dataMax + pad);
  const midpoint = Math.round((yMin + yMax) / 2);
  const yTicks = [...new Set([yMin, midpoint, yMax])];

  return (
    <div className="h-56 rounded-md border border-line bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={dayTicks}
            interval={0}
            tickFormatter={(value) => compactDate(value)}
            tickLine={false}
            axisLine={false}
            minTickGap={0}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            tickFormatter={(value) => `${value}%`}
            tickLine={false}
            axisLine={false}
            domain={[yMin, yMax]}
            ticks={yTicks}
            width={38}
            tickMargin={4}
            tick={{ fontSize: 10 }}
          />
          <Tooltip formatter={(value) => `${value}%`} labelFormatter={(label) => compactDate(Number(label))} />
          {bet.options.map((option, index) => (
            <Line
              key={option.id}
              type="monotone"
              dataKey={option.id}
              name={option.label}
              stroke={colors[index % colors.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
