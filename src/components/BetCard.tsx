import { CheckCircle2, Lock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CoinAmount } from './CoinAmount';
import type { Bet, Prediction } from '../types';
import { betTypeMeta, betTypeLabel } from '../utils/betTypes';
import { percent, relativeTime } from '../utils/format';

const optionColors = [
  { text: 'text-mint',   tile: 'bg-mint/10'   },
  { text: 'text-sky',    tile: 'bg-sky/10'    },
  { text: 'text-coral',  tile: 'bg-coral/10'  },
  { text: 'text-plum',   tile: 'bg-plum/10'   },
  { text: 'text-citrus', tile: 'bg-citrus/10' },
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
      <div className="p-4">
        {/* Header: thumbnail + title */}
        <div className="flex items-start gap-3">
          {/* Image or type icon — same size */}
          <div className={`shrink-0 h-10 w-10 overflow-hidden rounded-xl ${bet.imageUrl ? '' : meta.bg} grid place-items-center`}>
            {bet.imageUrl
              ? <img src={bet.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              : <TypeIcon size={18} className={meta.color} />
            }
          </div>

          {/* Title + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-ink/40 mb-0.5">
              <span className="font-semibold">{betTypeLabel(bet.type)}</span>
              {bet.deadline ? <><span>·</span><span>{relativeTime(bet.deadline)}</span></> : null}
              {bet.visibility === 'private' ? <Lock size={10} /> : null}
            </div>
            <p className="line-clamp-2 text-sm font-black leading-snug sm:text-base">{bet.title}</p>
          </div>

          {/* Status badge */}
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black ${isOpen ? 'bg-mint/12 text-mint' : 'bg-line text-ink/45'}`}>
            {isOpen ? 'Open' : 'Closed'}
          </span>
        </div>

        {/* Options / chances */}
        <div className="mt-3">
          {displayOptions.length > 0 ? (
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(displayOptions.length + (remainingCount > 0 ? 1 : 0), 4)}, 1fr)` }}>
              {displayOptions.map((s, i) => {
                const option = bet.options.find((o) => o.id === s.optionId);
                const col = optionColors[i % optionColors.length];
                return (
                  <div key={s.optionId} className={`rounded-xl px-2.5 py-2 ${col.tile}`}>
                    <p className="truncate text-xs text-ink/50">{option?.label ?? s.optionId}</p>
                    <p className={`mt-0.5 text-sm font-black ${col.text}`}>{percent(s.chance)}</p>
                  </div>
                );
              })}
              {remainingCount > 0 ? (
                <div className="rounded-xl bg-field px-2.5 py-2">
                  <p className="text-xs text-ink/35">+{remainingCount}</p>
                  <p className="mt-0.5 text-sm font-black text-ink/25">more</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs italic text-ink/35">Each player submits their own guess</p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center gap-3 text-xs text-ink/40">
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
      </div>
    </Link>
  );
}
