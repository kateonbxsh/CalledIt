import { CheckCircle2, Lock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CoinAmount } from './CoinAmount';
import type { Bet, Prediction } from '../types';
import { betTypeMeta, betTypeLabel, isClosestType } from '../utils/betTypes';
import { closestDateGuessLabel } from '../utils/closestGuess';
import { percent, relativeTime } from '../utils/format';
import { displayChanceSummary } from '../utils/probability';

const optionColors = [
  { text: 'text-mint',   tile: 'bg-mint/10'   },
  { text: 'text-sky',    tile: 'bg-sky/10'    },
  { text: 'text-coral',  tile: 'bg-coral/10'  },
  { text: 'text-plum',   tile: 'bg-plum/10'   },
  { text: 'text-citrus', tile: 'bg-citrus/10' },
];

function resolvedWinnerIds(bet: Bet) {
  return (bet.resolution?.winningOptionIds?.length
    ? bet.resolution.winningOptionIds
    : [bet.resolution?.winningOptionId]).filter((id): id is string => Boolean(id));
}

function statusLabel(bet: Bet) {
  if (bet.status === 'locked') return 'Awaiting resolve';
  return bet.status === 'open' ? 'Open' : 'Resolved';
}

export function BetCard({ bet, prediction, groupName, groupPhotoURL }: { bet: Bet; prediction?: Prediction; groupName?: string; groupPhotoURL?: string }) {
  const isOpen = bet.status === 'open';
  const meta = betTypeMeta[bet.type];
  const TypeIcon = meta.icon;
  const projectedSummary = displayChanceSummary({
    options: bet.options,
    summary: bet.chanceSummary,
    initialSummary: bet.initialChanceSummary,
    type: bet.type,
    createdAtMs: bet.createdAt?.toMillis?.() ?? Date.now(),
    deadlineMs: bet.deadline?.toMillis?.() ?? null,
    targetDateMs: bet.targetDate?.toMillis?.() ?? null,
    status: bet.status,
  });

  const sortedChances = [...projectedSummary].sort((a, b) => b.chance - a.chance);
  const displayOptions = sortedChances.slice(0, 3);
  const remainingCount = sortedChances.length - displayOptions.length;
  const winnerIds = bet.status === 'resolved' ? resolvedWinnerIds(bet) : [];

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
              {bet.deadline ? <><span>-</span><span>{relativeTime(bet.deadline)}</span></> : null}
              {bet.visibility === 'private' ? <Lock size={10} /> : null}
            </div>
            <p className="line-clamp-2 text-sm font-black leading-snug sm:text-base">{bet.title}</p>
          </div>

          {/* Status badge */}
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black ${
            isOpen ? 'bg-mint/12 text-mint' : bet.status === 'locked' ? 'bg-citrus/12 text-citrus' : 'bg-line text-ink/45'
          }`}>
            {statusLabel(bet)}
          </span>
        </div>

        {/* Options / chances */}
        <div className="mt-3">
          {bet.status === 'resolved' && isClosestType(bet.type) ? (
            <span className="inline-flex rounded-xl bg-mint/10 px-2.5 py-2 text-xs font-black text-mint">
              Answer: {bet.type === 'closestNumber'
                ? (bet.resolution?.actualValue ?? '—')
                : closestDateGuessLabel(bet.resolution?.actualDateValue)}
            </span>
          ) : winnerIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {winnerIds.slice(0, 4).map((id) => (
                <span key={id} className="rounded-xl bg-mint/10 px-2.5 py-2 text-xs font-black text-mint">
                  {bet.options.find((option) => option.id === id)?.label ?? id}
                </span>
              ))}
            </div>
          ) : displayOptions.length > 0 ? (
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
            <p className="text-xs italic text-ink/35">
              {bet.type === 'openChoice' ? 'Players add answers when predicting' : 'Each player submits their own guess'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center gap-3 text-xs text-ink/40">
          <span className="inline-flex items-center gap-1">
            <Users size={12} /> {bet.predictionCount}
          </span>
          <CoinAmount amount={bet.totalCoinsStaked} className="text-xs" />
          {bet.groupId ? (
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-field py-1 pl-1 pr-2 text-[11px] font-semibold text-ink/45">
              {groupPhotoURL ? <img src={groupPhotoURL} alt="" className="h-4 w-4 rounded-full object-cover" /> : <Users size={11} className="ml-0.5" />}
              <span className="truncate">{groupName ?? 'Group'}</span>
            </span>
          ) : null}
          {prediction ? (
            <span className="ml-auto inline-flex items-center gap-1 font-semibold text-mint">
              <CheckCircle2 size={12} /> Predicted
            </span>
          ) : null}
        </div>
        {bet.visibility === 'private' && !bet.groupId ? (
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {(bet.invitedUsernames ?? []).slice(0, 4).map((username) => (
              <span key={username} className="rounded-full bg-field px-2 py-1 text-ink/50">@{username}</span>
            ))}
            {(bet.invitedUsernames?.length ?? 0) > 4 ? (
              <span className="rounded-full bg-field px-2 py-1 text-ink/45">+{(bet.invitedUsernames?.length ?? 0) - 4} invited</span>
            ) : null}
            {(bet.maskedUsernames?.length ?? 0) > 0 ? (
              <span className="rounded-full bg-coral/10 px-2 py-1 text-coral">{bet.maskedUsernames!.length} masked</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
