import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Search } from 'lucide-react';
import type { FootballMatchLink, FootballTeamLink } from '../types';
import { footballAutocompleteConfigured, listUpcomingFootballMatches } from '../services/footballService';

function TeamCrest({ team }: { team: FootballTeamLink }) {
  if (team.crest) {
    return <img src={team.crest} alt="" className="h-8 w-8 object-contain" loading="lazy" />;
  }
  return (
    <span className="grid h-8 w-8 place-items-center rounded-full bg-field text-[10px] font-black text-ink/45">
      {team.tla || team.name.slice(0, 3).toUpperCase()}
    </span>
  );
}

function fixtureDate(kickoff: string) {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(kickoff));
}

export function FootballMatchPicker({
  selectedMatchId,
  onSelect,
}: {
  selectedMatchId?: number;
  onSelect: (match: FootballMatchLink) => void;
}) {
  const [matches, setMatches] = useState<FootballMatchLink[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(footballAutocompleteConfigured());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!footballAutocompleteConfigured()) return;
    let active = true;
    setLoading(true);
    listUpcomingFootballMatches()
      .then((items) => { if (active) setMatches(items); })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load football matches.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visibleMatches = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return matches
      .filter((match) => {
        if (terms.length === 0) return true;
        const searchable = `${match.homeTeam.name} ${match.awayTeam.name} ${match.competitionName}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      .slice(0, 10);
  }, [matches, query]);

  if (!footballAutocompleteConfigured()) {
    return (
      <div className="rounded-md border border-dashed border-line bg-field px-3 py-2 text-xs text-ink/50">
        Football match search becomes available when the VPS API URL is configured.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-line bg-field">
      <div className="border-b border-line bg-white p-3">
        <div className="flex items-center gap-2 text-sm font-black text-ink">
          <CalendarDays size={16} className="text-sky" /> Upcoming football
        </div>
        <label className="mt-2 flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 focus-within:border-sky">
          <Search size={16} className="shrink-0 text-ink/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search team or competition"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
      </div>

      <div className="max-h-80 overflow-y-auto overscroll-contain p-2">
        {loading ? <p className="px-2 py-5 text-center text-xs font-semibold text-ink/40">Loading fixtures...</p> : null}
        {error ? <p className="px-2 py-5 text-center text-xs font-semibold text-coral">{error}</p> : null}
        {!loading && !error && visibleMatches.length === 0 ? (
          <p className="px-2 py-5 text-center text-xs font-semibold text-ink/40">No upcoming match found.</p>
        ) : null}
        <div className="grid gap-1.5">
          {visibleMatches.map((match) => {
            const selected = match.matchId === selectedMatchId;
            return (
              <button
                key={match.matchId}
                type="button"
                onClick={() => onSelect(match)}
                className={`grid w-full grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-2 rounded-md border px-2.5 py-2.5 text-left transition ${
                  selected ? 'border-sky bg-sky/10' : 'border-transparent bg-white hover:border-line'
                }`}
              >
                <TeamCrest team={match.homeTeam} />
                <span className="min-w-0 text-center">
                  <span className="flex items-center justify-center gap-1 text-sm font-black text-ink">
                    <span className="truncate">{match.homeTeam.shortName || match.homeTeam.name}</span>
                    <span className="shrink-0 text-ink/25">vs</span>
                    <span className="truncate">{match.awayTeam.shortName || match.awayTeam.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-semibold text-ink/40">
                    {match.competitionName} · {fixtureDate(match.kickoff)}
                  </span>
                </span>
                <span className="relative">
                  <TeamCrest team={match.awayTeam} />
                  {selected ? (
                    <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-sky text-white">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="border-t border-line bg-white px-3 py-2 text-[10px] font-semibold text-ink/30">Data from football-data.org</p>
    </div>
  );
}
