import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Check, RotateCcw } from 'lucide-react';
import { ChanceChart } from '../components/ChanceChart';
import { CoinAmount } from '../components/CoinAmount';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import {
  listChanceSnapshots,
  listPredictionsForBet,
  placePrediction,
  reopenBet,
  resolveBet,
} from '../services/betService';
import type { Bet, BetResolution, ChanceSnapshot, Prediction } from '../types';
import { maxStakeForBalance } from '../utils/coins';
import { percent, relativeTime } from '../utils/format';
import { chanceForOption } from '../utils/probability';

export function BetDetailPage() {
  const { betId } = useParams();
  const { profile } = useAuth();
  const [bet, setBet] = useState<Bet | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [snapshots, setSnapshots] = useState<ChanceSnapshot[]>([]);
  const [selected, setSelected] = useState('');
  const [stake, setStake] = useState(10);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [winningOptionId, setWinningOptionId] = useState('');
  const [actualHomeScore, setActualHomeScore] = useState('');
  const [actualAwayScore, setActualAwayScore] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingResolution, setConfirmingResolution] = useState(false);

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
    () => predictions.find((prediction) => prediction.userId === profile?.uid),
    [predictions, profile?.uid],
  );
  const maxStake = profile ? maxStakeForBalance(profile.coinBalance) : 0;
  const canPredict = bet?.status === 'open' && !myPrediction;
  const canResolve = profile && bet && (profile.isAdmin || profile.uid === bet.creatorId);
  const selectedChance = bet ? chanceForOption(bet.chanceSummary, selected) : 0;
  const estimatedProfit = selectedChance > 0 ? Math.max(0, Math.floor(stake * (1 / selectedChance - 1))) : 0;
  const estimatedReturn = stake + estimatedProfit;
  const selectedOption = bet?.options.find((option) => option.id === selected);
  const winningOption = bet?.options.find((option) => option.id === winningOptionId);

  function buildResolution(): BetResolution {
    const resolution: BetResolution = {
      winningOptionId,
    };
    if (resolutionNote.trim()) {
      resolution.note = resolutionNote.trim();
    }
    if (actualHomeScore !== '') {
      resolution.actualHomeScore = Number(actualHomeScore);
    }
    if (actualAwayScore !== '') {
      resolution.actualAwayScore = Number(actualAwayScore);
    }
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
        optionId: selected,
        stake,
        scorePrediction:
          bet.type === 'sports' && bet.allowExactScore && homeScore !== '' && awayScore !== ''
            ? { home: Number(homeScore), away: Number(awayScore) }
            : undefined,
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

  return (
    <>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {bet.imageUrl ? (
            <img
              src={bet.imageUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-md border border-line object-cover shadow-soft sm:h-20 sm:w-20"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-normal sm:text-3xl">{bet.title}</h1>
            <p className="mt-1 text-sm text-ink/65">
              {bet.category || 'General'} - {bet.status} {bet.deadline ? `- deadline ${relativeTime(bet.deadline)}` : '- no deadline'}
            </p>
          </div>
        </div>
        {profile?.isAdmin && bet.status === 'resolved' ? (
          <button
            onClick={onReopen}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold"
          >
            <RotateCcw size={17} /> Reopen
          </button>
        ) : null}
      </header>

      {error ? <p className="mb-4 rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-white p-3">
            <span className={`rounded-full px-3 py-1 text-xs font-black ${bet.status === 'open' ? 'bg-mint/12 text-mint' : 'bg-coral/12 text-coral'}`}>
              {bet.status === 'open' ? 'Open' : 'Closed'}
            </span>
            <span className="rounded-full bg-field px-3 py-1 text-xs font-bold text-ink/60">
              {bet.category || 'General'}
            </span>
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
                      <div
                        className="h-full bg-mint animate-fill-bar"
                        style={{ width: `${summary.chance * 100}%` }}
                      />
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
        </section>

        <aside className="space-y-4">
          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="mb-3 font-bold">Prediction</h2>
            {myPrediction ? (
              <div className="rounded-md bg-mint/10 p-3 text-sm text-mint">
                <Check className="mb-2" size={18} />
                <span className="inline-flex flex-wrap items-center gap-1">
                  You picked {bet.options.find((option) => option.id === myPrediction.optionId)?.label} with{' '}
                  <CoinAmount amount={myPrediction.stake} className="text-sm" />
                </span>
              </div>
            ) : canPredict ? (
              <form className="space-y-3" onSubmit={submitPrediction}>
                <label className="block text-sm font-medium">
                  Pick
                  <select className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" value={selected} onChange={(event) => setSelected(event.target.value)}>
                    {bet.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Stake
                  <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" type="number" min={10} max={maxStake} value={stake} onChange={(event) => setStake(Number(event.target.value))} />
                  <span className="mt-1 flex items-center gap-1 text-xs text-ink/55">
                    Max now <CoinAmount amount={maxStake} className="text-xs" />
                  </span>
                </label>
                <div className="rounded-md border border-line bg-field p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-ink/65">
                      Estimate if {selectedOption?.label ?? 'this pick'} wins
                    </span>
                    <span className="text-xs font-black text-ink/45">{percent(selectedChance)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink/55">
                    <span className="inline-flex items-center gap-1">
                      Profit about <CoinAmount amount={estimatedProfit} className="text-xs" />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      Return about <CoinAmount amount={estimatedReturn} className="text-xs" />
                    </span>
                  </div>
                </div>
                {bet.type === 'sports' && bet.allowExactScore ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input className="rounded-md border border-line bg-field px-3 py-2" type="number" min={0} placeholder="Home" value={homeScore} onChange={(event) => setHomeScore(event.target.value)} />
                    <input className="rounded-md border border-line bg-field px-3 py-2" type="number" min={0} placeholder="Away" value={awayScore} onChange={(event) => setAwayScore(event.target.value)} />
                  </div>
                ) : null}
                <button disabled={busy} className="w-full rounded-md bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60">
                  {busy ? 'Submitting...' : 'Submit prediction'}
                </button>
              </form>
            ) : (
              <p className="text-sm text-ink/60">Prediction is closed or unavailable for this bet.</p>
            )}
          </section>

          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="mb-3 font-bold">Resolve</h2>
            {!canResolve ? (
              <p className="text-sm text-ink/60">Only the bet creator can resolve this bet.</p>
            ) : bet.status === 'resolved' ? (
              <p className="text-sm text-ink/70">
                Winning option: {bet.options.find((option) => option.id === bet.resolution?.winningOptionId)?.label}
              </p>
            ) : (
              <form className="space-y-3" onSubmit={requestResolution}>
                <select className="w-full rounded-md border border-line bg-field px-3 py-2" value={winningOptionId} onChange={(event) => setWinningOptionId(event.target.value)}>
                  {bet.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {bet.type === 'sports' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input className="rounded-md border border-line bg-field px-3 py-2" type="number" min={0} placeholder="Actual home" value={actualHomeScore} onChange={(event) => setActualHomeScore(event.target.value)} />
                    <input className="rounded-md border border-line bg-field px-3 py-2" type="number" min={0} placeholder="Actual away" value={actualAwayScore} onChange={(event) => setActualAwayScore(event.target.value)} />
                  </div>
                ) : null}
                <textarea className="min-h-20 w-full rounded-md border border-line bg-field px-3 py-2" placeholder="Resolution note" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} />
                <button disabled={busy} className="w-full rounded-md bg-coral px-4 py-3 font-semibold text-white disabled:opacity-60">
                  Resolve bet
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>
      {confirmingResolution ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-soft-enter rounded-md border border-line bg-white p-5 shadow-lift">
            <h2 className="text-lg font-black">Resolve this bet?</h2>
            <p className="mt-2 text-sm leading-6 text-ink/65">
              This will close the bet, mark predictions as won or lost, and apply ELO and coin changes.
            </p>
            <div className="mt-4 rounded-md bg-field p-3 text-sm">
              <p className="font-bold text-ink/55">Winning option</p>
              <p className="mt-1 font-black">{winningOption?.label ?? 'Unknown'}</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingResolution(false)}
                disabled={busy}
                className="flex-1 rounded-md border border-line bg-white px-4 py-3 text-sm font-bold text-ink/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResolution}
                disabled={busy}
                className="flex-1 rounded-md bg-coral px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? 'Resolving...' : 'Yes, resolve'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
