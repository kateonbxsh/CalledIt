import type { FootballMatchLink, FootballTeamLink } from '../types';

function Crest({ team, className }: { team: FootballTeamLink; className: string }) {
  if (team.crest) return <img src={team.crest} alt="" className={`${className} object-contain`} loading="lazy" />;
  return (
    <span className={`${className} grid place-items-center rounded-full bg-field text-[9px] font-black text-ink/40`}>
      {team.tla || team.name.slice(0, 3).toUpperCase()}
    </span>
  );
}

export function FootballMatchCrests({
  match,
  size = 'compact',
}: {
  match: FootballMatchLink;
  size?: 'compact' | 'detail';
}) {
  const detail = size === 'detail';
  return (
    <div className={`relative shrink-0 overflow-hidden border border-sky/15 bg-sky/10 ${detail ? 'h-16 w-20 rounded-md sm:h-20 sm:w-24' : 'h-10 w-10 rounded-xl'}`}>
      <Crest
        team={match.homeTeam}
        className={detail ? 'absolute bottom-2 left-2 h-10 w-10 sm:h-12 sm:w-12' : 'absolute bottom-1 left-1 h-6 w-6'}
      />
      <Crest
        team={match.awayTeam}
        className={detail ? 'absolute right-2 top-2 h-10 w-10 sm:h-12 sm:w-12' : 'absolute right-1 top-1 h-6 w-6'}
      />
    </div>
  );
}

