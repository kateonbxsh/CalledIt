import { CheckCircle2, ImageIcon, Lock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CoinAmount } from './CoinAmount';
import type { Bet, Prediction } from '../types';
import { betTypeLabel } from '../utils/betTypes';
import { percent, relativeTime } from '../utils/format';

export function BetCard({ bet, prediction }: { bet: Bet; prediction?: Prediction }) {
  const topChance = [...bet.chanceSummary].sort((left, right) => right.chance - left.chance)[0];
  const topOption = bet.options.find((option) => option.id === topChance?.optionId);
  const isOpen = bet.status === 'open';

  return (
    <Link
      to={`/bets/${bet.id}`}
      className="animate-soft-enter grid grid-cols-[86px_1fr] overflow-hidden rounded-md border border-line bg-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-lift sm:grid-cols-[112px_1fr]"
    >
      <div className="relative h-full min-h-28 bg-field">
        {bet.imageUrl ? (
          <img src={bet.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-ink/35">
            <ImageIcon size={24} />
          </div>
        )}
        {bet.visibility === 'private' ? (
          <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-coral shadow-sm">
            <Lock size={14} />
          </span>
        ) : null}
      </div>

      <div className="min-w-0 p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-1 font-black ${isOpen ? 'bg-mint/12 text-mint' : 'bg-coral/12 text-coral'}`}>
            {isOpen ? 'Open' : 'Closed'}
          </span>
          <span className="rounded-full bg-field px-2 py-1 font-semibold text-ink/60">
            {betTypeLabel(bet.type)}
          </span>
          {bet.deadline && <span className="text-ink/50">{relativeTime(bet.deadline)}</span>}
        </div>

        <h2 className="truncate text-base font-black sm:text-lg">{bet.title}</h2>
        <p className="mt-1 line-clamp-1 text-sm text-ink/60">{bet.description || '—'}</p>

        <div className="mt-3 grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 text-xs text-ink/55">
          <span className="inline-flex items-center gap-1">
            <Users size={14} /> {bet.predictionCount}
          </span>
          <CoinAmount amount={bet.totalCoinsStaked} className="text-xs" />
          {topChance && topOption ? (
            <span className="justify-self-end truncate rounded-full bg-field px-2 py-1 text-xs font-black text-ink/70">
              {topOption.label} - {percent(topChance.chance)}
            </span>
          ) : null}
          {prediction ? (
            <span className="inline-flex items-center gap-1 text-mint">
              <CheckCircle2 size={14} /> Picked
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
