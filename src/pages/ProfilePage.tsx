import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Avatar } from '../components/Avatar';
import { CoinAmount } from '../components/CoinAmount';
import { PageHeader } from '../components/PageHeader';
import { RankBadge } from '../components/RankBadge';
import { db } from '../lib/firebase';
import type { UserProfile } from '../types';
import { rankForRating } from '../utils/ranks';

export function ProfilePage() {
  const { uid } = useParams();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then((snap) => {
      setUser(snap.exists() ? (snap.data() as UserProfile) : null);
    });
  }, [uid]);

  if (!user) return <PageHeader title="Profile" description="Loading profile..." back />;

  return (
    <>
      <PageHeader title="Profile" back />
      <section className="mb-4 overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        <div className="h-20 bg-gradient-to-r from-mint/20 via-sky/15 to-citrus/20" />
        <div className="-mt-9 px-4 pb-4">
          <Avatar name={user.displayName} src={user.photoURL} size="lg" />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-black">{user.displayName}</h1>
              <p className="text-sm font-semibold text-ink/45">@{user.username}</p>
            </div>
            <RankBadge rank={rankForRating(user.rating)} />
          </div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm text-ink/55">Rating/ELO</p>
          <p className="mt-1 text-2xl font-black">{user.rating}</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm text-ink/55">Coins</p>
          <CoinAmount amount={user.coinBalance} className="mt-1 text-2xl" />
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm text-ink/55">Accuracy</p>
          <p className="mt-1 text-2xl font-black">{user.stats.accuracy}%</p>
        </div>
        <div className="rounded-md border border-line bg-white p-4">
          <p className="text-sm text-ink/55">Best upset</p>
          <p className="mt-1 text-2xl font-black">{user.stats.bestUpsetWin}%</p>
        </div>
      </div>
      <div className="mt-4 rounded-md border border-line bg-white p-4">
        <h2 className="mb-2 font-bold">Bio</h2>
        <p className="text-sm text-ink/70">{user.bio || 'No status yet.'}</p>
      </div>
    </>
  );
}
