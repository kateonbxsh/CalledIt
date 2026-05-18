import { useEffect, useMemo, useState } from 'react';
import { Clock3, ImageIcon, Trophy, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CoinAmount } from '../components/CoinAmount';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import { getBetsByIds, listMyPredictions } from '../services/betService';
import type { Bet, Prediction } from '../types';
import { relativeTime } from '../utils/format';

type HistoryStatus = 'pending' | 'won' | 'lost';
type HistoryFilter = 'all' | HistoryStatus;

type HistoryRow = {
  prediction: Prediction;
  bet?: Bet;
  status: HistoryStatus;
};

const filters: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];

function inferStatus(prediction: Prediction, bet?: Bet): HistoryStatus {
  if (prediction.status === 'won' || prediction.status === 'lost' || prediction.status === 'pending') {
    return prediction.status;
  }

  if (bet?.status === 'resolved' && bet.resolution) {
    return prediction.optionId === bet.resolution.winningOptionId ? 'won' : 'lost';
  }

  return 'pending';
}

function DeltaText({
  value,
  suffix,
  empty,
}: {
  value?: number;
  suffix?: string;
  empty: string;
}) {
  if (typeof value !== 'number') {
    return <span className="text-sm font-bold text-ink/40">{empty}</span>;
  }

  const isPositive = value >= 0;
  return (
    <span className={`text-sm font-black ${isPositive ? 'text-mint' : 'text-coral'}`}>
      {isPositive ? '+' : ''}
      {value}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}

function CoinDelta({ value }: { value?: number }) {
  if (typeof value !== 'number') {
    return <span className="text-sm font-bold text-ink/40">Coins pending</span>;
  }

  const isPositive = value >= 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`text-sm font-black ${isPositive ? 'text-mint' : 'text-coral'}`}>
        {isPositive ? '+' : '-'}
      </span>
      <CoinAmount amount={Math.abs(value)} className="text-sm" />
    </span>
  );
}

function StatusBadge({ status }: { status: HistoryStatus }) {
  const styles = {
    pending: 'bg-ink/8 text-ink/60',
    won: 'bg-mint/12 text-mint',
    lost: 'bg-coral/12 text-coral',
  };
  const Icon = status === 'won' ? Trophy : status === 'lost' ? XCircle : Clock3;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black ${styles[status]}`}>
      <Icon size={13} />
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

function HistoryItem({ row }: { row: HistoryRow }) {
  const { prediction, bet, status } = row;
  const option = bet?.options.find((item) => item.id === prediction.optionId);

  return (
    <Link
      to={`/bets/${prediction.betId}`}
      className="animate-soft-enter grid grid-cols-[72px_1fr] overflow-hidden rounded-md border border-line bg-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-lift sm:grid-cols-[92px_1fr_auto]"
    >
      <div className="min-h-24 bg-field">
        {bet?.imageUrl ? (
          <img src={bet.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full min-h-24 place-items-center text-ink/35">
            <ImageIcon size={22} />
          </div>
        )}
      </div>

      <div className="min-w-0 p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-xs font-semibold text-ink/45">{relativeTime(prediction.createdAt)}</span>
        </div>
        <h2 className="truncate text-base font-black">{bet?.title ?? 'Bet unavailable'}</h2>
        <p className="mt-1 truncate text-sm text-ink/60">
          Picked <span className="font-bold text-ink/75">{option?.label ?? prediction.optionId}</span>
        </p>
      </div>

      <div className="col-span-2 grid grid-cols-3 gap-2 border-t border-line p-3 text-sm sm:col-span-1 sm:w-56 sm:border-l sm:border-t-0 sm:p-4">
        <div>
          <p className="text-xs font-bold text-ink/40">Stake</p>
          <CoinAmount amount={prediction.stake} className="mt-1 text-sm" />
        </div>
        <div>
          <p className="text-xs font-bold text-ink/40">ELO</p>
          <div className="mt-1">
            <DeltaText value={prediction.ratingDelta} suffix="ELO" empty="ELO pending" />
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-ink/40">Coins</p>
          <div className="mt-1">
            <CoinDelta value={prediction.coinDelta} />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function PredictionHistoryPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    setLoading(true);
    listMyPredictions(profile.uid)
      .then(async (predictions) => {
        const betsById = await getBetsByIds(predictions.map((prediction) => prediction.betId));
        const nextRows = predictions
          .map((prediction) => {
            const bet = betsById.get(prediction.betId);
            return {
              prediction,
              bet,
              status: inferStatus(prediction, bet),
            };
          })
          .sort((left, right) => right.prediction.createdAt.toMillis() - left.prediction.createdAt.toMillis());
        setRows(nextRows);
      })
      .finally(() => setLoading(false));
  }, [profile]);

  const counts = useMemo(
    () =>
      filters.reduce(
        (result, filter) => ({
          ...result,
          [filter.id]: filter.id === 'all' ? rows.length : rows.filter((row) => row.status === filter.id).length,
        }),
        {} as Record<HistoryFilter, number>,
      ),
    [rows],
  );
  const visibleRows = activeFilter === 'all' ? rows : rows.filter((row) => row.status === activeFilter);

  return (
    <>
      <PageHeader title="Prediction History" />

      <div className="mb-4 inline-grid grid-cols-4 rounded-md border border-line bg-white p-1 shadow-soft">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActiveFilter(filter.id)}
            className={`rounded px-3 py-2 text-sm font-black transition ${
              activeFilter === filter.id ? 'bg-ink text-white' : 'text-ink/60 hover:bg-field hover:text-ink'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {filter.label}
              <span className="text-xs opacity-70">{counts[filter.id] ?? 0}</span>
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-md bg-white" />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          title={`No ${activeFilter} predictions`}
          body="Your predictions will show up here once you start playing."
        />
      ) : (
        <div className="grid gap-3">
          {visibleRows.map((row) => (
            <HistoryItem key={row.prediction.id} row={row} />
          ))}
        </div>
      )}
    </>
  );
}
