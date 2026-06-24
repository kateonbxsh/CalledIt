import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { FootballMatchPicker } from '../components/FootballMatchPicker';
import { UsernamePicker } from '../components/UsernamePicker';
import { useAuth } from '../contexts/AuthContext';
import { createBet, listBetCategories } from '../services/betService';
import { listMyFriendGroups } from '../services/friendGroupService';
import type { BetOption, BetType, BetVisibility, FootballMatchLink, FriendGroup } from '../types';
import { betTypeOptions } from '../utils/betTypes';
import { categoryKey, cleanCategory, type CategoryGroup } from '../utils/categories';
import { createFootballMatchCover } from '../lib/footballCover';
import { downscaleBetImage } from '../utils/image';

function optionId(label: string, index: number) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'option';
  return `${base}-${index + 1}`;
}

function localDateFromInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function endOfLocalDay(value: string) {
  const date = localDateFromInput(value);
  if (!date) return undefined;
  date.setHours(23, 59, 59, 999);
  return date;
}

function datetimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CreateBetPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [type, setType] = useState<BetType>(() => (
    searchParams.get('type') === 'sports' ? 'sports' : 'binary'
  ));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [deadline, setDeadline] = useState('');
  const [visibility, setVisibility] = useState<BetVisibility>('public');
  const [invited, setInvited] = useState<string[]>([]);
  const [masked, setMasked] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [multiOptions, setMultiOptions] = useState('Option A\nOption B\nOption C');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [footballMatch, setFootballMatch] = useState<FootballMatchLink | null>(null);
  const [numberLine, setNumberLine] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [eventMightNotHappen, setEventMightNotHappen] = useState(false);
  const [allowDraw, setAllowDraw] = useState(false);
  const [allowExactScore, setAllowExactScore] = useState(false);
  const [allowMultipleChoices, setAllowMultipleChoices] = useState(false);
  const [allowMultipleOutcomes, setAllowMultipleOutcomes] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [initialChances, setInitialChances] = useState<Record<string, number>>({});
  const footballImageRequestRef = useRef(0);

  useEffect(() => {
    if (profile) {
      listMyFriendGroups(profile).then(setGroups).catch(() => {});
    }
  }, [profile]);

  useEffect(() => {
    listBetCategories().then(setCategoryGroups).catch(() => {});
  }, []);

  // Existing categories to suggest: match what's typed, hide an exact match, and
  // keep the most-used ones. Grouping already collapsed close spellings.
  const categorySuggestions = useMemo(() => {
    const typed = cleanCategory(category);
    const typedKey = categoryKey(typed);
    return categoryGroups
      .filter((group) => group.key !== typedKey && (!typed || group.label.toLowerCase().includes(typed.toLowerCase())))
      .slice(0, 8);
  }, [categoryGroups, category]);

  const groupUsernames = useMemo(() => {
    const group = groups.find((g) => g.id === selectedGroupId);
    if (!group || !profile) return [];
    return [group.creatorUsername, ...group.memberUsernames]
      .map((username) => username.trim().toLowerCase())
      .filter((username) => username && username !== profile.username);
  }, [groups, profile, selectedGroupId]);

  // When a group is selected, auto-populate invited usernames while respecting masks.
  useEffect(() => {
    if (!selectedGroupId) return;
    const maskedSet = new Set(masked);
    setInvited(groupUsernames.filter((username) => !maskedSet.has(username)));
  }, [groupUsernames, masked, selectedGroupId]);

  const options = useMemo<BetOption[]>(() => {
    if (type === 'binary') {
      return [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ];
    }
    if (type === 'sports') {
      const base: BetOption[] = [
        { id: 'home', label: homeTeam || 'Team/Player 1', teamSide: 'home' },
        { id: 'away', label: awayTeam || 'Team/Player 2', teamSide: 'away' },
      ];
      if (allowDraw) base.push({ id: 'draw', label: 'Draw', teamSide: 'draw' });
      return base;
    }
    if (type === 'overUnder') {
      const line = numberLine || 'the number';
      return [
        { id: 'over', label: `Over ${line}` },
        { id: 'under', label: `Under ${line}` },
      ];
    }
    if (type === 'date') {
      const dateLabel = targetDate || 'the date';
      return [
        { id: 'before', label: `Before ${dateLabel}` },
        { id: 'on-or-after', label: `On or after ${dateLabel}` },
      ];
    }
    if (type === 'closestNumber' || type === 'closestDate' || type === 'closestHour' || type === 'openChoice') {
      return [];
    }
    return multiOptions
      .split('\n')
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, index) => ({ id: optionId(label, index), label }));
  }, [allowDraw, awayTeam, homeTeam, multiOptions, numberLine, targetDate, type]);

  useEffect(() => {
    if (options.length === 0) {
      setInitialChances({});
      return;
    }
    setInitialChances((current) => {
      const equal = 100 / options.length;
      const optionIds = new Set(options.map((option) => option.id));
      const stillMatches = Object.keys(current).length === options.length
        && Object.keys(current).every((id) => optionIds.has(id));
      if (stillMatches) return current;
      return Object.fromEntries(options.map((option) => [option.id, equal]));
    });
  }, [options]);

  const initialChanceTotal = options.reduce(
    (sum, option) => sum + Math.max(0, initialChances[option.id] ?? 0),
    0,
  );

  function resetInitialChances() {
    const equal = options.length ? 100 / options.length : 0;
    setInitialChances(Object.fromEntries(options.map((option) => [option.id, equal])));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      if (type !== 'closestNumber' && type !== 'closestDate' && type !== 'closestHour' && type !== 'openChoice' && options.length < 2) {
        throw new Error('Add at least two options.');
      }
      if (type === 'closestHour' && !targetDate) {
        throw new Error('Choose the day for the closest-hour bet.');
      }
      if (options.length && initialChanceTotal <= 0) {
        throw new Error('Initial chances need a positive total.');
      }
      const maskedSet = new Set(masked.map((username) => username.trim().toLowerCase()));
      const effectiveDeadline = footballMatch
        ? new Date(new Date(footballMatch.kickoff).getTime() + 4 * 60 * 60 * 1000)
        : type === 'closestHour'
          ? endOfLocalDay(targetDate)
          : deadline
            ? new Date(deadline)
            : undefined;
      await createBet(
        {
          type,
          title,
          description: description || undefined,
          category,
          deadline: effectiveDeadline,
          targetDate: (type === 'date' || type === 'closestHour') && targetDate
            ? localDateFromInput(targetDate) ?? undefined
            : undefined,
          eventMightNotHappen: type === 'date' ? eventMightNotHappen : undefined,
          visibility,
          invitedUsernames: invited.filter((username) => !maskedSet.has(username)),
          maskedUsernames: selectedGroupId ? [...maskedSet] : [],
          options,
          initialChances,
          allowMultipleChoices: (type === 'multi' || type === 'openChoice') && allowMultipleChoices,
          allowMultipleOutcomes: (type === 'multi' || type === 'openChoice') && allowMultipleOutcomes,
          allowDraw,
          allowExactScore,
          homeTeam,
          awayTeam,
          footballMatch,
          imageUrl,
          groupId: selectedGroupId || undefined,
        },
        profile,
      );
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create bet.');
    } finally {
      setBusy(false);
    }
  }

  async function onImageChange(file?: File) {
    if (!file) return;
    footballImageRequestRef.current += 1;
    setImageBusy(true);
    setError('');
    try {
      setImageUrl(await downscaleBetImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process image.');
    } finally {
      setImageBusy(false);
    }
  }

  async function selectFootballMatch(match: FootballMatchLink) {
    const imageRequest = ++footballImageRequestRef.current;
    setError('');
    const home = match.homeTeam.shortName || match.homeTeam.name;
    const away = match.awayTeam.shortName || match.awayTeam.name;
    setFootballMatch(match);
    setHomeTeam(home);
    setAwayTeam(away);
    setAllowDraw(true);
    const estimate = match.estimatedChances;
    setInitialChances(estimate ? {
      home: estimate.home * 100,
      draw: estimate.draw * 100,
      away: estimate.away * 100,
    } : { home: 100 / 3, draw: 100 / 3, away: 100 / 3 });
    setTitle(`Who will win: ${home} vs ${away}?`);
    // The competition is the category (e.g. "Premier League", "FIFA World Cup").
    setCategory(cleanCategory(match.competitionName || 'Football'));
    setDescription([
      match.competitionName,
      match.matchday ? `Matchday ${match.matchday}` : '',
    ].filter(Boolean).join(' · '));
    // The worker locks linked bets as soon as the provider reports full time.
    setDeadline(datetimeLocalValue(new Date(new Date(match.kickoff).getTime() + 4 * 60 * 60 * 1000)));
    setImageBusy(true);
    try {
      const cover = await createFootballMatchCover(match);
      if (footballImageRequestRef.current === imageRequest) setImageUrl(cover);
    } catch (err) {
      if (footballImageRequestRef.current === imageRequest) {
        setError(err instanceof Error ? err.message : 'Could not create the match image.');
      }
    } finally {
      if (footballImageRequestRef.current === imageRequest) setImageBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Create Bet" />
      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="animate-soft-enter space-y-4 rounded-md border border-line bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {betTypeOptions.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => setType(item.type)}
                className={`rounded-md border px-3 py-2 text-left transition ${
                  type === item.type ? 'border-ink bg-ink text-white' : 'border-line bg-field'
                }`}
              >
                <span className="block text-sm font-black">{item.label}</span>
                <span className={`mt-0.5 block text-xs ${type === item.type ? 'text-white/70' : 'text-ink/55'}`}>
                  {item.description}
                </span>
              </button>
            ))}
          </div>
          {type === 'sports' ? (
            <FootballMatchPicker
              selectedMatchId={footballMatch?.matchId}
              onSelect={selectFootballMatch}
            />
          ) : null}
          <label className="block text-sm font-medium">
            Title
            <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <span className="mt-1 block text-xs text-ink/50">The question friends will see</span>
          </label>
          <label className="block text-sm font-medium">
            Description
            <textarea className="mt-1 min-h-28 w-full rounded-md border border-line bg-field px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
            <span className="mt-1 block text-xs text-ink/50">Optional: Add context, rules, or what counts as a win</span>
          </label>
          <div>
            <label className="block text-sm font-medium">
              Image
              <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" type="file" accept="image/*" onChange={(e) => onImageChange(e.target.files?.[0])} />
            </label>
            <span className="mt-1 block text-xs text-ink/50">Optional cover image saved as a small compressed file</span>
            {imageBusy ? <p className="mt-2 text-xs text-ink/55">Resizing image…</p> : null}
            {imageUrl ? (
              <div className="mt-3 overflow-hidden rounded-md border border-line">
                <img src={imageUrl} alt="" className="max-h-64 w-full object-cover" />
                <button type="button" onClick={() => setImageUrl('')} className="w-full bg-white px-3 py-2 text-xs font-semibold text-ink/70">Remove image</button>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Category
              <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Sports, travel, jokes…" />
              <span className="mt-1 block text-xs text-ink/50">Used for scanning the feed</span>
              {categorySuggestions.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {categorySuggestions.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setCategory(group.label)}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink/60 transition hover:border-mint hover:text-mint"
                    >
                      {group.label}
                      <span className="text-ink/30">{group.count}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <label className="block text-sm font-medium">
              Deadline
              <input
                className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2 disabled:opacity-50"
                type="datetime-local"
                value={(type === 'date' && !eventMightNotHappen) || type === 'closestHour' ? '' : deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={(type === 'date' && !eventMightNotHappen) || type === 'closestHour'}
              />
              <span className="mt-1 block text-xs text-ink/50">
                {type === 'closestHour'
                  ? 'Automatically set to 11:59 PM on the selected day.'
                  : type === 'date' && !eventMightNotHappen
                  ? 'Set by the target date — the event is guaranteed to happen.'
                  : 'Optional: If not set, the bet stays open indefinitely'}
              </span>
            </label>
          </div>

          {/* Type-specific fields */}
          {type === 'multi' ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                Options
                <textarea className="mt-1 min-h-32 w-full rounded-md border border-line bg-field px-3 py-2" value={multiOptions} onChange={(e) => setMultiOptions(e.target.value)} />
                <span className="mt-1 block text-xs text-ink/50">One option per line</span>
              </label>
              <div className="grid gap-2 rounded-md bg-field p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={allowMultipleChoices} onChange={(e) => setAllowMultipleChoices(e.target.checked)} />
                  Allow multiple choices
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={allowMultipleOutcomes} onChange={(e) => setAllowMultipleOutcomes(e.target.checked)} />
                  Allow multiple outcomes
                </label>
              </div>
            </div>
          ) : null}
          {type === 'overUnder' ? (
            <label className="block text-sm font-medium">
              Number line
              <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" value={numberLine} onChange={(e) => setNumberLine(e.target.value)} placeholder="2.5 goals, 10 people, 100 points" required />
              <span className="mt-1 block text-xs text-ink/50">Friends choose above or below this value</span>
            </label>
          ) : null}
          {type === 'date' ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                Target date
                <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required />
                <span className="mt-1 block text-xs text-ink/50">Friends choose before or on/after this date</span>
              </label>
              <label className="flex items-start gap-2 rounded-md bg-field p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={eventMightNotHappen}
                  onChange={(e) => setEventMightNotHappen(e.target.checked)}
                />
                <span>
                  <span className="font-semibold">Event might not happen</span>
                  <span className="mt-0.5 block text-xs text-ink/55">
                    Adds an "event did not happen" outcome at resolution that refunds everyone. Leave unchecked if the event is guaranteed — the target date then acts as the deadline.
                  </span>
                </span>
              </label>
            </div>
          ) : null}
          {type === 'sports' ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Team/Player 1
                  <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" value={homeTeam} onChange={(e) => { setHomeTeam(e.target.value); setFootballMatch(null); }} placeholder="e.g., Manchester United" required />
                </label>
                <label className="block text-sm font-medium">
                  Team/Player 2
                  <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" value={awayTeam} onChange={(e) => { setAwayTeam(e.target.value); setFootballMatch(null); }} placeholder="e.g., Liverpool" required />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowDraw} onChange={(e) => setAllowDraw(e.target.checked)} />
                Allow draw
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={allowExactScore} onChange={(e) => setAllowExactScore(e.target.checked)} />
                Allow exact score predictions
              </label>
            </div>
          ) : null}
          {type === 'closestNumber' ? (
            <div className="rounded-md bg-field p-3 text-sm text-ink/70">
              <p className="font-semibold text-ink">Closest Number</p>
              <p className="mt-1">Each participant guesses a number. Whoever is closest to the actual value wins the pool. Use the title to describe what is being guessed (e.g., "How many goals will be scored?").</p>
            </div>
          ) : null}
          {type === 'closestDate' ? (
            <div className="rounded-md bg-field p-3 text-sm text-ink/70">
              <p className="font-semibold text-ink">Closest Date</p>
              <p className="mt-1">Each participant guesses a date. Whoever picks the date closest to the actual outcome wins. Use the title to describe what is being guessed (e.g., "When will the baby be born?").</p>
            </div>
          ) : null}
          {type === 'closestHour' ? (
            <div className="space-y-3 rounded-md bg-field p-3 text-sm text-ink/70">
              <div>
                <p className="font-semibold text-ink">Closest Hour</p>
                <p className="mt-1">Everyone guesses a time on one chosen day. The nearest time wins.</p>
              </div>
              <label className="block font-medium text-ink">
                Guessing day
                <input
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2"
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                  required
                />
                <span className="mt-1 block text-xs font-normal text-ink/50">Predictions close at 11:59 PM on this day.</span>
              </label>
            </div>
          ) : null}
          {type === 'openChoice' ? (
            <div className="space-y-3">
              <div className="rounded-md bg-field p-3 text-sm text-ink/70">
                <p className="font-semibold text-ink">Open Choice</p>
                <p className="mt-1">Players write their own answer when predicting. You decide whether people can pick several answers and whether several answers can resolve as correct.</p>
              </div>
              <div className="grid gap-2 rounded-md bg-field p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={allowMultipleChoices} onChange={(e) => setAllowMultipleChoices(e.target.checked)} />
                  Allow multiple choices
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={allowMultipleOutcomes} onChange={(e) => setAllowMultipleOutcomes(e.target.checked)} />
                  Allow multiple outcomes
                </label>
              </div>
            </div>
          ) : null}
          {options.length > 0 ? (
            <div className="rounded-md border border-line bg-field p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black">Initial chances</p>
                  <p className="mt-0.5 text-xs text-ink/50">
                    {type === 'sports' && footballMatch?.chanceSource === 'competition_standings'
                      ? 'Estimated from competition standings. Adjust them if needed.'
                      : 'These are the starting odds. Crowd predictions gradually take over.'}
                  </p>
                </div>
                <button type="button" onClick={resetInitialChances} className="shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-ink/60">
                  Equal
                </button>
              </div>
              <div className="mt-3 grid gap-2">
                {options.map((option) => (
                  <label key={option.id} className="flex items-center gap-3 rounded-md bg-white px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-semibold">{option.label}</span>
                    <span className="relative w-24 shrink-0">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={Number((initialChances[option.id] ?? 0).toFixed(1))}
                        onChange={(event) => setInitialChances((current) => ({
                          ...current,
                          [option.id]: Math.max(0, Number(event.target.value) || 0),
                        }))}
                        className="w-full rounded-md border border-line bg-field py-1.5 pl-2 pr-7 text-right font-bold"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-ink/40">%</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className={`mt-2 text-right text-xs font-bold ${Math.abs(initialChanceTotal - 100) < 0.11 ? 'text-mint' : 'text-ink/45'}`}>
                Total {initialChanceTotal.toFixed(1)}% {Math.abs(initialChanceTotal - 100) < 0.11 ? '' : '(normalized when created)'}
              </p>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <section className="rounded-md border border-line bg-white p-4">
            <p className="mb-2 text-sm font-semibold">Audience</p>
            <select
              className="w-full rounded-md border border-line bg-field px-3 py-2"
              value={visibility === 'public' ? 'public' : selectedGroupId || 'manual'}
              onChange={(e) => {
                const value = e.target.value;
                setMasked([]);
                if (value === 'public') {
                  setVisibility('public');
                  setSelectedGroupId('');
                  setInvited([]);
                } else if (value === 'manual') {
                  setVisibility('private');
                  setSelectedGroupId('');
                } else {
                  const group = groups.find((item) => item.id === value);
                  const nextGroupUsernames = group && profile
                    ? [group.creatorUsername, ...group.memberUsernames]
                        .map((username) => username.trim().toLowerCase())
                        .filter((username) => username && username !== profile.username)
                    : [];
                  setVisibility('private');
                  setSelectedGroupId(value);
                  setInvited(nextGroupUsernames);
                }
              }}
            >
              <option value="public">Public</option>
              <option value="manual">Private users</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink/50">Choose public, manual invitees, or a friend group.</p>
            {visibility === 'private' || visibility === 'public' ? (
              <div className="mt-3 space-y-3">
                {false ? (
                  <label className="block text-sm font-medium">
                    Friend group
                    <select
                      className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                    >
                      <option value="">— No group (invite manually) —</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({g.memberUsernames.length + 1} members)
                        </option>
                      ))}
                    </select>
                  <span className="mt-1 block text-xs text-ink/50">
                      Selecting a group auto-fills the usernames below
                    </span>
                  </label>
                ) : null}
                {selectedGroupId || visibility === 'public' ? (
                  <div className="block text-sm font-medium">
                    Masked users
                    <div className="mt-1">
                      <UsernamePicker
                        value={masked}
                        onChange={(next) => {
                          const filtered = selectedGroupId ? next.filter((username) => groupUsernames.includes(username)) : next;
                          setMasked(filtered);
                          if (selectedGroupId) {
                            setInvited(groupUsernames.filter((username) => !filtered.includes(username)));
                          }
                        }}
                        allowed={selectedGroupId ? groupUsernames : undefined}
                        exclude={profile?.username ? [profile.username] : []}
                        placeholder={selectedGroupId ? 'Search group members to hide it from' : 'Search users to hide it from'}
                      />
                    </div>
                    <span className="mt-1 block text-xs text-ink/50">
                      {selectedGroupId ? 'The bet stays linked to the group, except masked members cannot see it.' : 'Public bet, except masked users cannot see it.'}
                    </span>
                  </div>
                ) : null}
                {visibility === 'private' && !selectedGroupId ? (
                <div className="block text-sm font-medium">
                  Invited users
                  <div className="mt-1">
                    <UsernamePicker
                      value={invited}
                      onChange={setInvited}
                      exclude={profile?.username ? [profile.username] : []}
                      placeholder="Search usernames"
                    />
                  </div>
                  <span className="mt-1 block text-xs text-ink/50">Only these users can see and predict on this bet.</span>
                </div>
                ) : null}
              </div>
            ) : null}
          </section>
          <section className="rounded-md border border-line bg-white p-4">
            <p className="text-sm font-semibold">Bet Preview</p>
            {imageUrl ? <img src={imageUrl} alt="" className="mt-3 h-28 w-full rounded-md object-cover" /> : null}
            <h2 className="mt-3 line-clamp-2 font-black">{title || 'Untitled bet'}</h2>
            <p className="mt-1 line-clamp-2 text-xs text-ink/55">{description || 'Description preview'}</p>
            {type === 'closestNumber' || type === 'closestDate' || type === 'closestHour' || type === 'openChoice' ? (
              <p className="mt-3 text-sm text-ink/55 italic">
                {type === 'openChoice'
                  ? 'Players add answers when they predict.'
                  : `Each player submits their own ${type === 'closestNumber' ? 'number' : type === 'closestHour' ? 'time' : 'date'} guess.`}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {options.map((option, index) => (
                  <div key={`${option.id}-${index}`} className="rounded-md bg-field px-3 py-2 text-sm font-semibold">
                    <div className="flex items-center justify-between gap-2">
                      <span>{option.label}</span>
                      <span className="text-xs text-ink/45">
                        {initialChanceTotal > 0
                          ? `${Math.round(((initialChances[option.id] ?? 0) / initialChanceTotal) * 100)}%`
                          : '0%'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {error ? <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
          <button disabled={busy} className="btn-special w-full rounded-md px-4 py-3 font-semibold disabled:opacity-60">
            {busy ? 'Creating…' : 'Create bet'}
          </button>
        </aside>
      </form>
    </>
  );
}
