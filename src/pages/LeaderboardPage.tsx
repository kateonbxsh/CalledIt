import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { CoinAmount } from '../components/CoinAmount';
import { PageHeader } from '../components/PageHeader';
import { RankBadge } from '../components/RankBadge';
import { getLeaderboard } from '../services/userService';
import type { UserProfile } from '../types';
import { rankForRating, rankRanges } from '../utils/ranks';

export function LeaderboardPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader title="Leaderboard" />
      <div className="mb-4 rounded-md border border-line bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-black">Rating/ELO ranges</p>
          <p className="text-xs font-semibold text-ink/55">1000 starts Bronze</p>
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
          {rankRanges.map((item) => (
            <div key={item.rank} className="flex items-center justify-between gap-1 rounded-md border border-line bg-field px-1.5 py-1">
              <RankBadge rank={item.rank} />
              <span className="truncate text-[10px] font-semibold text-ink/55">{item.range.replace(' ELO', '')}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-line bg-white">
        {loading ? (
          <div className="h-56 animate-pulse bg-white" />
        ) : (
          <div className="divide-y divide-line">
            {users.map((user, index) => {
              const rank = rankForRating(user.rating);
              return (
                <div key={user.uid} className="grid grid-cols-[36px_44px_1fr_auto] items-center gap-3 p-3 sm:p-4">
                  <span className="text-sm font-bold text-ink/50">#{index + 1}</span>
                  <Avatar name={user.displayName} src={user.photoURL} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{user.displayName}</p>
                    <p className="truncate text-sm text-ink/55">@{user.username}</p>
                  </div>
                  <div className="text-right">
                    <div className="mb-1 flex justify-end">
                      <RankBadge rank={rank} />
                    </div>
                    <p className="text-sm font-black">{user.rating} ELO</p>
                    <CoinAmount amount={user.coinBalance} className="justify-end text-xs" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
