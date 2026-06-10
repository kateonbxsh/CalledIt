import { useEffect, useState } from 'react';
import { BetCard } from '../components/BetCard';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { listMyBets } from '../services/betService';
import { listMyFriendGroups } from '../services/friendGroupService';
import type { Bet, FriendGroup } from '../types';

export function MyBetsPage() {
  const { profile } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    Promise.all([listMyBets(profile.uid), listMyFriendGroups(profile)])
      .then(([nextBets, nextGroups]) => {
        setBets(nextBets);
        setGroups(nextGroups);
      })
      .finally(() => setLoading(false));
  }, [profile]);

  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));

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
            <BetCard key={bet.id} bet={bet} groupName={bet.groupId ? groupNameById.get(bet.groupId) : undefined} />
          ))}
        </div>
      )}
    </>
  );
}
