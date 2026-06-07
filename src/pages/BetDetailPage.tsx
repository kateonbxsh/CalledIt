import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { ChanceChart } from '../components/ChanceChart';
import { CoinAmount } from '../components/CoinAmount';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import {
  deleteBet,
  listChanceSnapshots,
  listPredictionsForBet,
  placePrediction,
  reopenBet,
  resolveBet,
} from '../services/betService';
import type { Bet, BetResolution, ChanceSnapshot, Prediction } from '../types';
import { isClosestType } from '../utils/betTypes';
import { maxStakeForBalance } from '../utils/coins';
import {
  closestDateDistance,
  closestDateGuessLabel,
  closestNumberDistance,
  closestNumberGuessLabel,
} from '../utils/closestGuess';
import { percent, relativeTime } from '../utils/format';
import { chanceForOption } from '../utils/probability';

export function BetDetailPage() {
  const { betId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [bet, setBet] = useState<Bet | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [snapshots, setSnapshots] = useState<ChanceSnapshot[]>([]);
  const [selected, setSelected] = useState('');
  const [stake, setStake] = useState(10);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [numericGuess, setNumericGuess] = useState('');
  const [dateGuess, setDateGuess] = useState('');
  const [winningOptionId, setWinningOptionId] = useState('');
  const [actualHomeScore, setActualHomeScore] = useState('');
  const [actualAwayScore, setActualAwayScore] = useState('');
  const [actualValue, setActualValue] = useState('');
  const [actualDateValue, setActualDateValue] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingResolution, setConfirmingResolution] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const load = useCallback(async () => {
    if (!betId) return;
    setLoading(true);
    setError('');
    setNotFound(false);

    const betSnap = await getDoc(doc(db, 'bets', betId));
    if (!betSnap.exists()) {
      setBet(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const nextBet = { id: betSnap.id, ...betSnap.data() } as Bet;
    const [nextPredictions, nextSnapshots] = await Promise.all([
      listPredictionsForBet(nextBet.id),
      listChanceSnapshots(nextBet.id),
    ]);

    setBet(nextBet);
    setPredictions(nextPredictions);
    setSnapshots(nextSnapshots);
    setSelected(nextBet.options[0]?.id ?? '');
    setWinningOptionId(nextBet.options[0]?.id ?? '');
    setLoading(false);
  }, [betId]);

  useEffect(() => {
    load().catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not load bet.');
      setLoading(false);
    });
  }, [load]);

  const myPrediction = useMemo(
    () => predictions.find((p) => p.userId === profile?.uid),
    [predictions, profile?.uid],
  );
  const maxStake = profile ? maxStakeForBalance(profile.coinBalance) : 0;
  const closest = bet ? isClosestType(bet.type) : false;
  const canPredict = bet?.status === 'open' && !myPrediction;
  const canResolve = !!profile && !!bet;
  const selectedChance = bet && !closest ? chanceForOption(bet.chanceSummary, selected) : 0;
  const estimatedProfit = selectedChance > 0 ? Math.max(0, Math.floor(stake * (1 / selectedChance - 1))) : 0;
  const estimatedReturn = stake + estimatedProfit;
  const selectedOption = bet?.options.find((o) => o.id === selected);
  const winningOption = bet?.options.find((o) => o.id === winningOptionId);

  function buildResolution(): BetResolution {
    if (closest && bet) {
      return {
        winningOptionId: 'guess',
        ...(bet.type === 'closestNumber' && actualValue !== '' ? { actualValue: Number(actualValue) } : {}),
        ...(bet.type === 'closestDate' && actualDateValue ? { actualDateValue } : {}),
        ...(resolutionNote.trim() ? { note: resolutionNote.trim() } : {}),
      };
    }
    const resolution: BetResolution = { winningOptionId };
    if (resolutionNote.trim()) resolution.note = resolutionNote.trim();
    if (actualHomeScore !== '') resolution.actualHomeScore = Number(actualHomeScore);
    if (actualAwayScore !== '') resolution.actualAwayScore = Number(actualAwayScore);
    return resolution;
  }

  async function submitPrediction(event: FormEvent) {
    event.preventDefault();
    if (!bet || !profile) return;
    setBusy(true);
    setError('');
    try {
      await placePrediction({
        bet,
        user: profile,
        optionId: closest ? 'guess' : selected,
        stake,
        scorePrediction:
          bet.type === 'sports' && bet.allowExactScore && homeScore !== '' && awayScore !== ''
            ? { home: Number(homeScore), away: Number(awayScore) }
            : undefined,
        numericGuess: bet.type === 'closestNumber' && numericGuess !== '' ? Number(numericGuess) : undefined,
        dateGuess: bet.type === 'closestDate' && dateGuess ? dateGuess : undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place prediction.');
    } finally {
      setBusy(false);
    }
  }

  function requestResolution(event: FormEvent) {
    event.preventDefault();
    if (!bet || !profile) return;
    setConfirmingResolution(true);
  }

  async function confirmResolution() {
    if (!bet || !profile) return;
    setBusy(true);
    setError('');
    try {
      await resolveBet(bet, buildResolution(), profile.uid);
      setConfirmingResolution(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve bet.');
    } finally {
      setBusy(false);
    }
  }

  async function onReopen() {
    if (!bet) return;
    setBusy(true);
    try {
      await reopenBet(bet);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!bet) return;
    setBusy(true);
    setError('');
    try {
      await deleteBet(bet);
      navigate('/mine');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete bet.');
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="h-20 animate-pulse rounded-md bg-white" />
          <div className="h-44 animate-pulse rounded-md bg-white" />
          <div className="h-64 animate-pulse rounded-md bg-white" />
        </div>
        <div className="h-80 animate-pulse rounded-md bg-white" />
      </div>
    );
  }

  if (notFound || !bet) {
    return <EmptyState title="Bet not found" body="It may be private or no longer available." />;
  }

  // Sort predictions for closest types: winner first, then by distance
  const sortedPredictions = closest && bet.status === 'resolved' && bet.resolution
    ? [...predictions].sort((a, b) => {
        const aWon = bet.resolution!.winnerPredictionIds?.includes(a.id) ? 0 : 1;
        const bWon = bet.resolution!.winnerPredictionIds?.includes(b.id) ? 0 : 1;
        if (aWon !== bWon) return aWon - bWon;
        if (bet.type === 'closestNumber' && bet.resolution!.actualValue !== undefined) {
          return (closestNumberDistance(a.numericGuess, bet.resolution!.actualValue!) ?? Infinity)
            - (closestNumberDistance(b.numericGuess, bet.resolution!.actualValue!) ?? Infinity);
        }
        if (bet.type === 'closestDate' && bet.resolution!.actualDateValue) {
          return (closestDateDistance(a.dateGuess, bet.resolution!.actualDateValue!) ?? Infinity)
            - (closestDateDistance(b.dateGuess, bet.resolution!.actualDateValue!) ?? Infinity);
        }
        return 0;
      })
    : predictions;

  return (
    <>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {bet.imageUrl ? (
            <img src={bet.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-md border border-line object-cover shadow-soft sm:h-20 sm:w-20" />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-normal sm:text-3xl">{bet.title}</h1>
            <p className="mt-1 text-sm text-ink/65">
              {bet.category || 'General'} - {bet.status} {bet.deadline ? `- deadline ${relativeTime(bet.deadline)}` : '- no deadline'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {profile?.isAdmin && bet.status === 'resolved' ? (
            <button onClick={onReopen} disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold">
              <RotateCcw size={17} /> Reopen
            </button>
          ) : null}
          {profile?.uid === bet.creatorId && (bet.predictionCount === 0 || bet.status === 'resolved') ? (
            <button onClick={() => setConfirmingDelete(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-coral/30 bg-white px-4 py-2 text-sm font-semibold text-coral">
              <Trash2 size={17} /> Delete
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="mb-4 rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-white p-3">
            <span className={`rounded-full px-3 py-1 text-xs font-black ${bet.status === 'open' ? 'bg-mint/12 text-mint' : 'bg-coral/12 text-coral'}`}>
              {bet.status === 'open' ? 'Open' : 'Closed'}
            </span>
            <span className="rounded-full bg-field px-3 py-1 text-xs font-bold text-ink/60">{bet.category || 'General'}</span>
            <span className="text-sm font-semibold text-ink/55">{bet.predictionCount} predictions</span>
            <CoinAmount amount={bet.totalCoinsStaked} className="text-sm" />
          </div>

          <div className="animate-soft-enter rounded-md border border-line bg-white p-4">
            {bet.description ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-ink/75">{bet.description}</p>
            ) : (
              <p className="text-sm text-ink/50 italic">No description provided</p>
            )}
          </div>

          {/* Closest type: show participant guesses */}
          {closest ? (
            <div className="rounded-md border border-line bg-white p-4">
              <h2 className="mb-3 font-bold">
                {bet.status === 'resolved' ? 'Results' : 'Participants'}
                {bet.status === 'resolved' && bet.resolution ? (
                  <span className="ml-2 text-sm font-normal text-ink/55">
                    Actual: {bet.type === 'closestNumber'
                      ? String(bet.resolution.actualValue ?? '—')
                      : closestDateGuessLabel(bet.resolution.actualDateValue)}
                  </span>
                ) : null}
              </h2>
              {bet.status !== 'resolved' ? (
                <p className="text-sm text-ink/55 italic">Guesses are hidden until the bet is resolved.</p>
              ) : sortedPredictions.length === 0 ? (
                <p className="text-sm text-ink/55">No predictions yet.</p>
              ) : (
                <div className="space-y-2">
                  {sortedPredictions.map((p) => {
                    const isWinner = bet.resolution?.winnerPredictionIds?.includes(p.id);
                    const dist = bet.type === 'closestNumber' && bet.resolution?.actualValue !== undefined
                      ? closestNumberDistance(p.numericGuess, bet.resolution.actualValue)
                      : bet.type === 'closestDate' && bet.resolution?.actualDateValue
                        ? closestDateDistance(p.dateGuess, bet.resolution.actualDateValue)
                        : null;
                    return (
                      <div key={p.id} className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${isWinner ? 'bg-mint/10 font-semibold' : 'bg-field'}`}>
                        <span>{p.username}</span>
                        <span className="font-mono text-xs">
                          {bet.type === 'closestNumber'
                            ? closestNumberGuessLabel(p.numericGuess)
                            : closestDateGuessLabel(p.dateGuess)}
                          {dist !== null ? <span className="ml-2 text-ink/45">±{dist}{bet.type === 'closestDate' ? 'd' : ''}</span> : null}
                        </span>
                        {isWinner ? <span className="text-xs font-black text-mint">Winner</span> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-md border border-line bg-white p-4">
                <h2 className="mb-3 font-bold">Option Breakdown</h2>
                <div className="space-y-3">
                  {bet.chanceSummary.map((summary) => {
                    const option = bet.options.find((item) => item.id === summary.optionId);
                    return (
                      <div key={summary.optionId}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-semibold">{option?.label}</span>
                          <span>{percent(summary.chance)}</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-field">
                          <div className="h-full bg-mint animate-fill-bar" style={{ width: `${summary.chance * 100}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-ink/55">
                          <span className="inline-flex items-center gap-1">
                            {summary.users} people - <CoinAmount amount={summary.coins} className="text-xs" />
                          </span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h2 className="mb-3 font-bold">Chance History</h2>
                <ChanceChart bet={bet} snapshots={snapshots} />
              </div>
            </>
          )}
        </section>

        <aside className="space-y-4">
          {/* Prediction panel */}
          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="mb-3 font-bold">Prediction</h2>
            {myPrediction ? (
              <div className="rounded-md bg-mint/10 p-3 text-sm text-mint">
                <Check className="mb-2" size={18} />
                {closest ? (
                  <span>
                    Your guess:{' '}
                    <strong>
                      {bet.type === 'closestNumber'
                        ? closestNumberGuessLabel(myPrediction.numericGuess)
                        : closestDateGuessLabel(myPrediction.dateGuess)}
                    </strong>
                    {' '}with <CoinAmount amount={myPrediction.stake} className="text-sm" />
                  </span>
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    You picked {bet.options.find((o) => o.id === myPrediction.optionId)?.label} with{' '}
                    <CoinAmount amount={myPrediction.stake} className="text-sm" />
                  </span>
                )}
              </div>
            ) : canPredict ? (
              <form className="space-y-3" onSubmit={submitPrediction}>
                {/* Option tile picker */}
                {!closest ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-ink/50">Your pick</p>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(bet.options.length, 2)}, 1fr)` }}>
                      {bet.options.map((option) => {
                        const chance = chanceForOption(bet.chanceSummary, option.id);
                        const isSelected = selected === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSelected(option.id)}
                            className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
                              isSelected
                                ? 'border-ink bg-ink text-white'
                                : 'border-line bg-field hover:border-ink/30 hover:bg-white'
                            }`}
                          >
                            <p className={`truncate text-xs ${isSelected ? 'text-white/70' : 'text-ink/50'}`}>{option.label}</p>
                            <p className={`mt-0.5 text-base font-black ${isSelected ? 'text-white' : 'text-ink'}`}>{percent(chance)}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Closest number guess */}
                {bet.type === 'closestNumber' ? (
                  <label className="block text-sm font-medium">
                    Your number guess
                    <input
                      className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
                      type="number"
                      step="any"
                      value={numericGuess}
                      onChange={(e) => setNumericGuess(e.target.value)}
                      placeholder="Enter your guess"
                      required
                    />
                  </label>
                ) : null}

                {/* Closest date guess */}
                {bet.type === 'closestDate' ? (
                  <label className="block text-sm font-medium">
                    Your date guess
                    <input
                      className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
                      type="date"
                      value={dateGuess}
                      onChange={(e) => setDateGuess(e.target.value)}
                      required
                    />
                  </label>
                ) : null}

                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ink/50">Stake</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStake((s) => Math.max(10, s - 10))}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-lg font-bold text-ink/60 transition hover:bg-field active:scale-95"
                    >−</button>
                    <input
                      className="w-full rounded-xl border border-line bg-field px-3 py-2.5 text-center outline-none focus:border-mint"
                      type="number"
                      min={10}
                      max={maxStake}
                      value={stake}
                      onChange={(e) => setStake(Number(e.target.value))}
                    />
                    <button
                      type="button"
                      onClick={() => setStake((s) => Math.min(maxStake, s + 10))}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-lg font-bold text-ink/60 transition hover:bg-field active:scale-95"
                    >+</button>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink/45">
                    Max <CoinAmount amount={maxStake} className="text-xs" />
                  </p>
                </div>

                {!closest && selectedChance > 0 ? (
                  <div className="rounded-xl bg-field px-3 py-2.5 text-xs text-ink/60">
                    <div className="flex items-center justify-between">
                      <span>Est. profit if <span className="font-semibold text-ink/80">{selectedOption?.label}</span> wins</span>
                      <CoinAmount amount={estimatedProfit} className="text-xs" />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-ink/45">
                      <span>Total return</span>
                      <CoinAmount amount={estimatedReturn} className="text-xs" />
                    </div>
                  </div>
                ) : null}

                {bet.type === 'sports' && bet.allowExactScore ? (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-ink/50">Score prediction (optional bonus)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint" type="number" min={0} placeholder={bet.homeTeam || 'Team 1'} value={homeScore} onChange={(e) => setHomeScore(e.target.value)} />
                      <input className="rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint" type="number" min={0} placeholder={bet.awayTeam || 'Team 2'} value={awayScore} onChange={(e) => setAwayScore(e.target.value)} />
                    </div>
                  </div>
                ) : null}

                <button disabled={busy} className="w-full rounded-xl bg-ink px-4 py-3 font-bold text-white disabled:opacity-60">
                  {busy ? 'Submitting…' : 'Submit prediction'}
                </button>
              </form>
            ) : (
              <p className="text-sm text-ink/60">Prediction is closed or unavailable for this bet.</p>
            )}
          </section>

          {/* Resolve panel */}
          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="mb-3 font-bold">Resolve</h2>
            {!canResolve ? (
              <p className="text-sm text-ink/60">Sign in to resolve this bet.</p>
            ) : bet.status === 'resolved' ? (
              <div className="text-sm text-ink/70">
                {closest ? (
                  <>
                    <p className="font-bold text-ink/55">Actual value</p>
                    <p className="mt-1 font-black">
                      {bet.type === 'closestNumber'
                        ? String(bet.resolution?.actualValue ?? '—')
                        : closestDateGuessLabel(bet.resolution?.actualDateValue)}
                    </p>
                  </>
                ) : (
                  <p>Winning option: {bet.options.find((o) => o.id === bet.resolution?.winningOptionId)?.label}</p>
                )}
              </div>
            ) : (
              <form className="space-y-3" onSubmit={requestResolution}>
                {!closest ? (
                  <select className="w-full rounded-md border border-line bg-field px-3 py-2" value={winningOptionId} onChange={(e) => setWinningOptionId(e.target.value)}>
                    {bet.options.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                ) : null}

                {bet.type === 'closestNumber' ? (
                  <label className="block text-sm font-medium">
                    Actual value
                    <input
                      className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                      type="number"
                      step="any"
                      value={actualValue}
                      onChange={(e) => setActualValue(e.target.value)}
                      placeholder="The real answer"
                      required
                    />
                  </label>
                ) : null}

                {bet.type === 'closestDate' ? (
                  <label className="block text-sm font-medium">
                    Actual date
                    <input
                      className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                      type="date"
                      value={actualDateValue}
                      onChange={(e) => setActualDateValue(e.target.value)}
                      required
                    />
                  </label>
                ) : null}

                {bet.type === 'sports' ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-ink/55">Actual score</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="rounded-md border border-line bg-field px-3 py-2" type="number" min={0} placeholder={bet.homeTeam || 'Team 1'} value={actualHomeScore} onChange={(e) => setActualHomeScore(e.target.value)} />
                      <input className="rounded-md border border-line bg-field px-3 py-2" type="number" min={0} placeholder={bet.awayTeam || 'Team 2'} value={actualAwayScore} onChange={(e) => setActualAwayScore(e.target.value)} />
                    </div>
                  </div>
                ) : null}

                <textarea className="min-h-20 w-full rounded-md border border-line bg-field px-3 py-2" placeholder="Resolution note (optional)" value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
                <button disabled={busy} className="w-full rounded-md bg-coral px-4 py-3 font-semibold text-white disabled:opacity-60">
                  Resolve bet
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>

      {/* Resolution confirm modal */}
      {confirmingResolution ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-soft-enter rounded-md border border-line bg-white p-5 shadow-lift">
            <h2 className="text-lg font-black">Resolve this bet?</h2>
            <p className="mt-2 text-sm leading-6 text-ink/65">
              This will close the bet, mark predictions as won or lost, and apply ELO and coin changes.
            </p>
            <div className="mt-4 rounded-md bg-field p-3 text-sm">
              {closest ? (
                <>
                  <p className="font-bold text-ink/55">Actual value</p>
                  <p className="mt-1 font-black">
                    {bet.type === 'closestNumber' ? (actualValue || '—') : (actualDateValue ? closestDateGuessLabel(actualDateValue) : '—')}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-ink/55">Winning option</p>
                  <p className="mt-1 font-black">{winningOption?.label ?? 'Unknown'}</p>
                </>
              )}
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmingResolution(false)} disabled={busy} className="flex-1 rounded-md border border-line bg-white px-4 py-3 text-sm font-bold text-ink/70">
                Cancel
              </button>
              <button type="button" onClick={confirmResolution} disabled={busy} className="flex-1 rounded-md bg-coral px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
                {busy ? 'Resolving…' : 'Yes, resolve'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Delete confirm modal */}
      {confirmingDelete ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-soft-enter rounded-md border border-line bg-white p-5 shadow-lift">
            <h2 className="text-lg font-black">Delete this bet?</h2>
            <p className="mt-2 text-sm text-ink/65">
              The bet will be permanently removed and will no longer appear in any feed.
              {bet.predictionCount > 0 ? ' Prediction records and any coin/rating changes already applied will remain.' : ''}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} className="flex-1 rounded-md border border-line bg-white px-4 py-3 text-sm font-bold text-ink/70">
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} disabled={busy} className="flex-1 rounded-md bg-coral px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
