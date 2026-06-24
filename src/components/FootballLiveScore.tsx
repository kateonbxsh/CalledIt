import type { FootballLiveMatch, FootballMatchLink } from '../types';
import { footballMatchIsFinished, footballMatchIsLive } from '../services/footballService';

export function FootballLiveScore({
  match,
  live,
  compact = false,
}: {
  match: FootballMatchLink;
  live: FootballLiveMatch | null;
  compact?: boolean;
}) {
  if (!live || live.score.home === null || live.score.away === null) return null;
  const isLive = footballMatchIsLive(live);
  const isFinished = footballMatchIsFinished(live);
  if (!isLive && !isFinished) return null;

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${isLive ? 'border-coral/20 bg-coral/[0.07]' : 'border-line bg-field'}`}>
      <span className="min-w-0 flex-1 truncate text-right text-xs font-bold text-ink/65">
        {match.homeTeam.tla || match.homeTeam.shortName || match.homeTeam.name}
      </span>
      <span className={`${compact ? 'text-sm' : 'text-lg'} whitespace-nowrap font-black tabular-nums text-ink`}>
        {live.score.home} - {live.score.away}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-bold text-ink/65">
        {match.awayTeam.tla || match.awayTeam.shortName || match.awayTeam.name}
      </span>
      <span className={`shrink-0 text-[10px] font-black uppercase ${isLive ? 'text-coral' : 'text-ink/40'}`}>
        {isLive ? (live.minute ? `${live.minute}'` : 'Live') : 'FT'}
      </span>
    </div>
  );
}
