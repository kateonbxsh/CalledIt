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
import { projectChanceSummaryOverTime } from '../utils/probability';

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
  const startMs = startOfDayMs(asDate(bet.createdAt).getTime());
  const naturalEnd = bet.status === 'resolved' && bet.resolvedAt
    ? asDate(bet.resolvedAt).getTime()
    : Math.min(
        Date.now(),
        bet.deadline ? asDate(bet.deadline).getTime() : Date.now(),
      );
  const endMs = Math.max(startMs, startOfDayMs(naturalEnd));
  const oneDay = 24 * 60 * 60 * 1000;
  let snapshotIndex = 0;
  let latestSummary = bet.options.map((option) => ({
    optionId: option.id,
    users: 0,
    coins: 0,
    chance: 1 / Math.max(1, bet.options.length),
  }));

  const data = [];
  for (let dayMs = startMs; dayMs <= endMs; dayMs += oneDay) {
    const dayEnd = dayMs + oneDay - 1;
    while (
      snapshotIndex < sortedSnapshots.length &&
      asDate(sortedSnapshots[snapshotIndex].createdAt).getTime() <= dayEnd
    ) {
      latestSummary = sortedSnapshots[snapshotIndex].summary;
      snapshotIndex += 1;
    }
    const point: Record<string, string | number> = {
      time: compactDate(dayMs),
    };
    const projectedSummary = projectChanceSummaryOverTime({
      options: bet.options,
      summary: latestSummary,
      updatedAt: snapshotIndex > 0 ? sortedSnapshots[snapshotIndex - 1].createdAt : bet.createdAt,
      now: dayMs,
      status: bet.status === 'resolved' && bet.resolvedAt && asDate(bet.resolvedAt).getTime() <= dayMs ? 'resolved' : 'open',
    });
    bet.options.forEach((option) => {
      const summary = projectedSummary.find((item) => item.optionId === option.id);
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

  return (
    <div className="h-56 rounded-md border border-line bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="time"
            tickLine={false}
            axisLine={false}
            minTickGap={18}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            tickFormatter={(value) => `${value}%`}
            tickLine={false}
            axisLine={false}
            ticks={[0, 25, 50, 75, 100]}
            width={38}
            tickMargin={4}
            tick={{ fontSize: 10 }}
          />
          <Tooltip formatter={(value) => `${value}%`} />
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
