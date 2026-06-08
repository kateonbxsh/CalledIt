import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { BetCard } from '../components/BetCard';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { listFeedBets, listMyPredictions, lockExpiredBet } from '../services/betService';
import { listMyFriendGroups } from '../services/friendGroupService';
import type { Bet, FriendGroup, Prediction } from '../types';

type FeedTab = 'all' | 'private' | string;

export function FeedPage() {
  const { profile } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [activeTab, setActiveTab] = useState<FeedTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!profile) return;
      setLoading(true);
      try {
        const [nextBets, nextPredictions, nextGroups] = await Promise.all([
          Promise.all([listFeedBets('public', profile), listFeedBets('private', profile)]),
          listMyPredictions(profile.uid),
          listMyFriendGroups(profile),
        ]);
        const mergedBets = [...new Map(nextBets.flat().map((bet) => [bet.id, bet])).values()];
        await Promise.all(mergedBets.map(lockExpiredBet));
        const activeBets = mergedBets.map((bet) => (
          bet.status === 'open' && bet.deadline && Date.now() >= bet.deadline.toMillis()
            ? { ...bet, status: 'locked' as const }
            : bet
        ));
        if (active) {
          setBets(activeBets.filter((b) => b.status !== 'resolved'));
          setPredictions(nextPredictions);
          setGroups(nextGroups);
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
  }, [profile]);

  const predictionByBet = new Map(predictions.map((prediction) => [prediction.betId, prediction]));

  const tabFilteredBets = bets.filter((bet) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'private') return bet.visibility === 'private';
    return bet.groupId === activeTab;
  });

  const visibleBets = tabFilteredBets.filter((bet) => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return true;
    return [bet.title, bet.description, bet.category, bet.creatorUsername]
      .join(' ')
      .toLowerCase()
      .includes(normalized);
  });

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'private', label: 'Private' },
    ...groups.map((group) => ({ id: group.id, label: group.name })),
  ];

  return (
    <>
      <PageHeader
        title="Bets"
        action={
          <Link
            to="/create"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus size={17} /> Create
          </Link>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                activeTab === tab.id ? 'bg-ink text-white' : 'bg-white text-ink/70 border border-line'
              }`}
            >
              {tab.label}
            </button>
        ))}
      </div>

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
