import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BalanceSnapshot, UserProfile } from '../types';

function compactCoins(value: number) {
  return new Intl.NumberFormat('en', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

export function BalanceHistoryChart({
  user,
  snapshots,
}: {
  user: UserProfile;
  snapshots: BalanceSnapshot[];
}) {
  const data = useMemo(() => {
    const points = snapshots
      .filter((snapshot) => snapshot.createdAt?.toDate)
      .map((snapshot) => ({
        id: snapshot.id,
        balance: snapshot.balance,
        reason: snapshot.reason,
        date: snapshot.createdAt.toDate(),
        t: snapshot.createdAt.toMillis(),
      }));

    if (points.length === 0) {
      const createdAt = user.createdAt?.toDate?.() ?? new Date();
      return [
        {
          id: 'starting',
          balance: user.coinBalance,
          reason: 'Balance tracking starts here',
          date: createdAt,
          t: createdAt.getTime(),
        },
        {
          id: 'current',
          balance: user.coinBalance,
          reason: 'Current balance',
          date: new Date(),
          t: Date.now(),
        },
      ];
    }

    const firstSnapshot = snapshots[0];
    if (firstSnapshot && firstSnapshot.reason !== 'Account created' && firstSnapshot.delta !== 0) {
      points.unshift({
        id: 'starting',
        balance: Math.max(0, firstSnapshot.balance - firstSnapshot.delta),
        reason: 'Balance before tracking',
        date: new Date(firstSnapshot.createdAt.toMillis() - 1),
        t: firstSnapshot.createdAt.toMillis() - 1,
      });
    }

    const latest = points[points.length - 1];
    if (!latest || latest.balance !== user.coinBalance) {
      points.push({
        id: 'current',
        balance: user.coinBalance,
        reason: 'Current balance',
        date: new Date(),
        t: Date.now(),
      });
    }
    return points;
  }, [snapshots, user]);

  const domain = useMemo(() => {
    const balances = data.map((point) => point.balance);
    const min = Math.min(...balances);
    const max = Math.max(...balances);
    const padding = Math.max(25, Math.round((max - min) * 0.15));
    return [Math.max(0, min - padding), max + padding] as [number, number];
  }, [data]);

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 10, bottom: 0, left: 2 }}>
          <CartesianGrid vertical={false} stroke="#e5e8e1" strokeDasharray="3 4" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(value) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value))}
            minTickGap={34}
            tick={{ fill: '#6b716c', fontSize: 11, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={domain}
            tickFormatter={compactCoins}
            width={48}
            tick={{ fill: '#6b716c', fontSize: 11, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: '#2f7d63', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-md border border-line bg-white px-3 py-2 shadow-lift">
                  <p className="text-xs font-semibold text-ink/45">
                    {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(point.date)}
                  </p>
                  <p className="mt-1 text-base font-black text-mint">{point.balance.toLocaleString()} coins</p>
                  <p className="max-w-52 text-xs text-ink/55">{point.reason}</p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#2f7d63"
            strokeWidth={3}
            fill="#dceee8"
            fillOpacity={0.8}
            activeDot={{ r: 5, fill: '#2f7d63', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
