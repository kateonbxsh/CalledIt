import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Coins, Crosshair, Target, Trophy, TrendingUp } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { BalanceHistoryChart } from '../components/BalanceHistoryChart';
import { CoinAmount } from '../components/CoinAmount';
import { PageHeader } from '../components/PageHeader';
import { RankBadge } from '../components/RankBadge';
import { db } from '../lib/firebase';
import { listBalanceHistory } from '../services/balanceService';
import type { BalanceSnapshot, UserProfile } from '../types';
import { rankForRating } from '../utils/ranks';

export function ProfilePage() {
  const { uid } = useParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [history, setHistory] = useState<BalanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    Promise.all([
      getDoc(doc(db, 'users', uid)),
      listBalanceHistory(uid).catch(() => []),
    ]).then(([snap, snapshots]) => {
      setUser(snap.exists() ? (snap.data() as UserProfile) : null);
      setHistory(snapshots);
    }).finally(() => setLoading(false));
  }, [uid]);

  const maximumBalance = useMemo(() => {
    if (!user) return 0;
    return Math.max(
      user.coinBalance,
      user.stats.maxBalance ?? 0,
      ...history.map((snapshot) => snapshot.balance),
    );
  }, [history, user]);

  if (loading) return <PageHeader title="Profile" description="Loading profile..." back />;
  if (!user) return <PageHeader title="Profile" description="This profile could not be found." back />;

  return (
    <>
      <PageHeader title="Profile" back />
      <section className="mb-4 rounded-md border border-line bg-white p-4 shadow-soft sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={user.displayName} src={user.photoURL} size="lg" />
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-black sm:text-3xl">{user.displayName}</h1>
              <p className="text-sm font-semibold text-ink/45">@{user.username}</p>
              {user.bio ? <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">{user.bio}</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
            <RankBadge rank={rankForRating(user.rating)} />
            <p className="text-sm font-black text-ink/55">{user.rating} ELO</p>
          </div>
        </div>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          { label: 'Balance', value: <CoinAmount amount={user.coinBalance} className="text-xl" />, icon: Coins },
          { label: 'Maximum', value: <CoinAmount amount={maximumBalance} className="text-xl" />, icon: TrendingUp },
          { label: 'Record', value: `${user.stats.wins}-${user.stats.losses}`, icon: Trophy },
          { label: 'Accuracy', value: `${user.stats.accuracy}%`, icon: Target },
          { label: 'Best upset', value: `${user.stats.bestUpsetWin}%`, icon: Crosshair },
          { label: 'Predictions', value: user.stats.totalBets, icon: Coins },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-md border border-line bg-white p-3 shadow-soft sm:p-4">
            <div className="flex items-center gap-2 text-ink/40">
              <Icon size={15} />
              <p className="text-xs font-black uppercase">{label}</p>
            </div>
            <div className="mt-2 text-xl font-black">{value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-md border border-line bg-white p-4 shadow-soft sm:p-5">
        <div className="mb-2">
          <h2 className="font-black">Balance progress</h2>
        </div>
        <BalanceHistoryChart user={user} snapshots={history} />
      </section>
    </>
  );
}
