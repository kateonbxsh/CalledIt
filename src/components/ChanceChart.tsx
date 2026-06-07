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

const colors = ['#2f7d63', '#d95f46', '#3b75af', '#d49a25', '#6f5ca8'];

export function ChanceChart({ bet, snapshots }: { bet: Bet; snapshots: ChanceSnapshot[] }) {
  if (isClosestType(bet.type)) return null;

  const data = snapshots.map((snapshot) => {
    const point: Record<string, string | number> = {
      time: asDate(snapshot.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
    };
    snapshot.summary.forEach((summary) => {
      point[summary.optionId] = Math.round(summary.chance * 100);
    });
    return point;
  });

  if (data.length < 2) {
    return (
      <div className="grid h-48 place-items-center rounded-md border border-line bg-field text-sm text-ink/60">
        Chance history appears after more predictions arrive.
      </div>
    );
  }

  return (
    <div className="h-56 rounded-md border border-line bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} width={36} />
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
