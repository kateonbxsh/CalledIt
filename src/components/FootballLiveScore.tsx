import type { FootballLiveMatch, FootballMatchLink } from '../types';
import { footballMatchIsFinished, footballMatchIsLive } from '../services/footballService';

function TeamFlag({
  name,
  crest,
  fallback,
}: {
  name: string;
  crest: string | null;
  fallback: string;
}) {
  if (crest) {
    return <img src={crest} alt={`${name} flag`} className="h-5 w-5 shrink-0 object-contain" loading="lazy" />;
  }
  return <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-[7px] font-black text-ink/50">{fallback}</span>;
}

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
    <div className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2.5 py-1.5 ${isLive ? 'border-coral/20 bg-coral/[0.07]' : 'border-line bg-field'}`}>
      <span className="flex min-w-0 items-center justify-end gap-1.5 text-right text-xs font-bold text-ink/65">
        <span className="truncate">{match.homeTeam.tla || match.homeTeam.shortName || match.homeTeam.name}</span>
        <TeamFlag name={match.homeTeam.name} crest={match.homeTeam.crest} fallback={match.homeTeam.tla || 'H'} />
      </span>
      <span className={`${compact ? 'text-sm' : 'text-lg'} whitespace-nowrap font-black tabular-nums text-ink`}>
        {live.score.home} - {live.score.away}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-ink/65">
        <TeamFlag name={match.awayTeam.name} crest={match.awayTeam.crest} fallback={match.awayTeam.tla || 'A'} />
        <span className="truncate">{match.awayTeam.tla || match.awayTeam.shortName || match.awayTeam.name}</span>
      </span>
      <span className={`shrink-0 text-[10px] font-black uppercase ${isLive ? 'animate-pulse text-coral' : 'text-ink/40'}`}>
        {isLive ? (live.minute ? `${live.minute}'` : 'Live') : 'FT'}
      </span>
    </div>
  );
}
