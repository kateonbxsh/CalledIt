import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { BetCard } from '../components/BetCard';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { listFeedBets, listMyPredictions, lockExpiredBet } from '../services/betService';
import type { Bet, Prediction } from '../types';

export function FeedPage({ scope }: { scope: 'public' | 'private' }) {
  const { profile } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!profile) return;
      setLoading(true);
      try {
        const [nextBets, nextPredictions] = await Promise.all([
          listFeedBets(scope, profile),
          listMyPredictions(profile.uid),
        ]);
        await Promise.all(nextBets.map(lockExpiredBet));
        if (active) {
          setBets(nextBets);
          setPredictions(nextPredictions);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load bets.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [profile, scope]);

  const predictionByBet = new Map(predictions.map((prediction) => [prediction.betId, prediction]));
  const visibleBets = bets.filter((bet) => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return true;
    return [bet.title, bet.description, bet.category, bet.creatorUsername]
      .join(' ')
      .toLowerCase()
      .includes(normalized);
  });

  return (
    <>
      <PageHeader
        title={scope === 'public' ? 'Public Bets' : 'Private Bets'}
        action={
          <Link
            to="/create"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus size={17} /> Create
          </Link>
        }
      />
      <input
        className="mb-4 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-mint"
        placeholder="Search loaded bets"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {error ? <p className="mb-4 rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-64 animate-pulse rounded-md bg-white" />
          ))}
        </div>
      ) : visibleBets.length === 0 ? (
        <EmptyState title="No bets here yet" body="Create one or wait for an invite." />
      ) : (
        <div className="grid gap-3">
          {visibleBets.map((bet) => (
            <BetCard key={bet.id} bet={bet} prediction={predictionByBet.get(bet.id)} />
          ))}
        </div>
      )}
    </>
  );
}
