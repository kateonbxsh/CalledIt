import { useEffect, useState } from 'react';
import { BetCard } from '../components/BetCard';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { listMyBets } from '../services/betService';
import type { Bet } from '../types';

export function MyBetsPage() {
  const { profile } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    listMyBets(profile.uid)
      .then(setBets)
      .finally(() => setLoading(false));
  }, [profile]);

  return (
    <>
      <PageHeader title="My Bets" />
      {loading ? (
        <div className="h-48 animate-pulse rounded-md bg-white" />
      ) : bets.length === 0 ? (
        <EmptyState title="You have not created a bet" body="Start with a simple yes/no prediction." />
      ) : (
        <div className="grid gap-3">
          {bets.map((bet) => (
            <BetCard key={bet.id} bet={bet} />
          ))}
        </div>
      )}
    </>
  );
}
