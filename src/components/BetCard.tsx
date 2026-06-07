import { CheckCircle2, ImageIcon, Lock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CoinAmount } from './CoinAmount';
import type { Bet, Prediction } from '../types';
import { betTypeLabel } from '../utils/betTypes';
import { percent, relativeTime } from '../utils/format';

export function BetCard({ bet, prediction }: { bet: Bet; prediction?: Prediction }) {
  const topChance = [...bet.chanceSummary].sort((l, r) => r.chance - l.chance)[0];
  const topOption = bet.options.find((o) => o.id === topChance?.optionId);
  const isOpen = bet.status === 'open';

  return (
    <Link
      to={`/bets/${bet.id}`}
      className="animate-soft-enter grid grid-cols-[96px_1fr] overflow-hidden rounded-2xl border border-line bg-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-lift sm:grid-cols-[120px_1fr]"
    >
      {/* Thumbnail */}
      <div className="relative h-full min-h-32 bg-gradient-to-br from-field to-line/40">
        {bet.imageUrl ? (
          <img src={bet.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-ink/20">
            <ImageIcon size={28} />
          </div>
        )}
        {bet.visibility === 'private' ? (
          <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-coral shadow-sm backdrop-blur-sm">
            <Lock size={13} />
          </span>
        ) : null}
        {prediction ? (
          <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-mint shadow-sm backdrop-blur-sm">
            <CheckCircle2 size={13} />
          </span>
        ) : null}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-col p-3.5 sm:p-4">
        {/* Badges row */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className={`rounded-full px-2.5 py-0.5 font-black ${
              isOpen ? 'bg-mint/12 text-mint' : 'bg-line text-ink/50'
            }`}
          >
            {isOpen ? 'Open' : 'Closed'}
          </span>
          <span className="rounded-full bg-field px-2.5 py-0.5 font-semibold text-ink/55">
            {betTypeLabel(bet.type)}
          </span>
          {bet.deadline ? (
            <span className="text-ink/40">{relativeTime(bet.deadline)}</span>
          ) : null}
        </div>

        <h2 className="line-clamp-2 text-base font-black leading-snug sm:text-[17px]">
          {bet.title}
        </h2>
        {bet.description ? (
          <p className="mt-1 line-clamp-1 text-sm text-ink/50">{bet.description}</p>
        ) : null}

        {/* Footer row */}
        <div className="mt-auto flex items-center gap-3 pt-3 text-xs text-ink/45">
          <span className="inline-flex items-center gap-1">
            <Users size={13} />
            {bet.predictionCount}
          </span>
          <CoinAmount amount={bet.totalCoinsStaked} className="text-xs" />
          {topChance && topOption ? (
            <span className="ml-auto truncate rounded-full border border-line bg-field px-2.5 py-0.5 text-xs font-bold text-ink/65">
              {topOption.label} {percent(topChance.chance)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
