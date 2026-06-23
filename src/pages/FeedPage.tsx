import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock3, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { BetCard } from '../components/BetCard';
import { CoinAmount } from '../components/CoinAmount';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { StakeInput } from '../components/StakeInput';
import { UsernamePicker } from '../components/UsernamePicker';
import { useAuth } from '../contexts/AuthContext';
import { autoBetDeadline, sampleAutoBetIdeas, type AutoBetAccent, type AutoBetIdea } from '../data/autoBetIdeas';
import { createBet, getBetsByIds, listFeedBets, listMyPredictions, lockExpiredBet, placePrediction } from '../services/betService';
import { listMyFriendGroups } from '../services/friendGroupService';
import type { Bet, FriendGroup, Prediction } from '../types';

type FeedTab = 'all' | 'private' | string;
type AutoAudience = 'public' | 'manual' | string;

const autoAccentStyles: Record<AutoBetAccent, { card: string; icon: string; chip: string; option: string }> = {
  sky: { card: 'border-sky/40 bg-sky/[0.06] hover:border-sky/65', icon: 'bg-sky/12 text-sky', chip: 'text-sky', option: 'border-sky bg-sky/10 text-sky' },
  plum: { card: 'border-plum/40 bg-plum/[0.06] hover:border-plum/65', icon: 'bg-plum/12 text-plum', chip: 'text-plum', option: 'border-plum bg-plum/10 text-plum' },
  coral: { card: 'border-coral/40 bg-coral/[0.06] hover:border-coral/65', icon: 'bg-coral/12 text-coral', chip: 'text-coral', option: 'border-coral bg-coral/10 text-coral' },
  mint: { card: 'border-mint/40 bg-mint/[0.06] hover:border-mint/65', icon: 'bg-mint/12 text-mint', chip: 'text-mint', option: 'border-mint bg-mint/10 text-mint' },
  citrus: { card: 'border-citrus/40 bg-citrus/[0.06] hover:border-citrus/65', icon: 'bg-citrus/12 text-citrus', chip: 'text-citrus', option: 'border-citrus bg-citrus/10 text-citrus' },
};

const autoTypeLabels: Record<AutoBetIdea['type'], string> = {
  binary: 'Yes / No',
  multi: 'Multiple choice',
  overUnder: 'Over / Under',
  closestNumber: 'Closest number',
};

function autoIdeaPreviewTitle(idea: AutoBetIdea) {
  if (!idea.personal) return idea.title;
  return idea.title.replace(/\bI\b/g, 'X').replace(/\bmy\b/g, "X's");
}

export function FeedPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [bets, setBets] = useState<Bet[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [activeTab, setActiveTab] = useState<FeedTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [autoIdeas, setAutoIdeas] = useState(() => sampleAutoBetIdeas());
  const [showAutoIdeas, setShowAutoIdeas] = useState(false);
  const [autoIdeaSearch, setAutoIdeaSearch] = useState('');
  const [selectedAutoIdea, setSelectedAutoIdea] = useState<AutoBetIdea | null>(null);
  const [autoOptionId, setAutoOptionId] = useState('');
  const [autoNumericGuess, setAutoNumericGuess] = useState('');
  const [autoStake, setAutoStake] = useState(10);
  const [autoSubjectMode, setAutoSubjectMode] = useState<'me' | 'other'>('me');
  const [autoSubject, setAutoSubject] = useState<string[]>([]);
  const [autoSubjectDisplayName, setAutoSubjectDisplayName] = useState('');
  const [autoSubjectCustomName, setAutoSubjectCustomName] = useState('');
  const [autoAudience, setAutoAudience] = useState<AutoAudience>('public');
  const [autoInvited, setAutoInvited] = useState<string[]>([]);
  const [autoMasked, setAutoMasked] = useState<string[]>([]);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoError, setAutoError] = useState('');
  const [createdAutoBetId, setCreatedAutoBetId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!profile) return;
      setLoading(true);
      try {
        const [nextBets, nextPredictions, nextGroups] = await Promise.all([
          Promise.all([listFeedBets('public', profile), listFeedBets('private', profile)]),
          listMyPredictions(profile.uid),
          listMyFriendGroups(profile),
        ]);
        const mergedBets = [...new Map(nextBets.flat().map((bet) => [bet.id, bet])).values()];
        await Promise.all(mergedBets.map(lockExpiredBet));
        const activeBets = mergedBets.map((bet) => (
          bet.status === 'open' && bet.deadline && Date.now() >= bet.deadline.toMillis()
            ? { ...bet, status: 'locked' as const }
            : bet
        ));
        if (active) {
          setBets(activeBets
            .filter((b) => b.status !== 'resolved')
            .sort((left, right) => (right.createdAt?.toMillis?.() ?? 0) - (left.createdAt?.toMillis?.() ?? 0)));
          setPredictions(nextPredictions);
          setGroups(nextGroups);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load bets.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [profile]);

  const predictionByBet = new Map(predictions.map((prediction) => [prediction.betId, prediction]));
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const selectedAutoGroup = groups.find((group) => group.id === autoAudience);
  const autoSubjectUsername = autoSubjectMode === 'other' ? autoSubject[0] : undefined;
  const autoSubjectLabel = autoSubjectMode === 'other'
    ? autoSubjectDisplayName || autoSubjectCustomName.trim() || 'X'
    : undefined;
  const effectiveAutoMasked = [...new Set([...autoMasked, ...(autoSubjectUsername ? [autoSubjectUsername] : [])])];
  const autoTitle = selectedAutoIdea && autoSubjectLabel
    ? selectedAutoIdea.title.replace(/\bI\b/g, autoSubjectLabel).replace(/\bmy\b/g, `${autoSubjectLabel}'s`)
    : selectedAutoIdea?.title ?? '';

  const tabFilteredBets = bets.filter((bet) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'private') return bet.visibility === 'private';
    return bet.groupId === activeTab;
  });

  const visibleBets = tabFilteredBets.filter((bet) => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return true;
    return [bet.title, bet.description, bet.category, bet.creatorUsername]
      .join(' ')
      .toLowerCase()
      .includes(normalized);
  });

  const normalizedAutoSearch = autoIdeaSearch.trim().toLowerCase();
  const visibleAutoIdeas = autoIdeas.filter((idea) => (
    !normalizedAutoSearch || [idea.title, idea.description, idea.category, idea.type].join(' ').toLowerCase().includes(normalizedAutoSearch)
  ));

  const tabs: { id: string; label: string; group?: FriendGroup }[] = [
    { id: 'all', label: 'All' },
    { id: 'private', label: 'Private' },
    ...groups.map((group) => ({ id: group.id, label: group.name, group })),
  ];

  function openAutoIdea(idea: AutoBetIdea) {
    setShowAutoIdeas(true);
    setSelectedAutoIdea(idea);
    setAutoOptionId('');
    setAutoNumericGuess('');
    setAutoStake(Math.min(50, Math.max(10, profile?.coinBalance ?? 10)));
    setAutoSubjectMode('me');
    setAutoSubject([]);
    setAutoSubjectDisplayName('');
    setAutoSubjectCustomName('');
    setAutoAudience('public');
    setAutoInvited([]);
    setAutoMasked([]);
    setAutoError('');
    setCreatedAutoBetId(null);
  }

  async function createAndPredictAutoBet() {
    if (!profile || !selectedAutoIdea || autoBusy) return;
    const closestNumber = selectedAutoIdea.type === 'closestNumber';
    const numericGuess = Number(autoNumericGuess);
    if (closestNumber && (autoNumericGuess.trim() === '' || !Number.isFinite(numericGuess))) {
      setAutoError('Enter a valid number guess.');
      return;
    }
    if (!closestNumber && !autoOptionId) {
      setAutoError('Pick an option first.');
      return;
    }
    if (selectedAutoIdea.personal && autoSubjectMode === 'other' && !autoSubjectUsername && !autoSubjectCustomName.trim()) {
      setAutoError('Choose who this bet is about.');
      return;
    }
    if (autoStake < 10) {
      setAutoError('The minimum bet stake is 10 euro.');
      return;
    }
    if (autoStake > profile.coinBalance) {
      setAutoError('You do not have enough euros for that stake.');
      return;
    }

    setAutoBusy(true);
    setAutoError('');
    try {
      const maskedSet = new Set(effectiveAutoMasked.map((username) => username.toLowerCase()));
      const groupUsernames = selectedAutoGroup
        ? [selectedAutoGroup.creatorUsername, ...selectedAutoGroup.memberUsernames]
            .map((username) => username.trim().toLowerCase())
            .filter((username) => username && username !== profile.username && !maskedSet.has(username))
        : [];
      const invitedUsernames = selectedAutoGroup
        ? groupUsernames
        : autoAudience === 'manual'
          ? autoInvited.filter((username) => !maskedSet.has(username.toLowerCase()))
          : [];
      if (autoAudience === 'manual' && invitedUsernames.length === 0) {
        throw new Error('Invite at least one person to a private bet.');
      }

      let betId = createdAutoBetId;
      if (!betId) {
        betId = await createBet({
          type: selectedAutoIdea.type,
          title: autoTitle,
          description: selectedAutoIdea.description,
          category: selectedAutoIdea.category,
          deadline: autoBetDeadline(selectedAutoIdea.deadline),
          visibility: autoAudience === 'public' ? 'public' : 'private',
          invitedUsernames,
          maskedUsernames: [...maskedSet],
          groupId: selectedAutoGroup?.id,
          options: selectedAutoIdea.options,
          initialChances: selectedAutoIdea.options.length
            ? Object.fromEntries(selectedAutoIdea.options.map((option) => [option.id, 1]))
            : undefined,
        }, profile);
        setCreatedAutoBetId(betId);
      }

      const createdBet = (await getBetsByIds([betId])).get(betId);
      if (!createdBet) throw new Error('The bet was created, but could not be loaded yet. Try again.');
      await placePrediction({
        bet: createdBet,
        user: profile,
        optionId: closestNumber ? 'guess' : autoOptionId,
        stake: autoStake,
        numericGuess: closestNumber ? numericGuess : undefined,
      });
      navigate(`/bets/${betId}`);
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : 'Could not create this bet.');
    } finally {
      setAutoBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Bets"
        action={
          <Link
            to="/create"
            className="btn-special inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
          >
            <Plus size={17} /> Create Bet
          </Link>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full py-1.5 text-sm font-semibold transition ${tab.group?.photoURL ? 'pl-1.5 pr-3.5' : 'px-4'} ${
                activeTab === tab.id ? 'bg-ink text-white' : 'bg-white text-ink/70 border border-line'
              }`}
            >
              {tab.group?.photoURL ? <img src={tab.group.photoURL} alt="" className="h-5 w-5 rounded-full object-cover" /> : null}
              {tab.label}
            </button>
        ))}
      </div>

      <input
        className="mb-4 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-mint"
        placeholder="Search loaded bets"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {error ? <p className="mb-4 rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
      {activeTab === 'all' ? (
        <button
          type="button"
          onClick={() => { setShowAutoIdeas(true); setSelectedAutoIdea(null); setAutoIdeaSearch(''); }}
          className="group mb-3 block w-full overflow-hidden rounded-2xl border border-dashed border-plum/40 bg-plum/[0.06] p-4 text-left shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-plum/65 hover:shadow-lift"
        >
          <span className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-plum/12 text-plum">
              <Sparkles size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-black uppercase text-plum">Auto bet ideas</span>
              <span className="mt-0.5 block text-sm font-black text-ink sm:text-base">Need a bet? Pick a ready-made one.</span>
              <span className="mt-0.5 block truncate text-xs text-ink/45">Weather, closest guesses, daily life, groups and more</span>
            </span>
            <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-plum transition group-hover:bg-plum group-hover:text-white">
              Browse
            </span>
          </span>
        </button>
      ) : null}
      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-64 animate-pulse rounded-md bg-white" />
          ))}
        </div>
      ) : visibleBets.length === 0 ? (
        <EmptyState title="No bets here yet" body="Create one or wait for an invite." />
      ) : (
        <div className="grid gap-3">
          {visibleBets.map((bet) => (
            <BetCard key={bet.id} bet={bet} prediction={predictionByBet.get(bet.id)} groupName={bet.groupId ? groupNameById.get(bet.groupId) : undefined} groupPhotoURL={bet.groupId ? groupById.get(bet.groupId)?.photoURL ?? undefined : undefined} />
          ))}
        </div>
      )}

      {showAutoIdeas ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/55 sm:grid sm:place-items-center sm:p-4 sm:backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => { if (!autoBusy) { setShowAutoIdeas(false); setSelectedAutoIdea(null); } }}
            aria-label="Close auto ideas"
          />
          <div className="relative flex h-[min(92dvh,720px)] w-full animate-soft-enter touch-pan-y flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-lift sm:h-[min(82dvh,720px)] sm:w-[min(92vw,760px)] sm:max-w-none sm:rounded-2xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
              {selectedAutoIdea ? (
                <button
                  type="button"
                  onClick={() => { if (!autoBusy) { setSelectedAutoIdea(null); setAutoError(''); } }}
                  disabled={autoBusy}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-field text-ink/55 transition active:scale-95 disabled:opacity-40"
                  aria-label="Back to ideas"
                >
                  <ArrowLeft size={17} />
                </button>
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-plum/12 text-plum">
                  <Sparkles size={17} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase text-plum">Auto bets</p>
                <h2 className="truncate text-base font-black text-ink">{selectedAutoIdea ? autoTitle : 'Pick an idea'}</h2>
              </div>
              <button
                type="button"
                onClick={() => { setShowAutoIdeas(false); setSelectedAutoIdea(null); }}
                disabled={autoBusy}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-field text-ink/55 transition active:scale-95 disabled:opacity-40"
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto px-4 py-4 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] sm:px-5 sm:pb-5">
              {!selectedAutoIdea ? (
                <>
                  <div className="sticky top-0 z-10 -mx-4 mb-4 flex gap-2 border-b border-line bg-white px-4 pb-3 sm:-mx-5 sm:px-5">
                    <input
                      value={autoIdeaSearch}
                      onChange={(event) => setAutoIdeaSearch(event.target.value)}
                      placeholder="Search ideas or types"
                      className="min-w-0 flex-1 rounded-xl border border-line bg-field px-3 py-2 text-sm outline-none transition focus:border-plum"
                    />
                    <button
                      type="button"
                      onClick={() => setAutoIdeas(sampleAutoBetIdeas())}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-ink/55 transition active:scale-95"
                      aria-label="Show different ideas"
                      title="Show different ideas"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                  {visibleAutoIdeas.length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {visibleAutoIdeas.map((idea) => {
                        const styles = autoAccentStyles[idea.accent];
                        return (
                          <button
                            key={idea.id}
                            type="button"
                            onClick={() => openAutoIdea(idea)}
                            className={`min-w-0 rounded-2xl border border-dashed p-3 text-left transition active:scale-[0.99] ${styles.card}`}
                          >
                            <span className={`text-[10px] font-black uppercase ${styles.chip}`}>{idea.category}</span>
                            <span className="mt-1 block text-sm font-black leading-snug text-ink">{autoIdeaPreviewTitle(idea)}</span>
                            <span className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-ink/45">
                              <span>{autoTypeLabels[idea.type]}</span>
                              <span>{idea.deadline === 'today' ? 'Today' : '7 days'}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState title="No matching ideas" body="Try another search or refresh the list." />
                  )}
                </>
              ) : (
                <div className="mx-auto max-w-xl">
                  <div className={`rounded-xl border p-3 ${autoAccentStyles[selectedAutoIdea.accent].card}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-black uppercase ${autoAccentStyles[selectedAutoIdea.accent].chip}`}>{selectedAutoIdea.category}</span>
                      <span className="rounded-full bg-white/75 px-2 py-1 text-[10px] font-bold text-ink/45">{autoTypeLabels[selectedAutoIdea.type]}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink/55">{selectedAutoIdea.description}</p>
                  </div>

                  {selectedAutoIdea.personal ? (
                    <section className="mt-4 rounded-xl border border-line p-3">
                      <p className="text-xs font-black text-ink/55">Who is this about?</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => { setAutoSubjectMode('me'); setAutoSubject([]); setAutoSubjectDisplayName(''); setAutoSubjectCustomName(''); }}
                          className={`rounded-xl border px-3 py-2 text-sm font-black ${autoSubjectMode === 'me' ? 'border-mint bg-mint/10 text-mint' : 'border-line text-ink/55'}`}
                        >
                          Me
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAutoSubjectMode('other'); setAutoSubject([]); setAutoSubjectDisplayName(''); setAutoSubjectCustomName(''); }}
                          className={`rounded-xl border px-3 py-2 text-sm font-black ${autoSubjectMode === 'other' ? 'border-plum bg-plum/10 text-plum' : 'border-line text-ink/55'}`}
                        >
                          Someone else
                        </button>
                      </div>
                      {autoSubjectMode === 'other' ? (
                        <div className="mt-2">
                          <UsernamePicker
                            value={autoSubject}
                            onChange={(next) => {
                              setAutoSubject(next);
                              if (next.length === 0) setAutoSubjectDisplayName('');
                              if (next.length > 0) setAutoSubjectCustomName('');
                            }}
                            onSelectUser={(user) => {
                              setAutoSubjectDisplayName(user.displayName || user.username);
                              setAutoSubjectCustomName('');
                            }}
                            maxSelections={1}
                            exclude={profile?.username ? [profile.username] : []}
                            placeholder="Tag the person"
                          />
                          <p className="mt-1 text-[11px] text-ink/45">Tagged accounts are automatically masked from this bet.</p>
                          <div className="my-2 flex items-center gap-2 text-[10px] font-black uppercase text-ink/30">
                            <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
                          </div>
                          <input
                            value={autoSubjectCustomName}
                            onChange={(event) => {
                              setAutoSubjectCustomName(event.target.value);
                              if (event.target.value) {
                                setAutoSubject([]);
                                setAutoSubjectDisplayName('');
                              }
                            }}
                            placeholder="Write a name"
                            className="w-full rounded-md border border-line bg-field px-3 py-2 text-sm outline-none transition focus:border-plum"
                          />
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="mt-4 rounded-xl border border-line p-3">
                    <p className="text-xs font-black text-ink/55">Your prediction</p>
                    {selectedAutoIdea.type === 'closestNumber' ? (
                      <label className="mt-2 flex h-12 items-center rounded-xl border border-plum/30 bg-plum/5 px-3 focus-within:border-plum">
                        <input
                          type="number"
                          value={autoNumericGuess}
                          onChange={(event) => setAutoNumericGuess(event.target.value)}
                          placeholder="Your closest guess"
                          className="min-w-0 flex-1 bg-transparent text-base font-black text-ink outline-none"
                        />
                        {selectedAutoIdea.unit ? <span className="ml-2 text-sm font-black text-plum">{selectedAutoIdea.unit}</span> : null}
                      </label>
                    ) : (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {selectedAutoIdea.options.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setAutoOptionId(option.id)}
                            className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-black transition active:scale-[0.99] ${
                              autoOptionId === option.id
                                ? autoAccentStyles[selectedAutoIdea.accent].option
                                : 'border-line bg-white text-ink/65 hover:bg-field'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="mt-4 rounded-xl border border-line p-3">
                    <p className="text-xs font-black text-ink/55">Audience</p>
                    <select
                      value={autoAudience}
                      onChange={(event) => { setAutoAudience(event.target.value); setAutoInvited([]); setAutoMasked([]); }}
                      className="mt-2 w-full rounded-xl border border-line bg-field px-3 py-2 text-sm font-semibold outline-none focus:border-mint"
                    >
                      <option value="public">Public</option>
                      <option value="manual">Private users</option>
                      {groups.map((group) => <option key={group.id} value={group.id}>Group: {group.name}</option>)}
                    </select>
                    {autoAudience === 'manual' ? (
                      <div className="mt-3">
                        <p className="mb-1 text-[11px] font-bold text-ink/45">Invited users</p>
                        <UsernamePicker
                          value={autoInvited}
                          onChange={setAutoInvited}
                          exclude={[...(profile?.username ? [profile.username] : []), ...effectiveAutoMasked]}
                          placeholder="Search usernames"
                        />
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <p className="mb-1 text-[11px] font-bold text-ink/45">Masked users</p>
                      {autoSubjectUsername ? (
                        <span className="mb-1.5 inline-flex rounded-full bg-plum/10 px-2 py-1 text-xs font-black text-plum">@{autoSubjectUsername} · subject</span>
                      ) : null}
                      <UsernamePicker
                        value={autoMasked}
                        onChange={setAutoMasked}
                        exclude={[...(profile?.username ? [profile.username] : []), ...(autoSubjectUsername ? [autoSubjectUsername] : [])]}
                        placeholder="Search users to hide it from"
                      />
                    </div>
                  </section>

                  <div className="mt-4 rounded-xl bg-field p-3">
                    <StakeInput value={autoStake} onChange={(value) => setAutoStake(Math.round(value))} min={10} step={10} />
                    <div className="mt-2 flex items-center justify-between text-xs text-ink/45">
                      <span>Available</span>
                      <CoinAmount amount={profile?.coinBalance ?? 0} className="text-xs" />
                    </div>
                  </div>

                  {autoError ? <p className="mt-3 rounded-xl bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">{autoError}</p> : null}
                  <button
                    type="button"
                    onClick={createAndPredictAutoBet}
                    disabled={
                      autoBusy
                      || autoStake < 10
                      || autoStake > (profile?.coinBalance ?? 0)
                      || (selectedAutoIdea.type === 'closestNumber' ? autoNumericGuess.trim() === '' : !autoOptionId)
                      || (selectedAutoIdea.personal && autoSubjectMode === 'other' && !autoSubjectUsername && !autoSubjectCustomName.trim())
                    }
                    className="btn-special mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black disabled:opacity-45"
                  >
                    <Sparkles size={16} />
                    {autoBusy ? 'Making it real...' : <>Create & bet <CoinAmount amount={autoStake} className="text-sm" /></>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
