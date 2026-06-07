import { CheckCircle2, Lock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CoinAmount } from './CoinAmount';
import type { Bet, Prediction } from '../types';
import { betTypeMeta, betTypeLabel } from '../utils/betTypes';
import { percent, relativeTime } from '../utils/format';

const optionColors = [
  { bar: 'bg-mint',   text: 'text-mint',   tile: 'bg-mint/10'   },
  { bar: 'bg-sky',    text: 'text-sky',    tile: 'bg-sky/10'    },
  { bar: 'bg-coral',  text: 'text-coral',  tile: 'bg-coral/10'  },
  { bar: 'bg-plum',   text: 'text-plum',   tile: 'bg-plum/10'   },
  { bar: 'bg-citrus', text: 'text-citrus', tile: 'bg-citrus/10' },
];

export function BetCard({ bet, prediction }: { bet: Bet; prediction?: Prediction }) {
  const isOpen = bet.status === 'open';
  const meta = betTypeMeta[bet.type];
  const TypeIcon = meta.icon;

  const sortedChances = [...bet.chanceSummary].sort((a, b) => b.chance - a.chance);
  const displayOptions = sortedChances.slice(0, 3);
  const remainingCount = sortedChances.length - displayOptions.length;

  return (
    <Link
      to={`/bets/${bet.id}`}
      className="animate-soft-enter block overflow-hidden rounded-2xl border border-line bg-white shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-lift"
    >
      {/* Image banner (only when image exists) */}
      {bet.imageUrl ? (
        <div className="relative h-32 w-full overflow-hidden sm:h-36">
          <img src={bet.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
            <span className="line-clamp-2 text-sm font-black leading-snug text-white drop-shadow">
              {bet.title}
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black ${isOpen ? 'bg-mint text-white' : 'bg-white/30 text-white backdrop-blur-sm'}`}>
              {isOpen ? 'Open' : 'Closed'}
            </span>
          </div>
        </div>
      ) : null}

      {/* Header row */}
      <div className={`flex items-center gap-3 px-4 ${bet.imageUrl ? 'pt-3 pb-0' : 'pt-4 pb-0'}`}>
        <div className={`shrink-0 grid h-9 w-9 place-items-center rounded-xl ${meta.bg}`}>
          <TypeIcon size={16} className={meta.color} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink/45">{betTypeLabel(bet.type)}</span>
            {bet.deadline ? <span className="text-xs text-ink/35">{relativeTime(bet.deadline)}</span> : null}
            {bet.visibility === 'private' ? <Lock size={11} className="text-ink/35" /> : null}
          </div>
          {!bet.imageUrl ? (
            <p className="mt-0.5 line-clamp-2 text-sm font-black leading-snug">{bet.title}</p>
          ) : null}
        </div>
        {!bet.imageUrl ? (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black ${isOpen ? 'bg-mint/12 text-mint' : 'bg-line text-ink/45'}`}>
            {isOpen ? 'Open' : 'Closed'}
          </span>
        ) : null}
      </div>

      {/* Options / chances */}
      <div className="px-4 pt-3">
        {displayOptions.length > 0 ? (
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(displayOptions.length, 3)}, 1fr)` }}>
            {displayOptions.map((s, i) => {
              const option = bet.options.find((o) => o.id === s.optionId);
              const col = optionColors[i % optionColors.length];
              return (
                <div key={s.optionId} className={`rounded-xl px-2.5 py-2 ${col.tile}`}>
                  <p className="truncate text-xs text-ink/55">{option?.label ?? s.optionId}</p>
                  <p className={`mt-0.5 text-sm font-black ${col.text}`}>{percent(s.chance)}</p>
                </div>
              );
            })}
            {remainingCount > 0 ? (
              <div className="rounded-xl bg-field px-2.5 py-2">
                <p className="text-xs text-ink/40">+{remainingCount}</p>
                <p className="mt-0.5 text-sm font-black text-ink/30">more</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-ink/40 italic">Each player submits their own guess</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-3 text-xs text-ink/45 mt-2">
        <span className="inline-flex items-center gap-1">
          <Users size={12} /> {bet.predictionCount}
        </span>
        <CoinAmount amount={bet.totalCoinsStaked} className="text-xs" />
        {prediction ? (
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-mint">
            <CheckCircle2 size={12} /> Predicted
          </span>
        ) : null}
      </div>
    </Link>
  );
}
