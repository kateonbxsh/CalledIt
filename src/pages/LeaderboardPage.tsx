import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { CoinAmount } from '../components/CoinAmount';
import { ELORating } from '../components/ELORating';
import { PageHeader } from '../components/PageHeader';
import { RankLegend } from '../components/RankLegend';
import { getLeaderboard } from '../services/userService';
import type { UserProfile } from '../types';
import { rankForRating } from '../utils/ranks';

const podiumGradients = [
  'from-[#d49a25]/20 via-[#f5c842]/10 to-transparent border-[#d49a25]/30',  // 1st — gold
  'from-[#8c98a5]/15 via-[#c0ccd4]/8 to-transparent border-[#8c98a5]/25',   // 2nd — silver
  'from-[#8f5f3d]/15 via-[#c49070]/8 to-transparent border-[#8f5f3d]/25',   // 3rd — bronze
];

const podiumNumbers = [
  <span key="1" className="text-[#d49a25] font-black text-lg">🥇</span>,
  <span key="2" className="text-[#8c98a5] font-black text-lg">🥈</span>,
  <span key="3" className="text-[#8f5f3d] font-black text-lg">🥉</span>,
];

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

      {/* Rank legend */}
      <div className="mb-6">
        <RankLegend />
      </div>

      {/* Player list */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {loading ? (
          <div className="space-y-px">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse bg-white" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-line/60">
            {users.map((user, index) => {
              const rank = rankForRating(user.rating);
              const isPodium = index < 3;
              const gradient = isPodium ? podiumGradients[index] : null;

              return (
                <div
                  key={user.uid}
                  className={`relative flex items-center gap-3 px-4 py-3 ${
                    isPodium ? `bg-gradient-to-r ${gradient} border-l-2` : ''
                  }`}
                >
                  {/* Position */}
                  <div className="w-8 shrink-0 text-center">
                    {isPodium
                      ? podiumNumbers[index]
                      : <span className="text-sm font-bold text-ink/35">#{index + 1}</span>
                    }
                  </div>

                  {/* Avatar */}
                  <Avatar name={user.displayName} src={user.photoURL} round />

                  {/* Name + username */}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-bold ${isPodium ? 'text-ink' : 'text-ink/80'}`}>
                      {user.displayName}
                    </p>
                    <p className="truncate text-xs text-ink/40">@{user.username}</p>
                  </div>

                  {/* Right side: ELO rating + coins */}
                  <div className="shrink-0 space-y-2">
                    <ELORating rating={user.rating} />
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
