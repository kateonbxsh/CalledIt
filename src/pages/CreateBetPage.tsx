import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { UsernamePicker } from '../components/UsernamePicker';
import { useAuth } from '../contexts/AuthContext';
import { createBet } from '../services/betService';
import { listMyFriendGroups } from '../services/friendGroupService';
import type { BetOption, BetType, BetVisibility, FriendGroup } from '../types';
import { betTypeOptions } from '../utils/betTypes';
import { downscaleBetImage } from '../utils/image';

function optionId(label: string, index: number) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'option';
  return `${base}-${index + 1}`;
}

export function CreateBetPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [type, setType] = useState<BetType>('binary');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [deadline, setDeadline] = useState('');
  const [visibility, setVisibility] = useState<BetVisibility>('public');
  const [invited, setInvited] = useState<string[]>([]);
  const [masked, setMasked] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [multiOptions, setMultiOptions] = useState('Option A\nOption B\nOption C');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [numberLine, setNumberLine] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [allowDraw, setAllowDraw] = useState(false);
  const [allowExactScore, setAllowExactScore] = useState(false);
  const [allowMultipleChoices, setAllowMultipleChoices] = useState(false);
  const [allowMultipleOutcomes, setAllowMultipleOutcomes] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      listMyFriendGroups(profile).then(setGroups).catch(() => {});
    }
  }, [profile]);

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
    if (type === 'closestNumber' || type === 'closestDate' || type === 'openChoice') {
      return [];
    }
    return multiOptions
      .split('\n')
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label, index) => ({ id: optionId(label, index), label }));
  }, [allowDraw, awayTeam, homeTeam, multiOptions, numberLine, targetDate, type]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      if (type !== 'closestNumber' && type !== 'closestDate' && type !== 'openChoice' && options.length < 2) {
        throw new Error('Add at least two options.');
      }
      const maskedSet = new Set(masked.map((username) => username.trim().toLowerCase()));
      await createBet(
        {
          type,
          title,
          description: description || undefined,
          category,
          deadline: deadline ? new Date(deadline) : undefined,
          visibility,
          invitedUsernames: invited.filter((username) => !maskedSet.has(username)),
          maskedUsernames: selectedGroupId ? [...maskedSet] : [],
          options,
          allowMultipleChoices: (type === 'multi' || type === 'openChoice') && allowMultipleChoices,
          allowMultipleOutcomes: (type === 'multi' || type === 'openChoice') && allowMultipleOutcomes,
          allowDraw,
          allowExactScore,
          homeTeam,
          awayTeam,
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
            </label>
            <label className="block text-sm font-medium">
              Deadline
              <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <span className="mt-1 block text-xs text-ink/50">Optional: If not set, the bet stays open indefinitely</span>
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
            <label className="block text-sm font-medium">
              Target date
              <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required />
              <span className="mt-1 block text-xs text-ink/50">Friends choose before or on/after this date</span>
            </label>
          ) : null}
          {type === 'sports' ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Team/Player 1
                  <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="e.g., Manchester United" required />
                </label>
                <label className="block text-sm font-medium">
                  Team/Player 2
                  <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="e.g., Liverpool" required />
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
            {type === 'closestNumber' || type === 'closestDate' || type === 'openChoice' ? (
              <p className="mt-3 text-sm text-ink/55 italic">
                {type === 'openChoice'
                  ? 'Players add answers when they predict.'
                  : `Each player submits their own ${type === 'closestNumber' ? 'number' : 'date'} guess.`}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {options.map((option, index) => (
                  <div key={`${option.id}-${index}`} className="rounded-md bg-field px-3 py-2 text-sm font-semibold">
                    <div className="flex items-center justify-between gap-2">
                      <span>{option.label}</span>
                      <span className="text-xs text-ink/45">0%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {error ? <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
          <button disabled={busy} className="w-full rounded-md bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60">
            {busy ? 'Creating…' : 'Create bet'}
          </button>
        </aside>
      </form>
    </>
  );
}
