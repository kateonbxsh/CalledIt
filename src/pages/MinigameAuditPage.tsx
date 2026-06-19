import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, RefreshCw, Search } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { CoinAmount } from '../components/CoinAmount';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import {
  listMinigameEvents,
  type MinigameAuditEvent,
  type MinigameAuditPage as MinigameAuditPageResult,
  type MinigameKind,
} from '../services/minigameAuditService';
import { relativeTime } from '../utils/format';

type GameFilter = 'all' | MinigameKind;

const games: Array<{ id: GameFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mines', label: 'Mines' },
  { id: 'plane', label: 'Plane' },
  { id: 'guessing', label: 'Guessing' },
  { id: 'plinko', label: 'Plinko' },
];

const gameLabels: Record<MinigameKind, string> = {
  mines: 'Mines',
  plane: 'Sky Landing',
  guessing: 'Number Guessing',
  plinko: 'Plinko Drop',
};

const actionLabels: Record<string, string> = {
  round_started: 'Started',
  tile_revealed: 'Tile',
  cash_out: 'Cashed out',
  board_cleared: 'Cleared board',
  round_lost: 'Lost',
  guess_submitted: 'Guessed',
  round_settled: 'Settled',
  launched: 'Launched',
  round_finished: 'Finished',
  chip_dropped: 'Dropped',
  chip_settled: 'Landed',
};

function eventTime(event: MinigameAuditEvent) {
  return event.createdAt?.toMillis?.() ?? 0;
}

function sessionSummary(events: MinigameAuditEvent[]) {
  return events.find((event) => (
    event.action === 'round_finished'
    || event.action === 'round_settled'
    || event.action === 'cash_out'
    || event.action === 'board_cleared'
    || event.action === 'round_lost'
    || event.action === 'chip_settled'
  )) ?? events[0];
}

function resultStyle(result?: string) {
  if (result === 'won' || result === 'safe' || result === 'correct') return 'bg-mint/10 text-mint';
  if (result === 'lost' || result === 'mine') return 'bg-coral/10 text-coral';
  return 'bg-ink/5 text-ink/55';
}

export function MinigameAuditPage() {
  const { profile } = useAuth();
  const allowed = profile?.username === 'xaouab';
  const [events, setEvents] = useState<MinigameAuditEvent[]>([]);
  const [game, setGame] = useState<GameFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const cursorRef = useRef<MinigameAuditPageResult['cursor']>(null);

  const load = useCallback(async (reset: boolean) => {
    if (!allowed) return;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError('');
    try {
      const page = await listMinigameEvents(reset ? null : cursorRef.current);
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
      setEvents((current) => {
        const combined = reset ? page.events : [...current, ...page.events];
        return [...new Map(combined.map((event) => [event.id, event])).values()];
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the game audit.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [allowed]);

  useEffect(() => {
    if (allowed) void load(true);
  }, [allowed, load]);

  const sessions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = events.filter((event) => {
      if (game !== 'all' && event.game !== game) return false;
      if (!needle) return true;
      return event.username.toLowerCase().includes(needle)
        || event.displayName.toLowerCase().includes(needle)
        || event.choice?.toLowerCase().includes(needle);
    });
    const grouped = new Map<string, MinigameAuditEvent[]>();
    for (const event of filtered) {
      const current = grouped.get(event.sessionId) ?? [];
      current.push(event);
      grouped.set(event.sessionId, current);
    }
    return [...grouped.entries()].map(([sessionId, sessionEvents]) => ({
      sessionId,
      events: sessionEvents.sort((left, right) => eventTime(left) - eventTime(right)),
      newest: Math.max(...sessionEvents.map(eventTime)),
    })).sort((left, right) => right.newest - left.newest);
  }, [events, game, search]);

  if (!profile) return null;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <>
      <PageHeader
        title="Minigame Audit"
        description="Every played round, choice, and settlement."
        action={(
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white text-ink/60 shadow-soft transition hover:text-ink disabled:opacity-45"
            title="Refresh audit"
            aria-label="Refresh audit"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search user or choice"
            className="h-11 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-ink/35"
          />
        </label>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-line bg-white p-1 shadow-soft">
          {games.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGame(item.id)}
              className={`shrink-0 rounded px-3 py-2 text-xs font-black transition ${
                game === item.id ? 'bg-ink text-white' : 'text-ink/55 hover:bg-field hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mb-4 rounded-md bg-coral/10 p-3 text-sm font-bold text-coral">{error}</p> : null}

      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-md bg-white" />)}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState title="No game activity" body="New minigame sessions will appear here." />
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => {
            const first = session.events[0];
            const summary = sessionSummary([...session.events].reverse());
            const newestEvent = session.events.at(-1) ?? first;
            return (
              <article key={session.sessionId} className="animate-soft-enter overflow-hidden rounded-md border border-line bg-white shadow-soft">
                <div className="flex min-w-0 items-center gap-3 border-b border-line px-3 py-3 sm:px-4">
                  <Avatar name={first.displayName} round />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-sm font-black">{first.displayName}</p>
                      <p className="truncate text-xs font-bold text-ink/40">@{first.username}</p>
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-ink/40" title={newestEvent.createdAt?.toDate?.().toLocaleString()}>
                      {newestEvent.createdAt ? relativeTime(newestEvent.createdAt) : 'Just now'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-sky/10 px-2.5 py-1 text-xs font-black text-sky">
                    {gameLabels[first.game]}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-field/70 px-3 py-2.5 text-xs sm:px-4">
                  {typeof summary.stake === 'number' ? (
                    <span><span className="font-bold text-ink/40">Stake</span> <CoinAmount amount={summary.stake} className="ml-1 text-xs" /></span>
                  ) : null}
                  {typeof summary.payout === 'number' ? (
                    <span><span className="font-bold text-ink/40">Payout</span> <CoinAmount amount={summary.payout} className="ml-1 text-xs" /></span>
                  ) : null}
                  {typeof summary.multiplier === 'number' ? (
                    <span className="font-black"><span className="mr-1 font-bold text-ink/40">Mult</span>{summary.multiplier.toFixed(2)}x</span>
                  ) : null}
                  {typeof summary.ratingDelta === 'number' ? (
                    <span className={`font-black ${summary.ratingDelta > 0 ? 'text-mint' : summary.ratingDelta < 0 ? 'text-coral' : 'text-ink/40'}`}>
                      {summary.ratingDelta > 0 ? '+' : ''}{summary.ratingDelta} ELO
                    </span>
                  ) : null}
                </div>

                <div className="divide-y divide-line/70 px-3 sm:px-4">
                  {session.events.map((event) => (
                    <div key={event.id} className="flex min-w-0 items-center gap-2 py-2 text-xs">
                      <span className={`shrink-0 rounded-full px-2 py-1 font-black ${resultStyle(event.result)}`}>
                        {actionLabels[event.action] ?? event.action.split('_').join(' ')}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink/65" title={event.choice}>
                        {event.choice ?? 'No choice recorded'}
                      </span>
                      {typeof event.multiplier === 'number' && event.action !== 'round_started' && event.action !== 'launched' ? (
                        <span className="shrink-0 font-black text-ink/45">{event.multiplier.toFixed(2)}x</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {hasMore && !loading ? (
        <button
          type="button"
          onClick={() => void load(false)}
          disabled={loadingMore}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-3 text-sm font-black text-ink/65 shadow-soft transition hover:text-ink disabled:opacity-45"
        >
          <Activity size={16} /> {loadingMore ? 'Loading...' : 'Load older activity'}
        </button>
      ) : null}
    </>
  );
}
