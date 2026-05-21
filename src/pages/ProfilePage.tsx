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

  if (!user) return <PageHeader title="Profile" description="Loading profile..." />;

  return (
    <>
      <div className="mb-5 flex items-center gap-4">
        <Avatar name={user.displayName} src={user.photoURL} size="lg" />
        <div>
          <PageHeader title={user.displayName} description={`@${user.username}`} />
          <RankBadge rank={rankForRating(user.rating)} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
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
