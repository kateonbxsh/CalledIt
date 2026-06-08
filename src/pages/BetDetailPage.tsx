import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Check, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ChanceChart } from '../components/ChanceChart';
import { CoinAmount } from '../components/CoinAmount';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import {
  addBetComment,
  deleteBet,
  deleteBetComment,
  listChanceSnapshots,
  listCommentsForBet,
  listPredictionsForBet,
  placePrediction,
  reopenBet,
  resolveBet,
  updateBetMetadata,
} from '../services/betService';
import type { Bet, BetComment, BetResolution, ChanceSnapshot, Prediction } from '../types';
import { isClosestType } from '../utils/betTypes';
import {
  closestDateDistance,
  closestDateGuessLabel,
  closestNumberDistance,
  closestNumberGuessLabel,
} from '../utils/closestGuess';
import { percent, relativeTime } from '../utils/format';
import { downscaleBetImage } from '../utils/image';
import { chanceForOption } from '../utils/probability';

function datetimeLocalValue(date?: Date | null) {
  if (!date) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function supportsMultipleWinners(bet: Bet) {
  return bet.type === 'multi' || bet.type === 'openChoice';
}

function resolvedWinnerIds(bet: Bet) {
  return (bet.resolution?.winningOptionIds?.length
    ? bet.resolution.winningOptionIds
    : [bet.resolution?.winningOptionId]).filter((id): id is string => Boolean(id));
}

function normalizeOptionLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreConsistencyError(optionId: string, homeScore?: number, awayScore?: number) {
  if (homeScore === undefined || awayScore === undefined) return '';
  if (optionId === 'home' && homeScore < awayScore) return 'Home cannot win with a lower score.';
  if (optionId === 'away' && awayScore < homeScore) return 'Away cannot win with a lower score.';
  if (optionId === 'draw' && homeScore !== awayScore) return 'Draw needs equal scores.';
  return '';
}

function predictionTime(prediction: Prediction) {
  return prediction.createdAt ? relativeTime(prediction.createdAt) : 'just now';
}

function predictionDetail(bet: Bet, prediction: Prediction) {
  if (bet.type === 'closestNumber') return closestNumberGuessLabel(prediction.numericGuess);
  if (bet.type === 'closestDate') return closestDateGuessLabel(prediction.dateGuess);

  const option = bet.options.find((item) => item.id === prediction.optionId);
  const label = option?.label ?? prediction.customOptionLabel ?? prediction.optionId;
  if (bet.type === 'sports' && prediction.scorePrediction) {
    return `${label}, ${prediction.scorePrediction.home}-${prediction.scorePrediction.away}`;
  }
  return label;
}

export function BetDetailPage() {
  const { betId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [bet, setBet] = useState<Bet | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [snapshots, setSnapshots] = useState<ChanceSnapshot[]>([]);
  const [comments, setComments] = useState<BetComment[]>([]);
  const [selected, setSelected] = useState('');
  const [stake, setStake] = useState(10);
  const [commentBody, setCommentBody] = useState('');
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [numericGuess, setNumericGuess] = useState('');
  const [dateGuess, setDateGuess] = useState('');
  const [customOptionLabel, setCustomOptionLabel] = useState('');
  const [winningOptionId, setWinningOptionId] = useState('');
  const [winningOptionIds, setWinningOptionIds] = useState<string[]>([]);
  const [actualHomeScore, setActualHomeScore] = useState('');
  const [actualAwayScore, setActualAwayScore] = useState('');
  const [actualValue, setActualValue] = useState('');
  const [actualDateValue, setActualDateValue] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState('');
  const [confirmingResolution, setConfirmingResolution] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingBet, setEditingBet] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editImageBusy, setEditImageBusy] = useState(false);

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
    const [nextPredictions, nextSnapshots, nextComments] = await Promise.all([
      listPredictionsForBet(nextBet.id),
      listChanceSnapshots(nextBet.id),
      listCommentsForBet(nextBet.id),
    ]);

    setBet(nextBet);
    setPredictions(nextPredictions);
    setSnapshots(nextSnapshots);
    setComments(nextComments);
    setSelected(nextBet.options[0]?.id ?? '');
    setWinningOptionId(nextBet.options[0]?.id ?? '');
    setWinningOptionIds(nextBet.options[0]?.id ? [nextBet.options[0].id] : []);
    setEditTitle(nextBet.title);
    setEditDescription(nextBet.description ?? '');
    setEditCategory(nextBet.category ?? '');
    setEditDeadline(datetimeLocalValue(nextBet.deadline?.toDate() ?? null));
    setEditImageUrl(nextBet.imageUrl ?? '');
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

  useEffect(() => {
    if (!myPrediction || !bet || bet.status !== 'open') return;
    setSelected(myPrediction.optionId);
    setStake(myPrediction.stake);
    setCustomOptionLabel(myPrediction.customOptionLabel ?? '');
    setHomeScore(myPrediction.scorePrediction?.home?.toString() ?? '');
    setAwayScore(myPrediction.scorePrediction?.away?.toString() ?? '');
    setNumericGuess(myPrediction.numericGuess?.toString() ?? '');
    setDateGuess(myPrediction.dateGuess ?? '');
  }, [bet, myPrediction]);

  const closest = bet ? isClosestType(bet.type) : false;
  const multiWinner = bet ? supportsMultipleWinners(bet) : false;
  const canPredict = bet?.status === 'open';
  const canResolve = !!profile && !!bet;
  const selectedChance = bet && !closest ? chanceForOption(bet.chanceSummary, selected) : 0;
  const estimatedProfit = selectedChance > 0 ? Math.max(0, Math.floor(stake * (1 / selectedChance - 1))) : 0;
  const estimatedReturn = stake + estimatedProfit;
  const estimatedSkillReward = selectedChance > 0 ? Math.max(10, Math.round(10 * Math.sqrt(Math.max(10, stake) / 50) * Math.sqrt(1 / Math.max(0.05, selectedChance)))) : 0;
  const selectedOption = bet?.options.find((o) => o.id === selected);
  const winningOptions = bet?.options.filter((o) => (multiWinner ? winningOptionIds : [winningOptionId]).includes(o.id)) ?? [];
  const canEditBet = !!profile && !!bet && profile.uid === bet.creatorId;
  const openChoiceQuery = normalizeOptionLabel(customOptionLabel);
  const openChoiceMatches =
    bet?.type === 'openChoice' && openChoiceQuery
      ? bet.options
          .filter((option) => normalizeOptionLabel(option.label).includes(openChoiceQuery))
          .slice(0, 5)
      : [];
  const exactOpenChoiceMatch = openChoiceMatches.find(
    (option) => normalizeOptionLabel(option.label) === openChoiceQuery,
  );

  function buildResolution(): BetResolution {
    if (closest && bet) {
      return {
        winningOptionId: 'guess',
        ...(bet.type === 'closestNumber' && actualValue !== '' ? { actualValue: Number(actualValue) } : {}),
        ...(bet.type === 'closestDate' && actualDateValue ? { actualDateValue } : {}),
        ...(resolutionNote.trim() ? { note: resolutionNote.trim() } : {}),
      };
    }
    const selectedWinners = multiWinner ? winningOptionIds : [winningOptionId];
    const resolution: BetResolution = {
      winningOptionId: selectedWinners[0],
      ...(multiWinner ? { winningOptionIds: selectedWinners } : {}),
    };
    if (resolutionNote.trim()) resolution.note = resolutionNote.trim();
    if (actualHomeScore !== '') resolution.actualHomeScore = Number(actualHomeScore);
    if (actualAwayScore !== '') resolution.actualAwayScore = Number(actualAwayScore);
    return resolution;
  }

  async function submitPrediction(event: FormEvent) {
    event.preventDefault();
    if (!bet || !profile) return;
    if (bet.type === 'sports' && bet.allowExactScore && homeScore !== '' && awayScore !== '') {
      const scoreError = scoreConsistencyError(selected, Number(homeScore), Number(awayScore));
      if (scoreError) {
        setError(scoreError);
        return;
      }
    }
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
        customOptionLabel: bet.type === 'openChoice' ? customOptionLabel : undefined,
      });
      setCustomOptionLabel('');
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
    if (multiWinner && winningOptionIds.length === 0) {
      setError('Select at least one winning option.');
      return;
    }
    if (bet.type === 'sports' && actualHomeScore !== '' && actualAwayScore !== '') {
      const selectedWinner = multiWinner ? winningOptionIds[0] : winningOptionId;
      const scoreError = scoreConsistencyError(selectedWinner, Number(actualHomeScore), Number(actualAwayScore));
      if (scoreError) {
        setError(scoreError);
        return;
      }
    }
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

  async function onEditImageChange(file?: File) {
    if (!file) return;
    setEditImageBusy(true);
    setError('');
    try {
      setEditImageUrl(await downscaleBetImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process image.');
    } finally {
      setEditImageBusy(false);
    }
  }

  async function submitBetEdit(event: FormEvent) {
    event.preventDefault();
    if (!bet || !canEditBet) return;
    setBusy(true);
    setError('');
    try {
      await updateBetMetadata(bet.id, {
        title: editTitle,
        description: editDescription || undefined,
        category: editCategory,
        deadline: editDeadline ? new Date(editDeadline) : null,
        imageUrl: editImageUrl || undefined,
      });
      setEditingBet(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update bet.');
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!bet || !profile) return;
    setCommentBusy(true);
    setError('');
    try {
      await addBetComment(bet.id, profile, commentBody);
      setCommentBody('');
      setComments(await listCommentsForBet(bet.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add comment.');
    } finally {
      setCommentBusy(false);
    }
  }

  async function onDeleteComment(comment: BetComment) {
    setDeletingCommentId(comment.id);
    setError('');
    try {
      await deleteBetComment(comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete comment.');
    } finally {
      setDeletingCommentId('');
    }
  }

  function toggleWinningOption(optionId: string) {
    setWinningOptionIds((current) =>
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    );
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
            <h1 className="break-words text-2xl font-black tracking-normal sm:text-3xl md:truncate">{bet.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/65">
              <Link to={`/profile/${bet.creatorId}`} className="font-bold text-ink/75 hover:underline">
                @{bet.creatorUsername}
              </Link>
              <span>{bet.category || 'General'}</span>
              <span>{bet.status}</span>
              <span>{bet.deadline ? `deadline ${relativeTime(bet.deadline)}` : 'no deadline'}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {canEditBet ? (
            <button onClick={() => setEditingBet(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold">
              <Pencil size={17} /> Edit
            </button>
          ) : null}
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

          <div className="rounded-md border border-line bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-bold">Bet History</h2>
              <span className="text-xs font-bold text-ink/45">{predictions.length}</span>
            </div>
            {predictions.length === 0 ? (
              <p className="rounded-md bg-field px-3 py-3 text-sm text-ink/50">No bets yet</p>
            ) : (
              <div className="max-h-72 overflow-y-auto pr-1">
                <div className="divide-y divide-line/70 overflow-hidden rounded-md border border-line">
                  {[...predictions]
                    .sort((left, right) => right.createdAt.toMillis() - left.createdAt.toMillis())
                    .map((prediction) => (
                      <div key={prediction.id} className="grid gap-2 bg-white px-3 py-2.5 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link to={`/profile/${prediction.userId}`} className="font-bold text-ink hover:underline">
                              @{prediction.username}
                            </Link>
                            <span className="text-xs text-ink/40">{predictionTime(prediction)}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs font-semibold text-ink/55">{predictionDetail(bet, prediction)}</p>
                        </div>
                        <CoinAmount amount={prediction.stake} className="text-sm" />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          {/* Prediction panel */}
          <section className="rounded-md border border-line bg-white p-4">
            <h2 className="mb-3 font-bold">Prediction</h2>
            {myPrediction ? (
              <div className="mb-3 rounded-md bg-mint/10 p-3 text-sm text-mint">
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
                {(myPrediction.revisionCount ?? 0) > 0 ? (
                  <p className="mt-2 text-xs font-semibold text-mint/80">
                    Updated {myPrediction.revisionCount}x - fees paid {myPrediction.changeFeesPaid ?? 0} coins
                  </p>
                ) : null}
              </div>
            ) : null}
            {canPredict ? (
              <form className="space-y-3" onSubmit={submitPrediction}>
                {/* Option tile picker */}
                {!closest && bet.options.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-ink/50">
                      {bet.type === 'openChoice' ? 'Pick an existing answer' : 'Your pick'}
                    </p>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(bet.options.length, 2)}, 1fr)` }}>
                      {bet.options.map((option) => {
                        const chance = chanceForOption(bet.chanceSummary, option.id);
                        const isSelected = selected === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setSelected(option.id);
                              if (bet.type === 'openChoice') setCustomOptionLabel('');
                            }}
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

                {bet.type === 'openChoice' ? (
                  <div className="block text-sm font-medium">
                    Add your own answer
                    <input
                      className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
                      value={customOptionLabel}
                      onChange={(e) => setCustomOptionLabel(e.target.value)}
                      placeholder={bet.options.length ? 'Or type a new answer' : 'Type your answer'}
                      required={bet.options.length === 0}
                    />
                    {openChoiceMatches.length > 0 ? (
                      <div className="mt-2 overflow-hidden rounded-xl border border-line bg-white">
                        {openChoiceMatches.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setSelected(option.id);
                              setCustomOptionLabel('');
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-field"
                          >
                            <span className="font-semibold">{option.label}</span>
                            <span className="text-xs font-bold text-ink/40">
                              {exactOpenChoiceMatch?.id === option.id ? 'same answer' : 'choose'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <span className="mt-1 block text-xs text-ink/50">
                      Pick a suggestion if it already exists. Exact matches reuse the existing answer.
                    </span>
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
                      value={stake}
                      onChange={(e) => setStake(Number(e.target.value))}
                    />
                    <button
                      type="button"
                      onClick={() => setStake((s) => s + 10)}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white text-lg font-bold text-ink/60 transition hover:bg-field active:scale-95"
                    >+</button>
                  </div>
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
                    <div className="mt-1 flex items-center justify-between text-ink/45">
                      <span>Skill reward</span>
                      <CoinAmount amount={estimatedSkillReward} className="text-xs" />
                    </div>
                    {myPrediction ? (
                      <div className="mt-1 flex items-center justify-between text-ink/45">
                        <span>Update fee</span>
                        <CoinAmount amount={Math.max(1, myPrediction.lastChangeFee ?? 3)} className="text-xs" />
                      </div>
                    ) : null}
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
                  {busy ? 'Submitting...' : myPrediction ? 'Update prediction' : 'Submit prediction'}
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
                  <div>
                    <p className="font-bold text-ink/55">
                      {resolvedWinnerIds(bet).length > 1 ? 'Winning options' : 'Winning option'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {resolvedWinnerIds(bet).map((id) => (
                        <span key={id} className="rounded-full bg-mint/10 px-2 py-1 text-xs font-black text-mint">
                          {bet.options.find((o) => o.id === id)?.label ?? id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <form className="space-y-3" onSubmit={requestResolution}>
                {!closest && multiWinner ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-ink/55">Winning options</p>
                    {bet.options.map((option) => (
                      <label key={option.id} className="flex items-center gap-2 rounded-md bg-field px-3 py-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={winningOptionIds.includes(option.id)}
                          onChange={() => toggleWinningOption(option.id)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                ) : !closest ? (
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

        <section className="rounded-md border border-line bg-white p-4 lg:col-start-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-bold">Comments</h2>
            <span className="text-xs font-bold text-ink/45">{comments.length}</span>
          </div>

          <form onSubmit={submitComment} className="mb-4 space-y-2">
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-line bg-field px-3 py-2 text-sm outline-none focus:border-mint"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              maxLength={1000}
              placeholder="Add a comment"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-ink/40">{commentBody.trim().length}/1000</span>
              <button
                disabled={commentBusy || !commentBody.trim()}
                className="rounded-md bg-ink px-4 py-2 text-sm font-bold text-white transition active:scale-95 disabled:opacity-50"
              >
                {commentBusy ? 'Posting...' : 'Post'}
              </button>
            </div>
          </form>

          {comments.length === 0 ? (
            <p className="rounded-md bg-field px-3 py-3 text-sm text-ink/50">No comments yet</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => {
                const canDeleteComment = profile?.uid === comment.userId || profile?.isAdmin;
                return (
                  <article key={comment.id} className="flex gap-3 rounded-md bg-field p-3">
                    <Avatar
                      name={comment.displayName || comment.username}
                      src={comment.photoURL}
                      round
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <Link to={`/profile/${comment.userId}`} className="font-bold text-ink hover:underline">
                          {comment.displayName || comment.username}
                        </Link>
                        <span className="text-xs font-semibold text-ink/45">@{comment.username}</span>
                        <span className="text-xs text-ink/35">{relativeTime(comment.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink/75">{comment.body}</p>
                    </div>
                    {canDeleteComment ? (
                      <button
                        type="button"
                        onClick={() => onDeleteComment(comment)}
                        disabled={deletingCommentId === comment.id}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink/35 transition hover:bg-white hover:text-coral disabled:opacity-40"
                        aria-label="Delete comment"
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {editingBet ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/35 px-4 backdrop-blur-sm">
          <form onSubmit={submitBetEdit} className="max-h-[90vh] w-full max-w-lg animate-soft-enter overflow-y-auto rounded-md border border-line bg-white p-5 shadow-lift">
            <h2 className="text-lg font-black">Edit bet</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Title
                <input
                  className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Description
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border border-line bg-field px-3 py-2"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Category
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                    value={editCategory}
                    onChange={(event) => setEditCategory(event.target.value)}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Deadline
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                    type="datetime-local"
                    value={editDeadline}
                    onChange={(event) => setEditDeadline(event.target.value)}
                  />
                </label>
              </div>
              <label className="block text-sm font-medium">
                Image
                <input
                  className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                  type="file"
                  accept="image/*"
                  onChange={(event) => onEditImageChange(event.target.files?.[0])}
                />
              </label>
              {editImageBusy ? <p className="text-xs text-ink/55">Resizing image...</p> : null}
              {editImageUrl ? (
                <div className="overflow-hidden rounded-md border border-line">
                  <img src={editImageUrl} alt="" className="max-h-48 w-full object-cover" />
                  <button type="button" onClick={() => setEditImageUrl('')} className="w-full bg-white px-3 py-2 text-xs font-semibold text-ink/70">
                    Remove image
                  </button>
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingBet(false)}
                disabled={busy}
                className="flex-1 rounded-md border border-line bg-white px-4 py-3 text-sm font-bold text-ink/70"
              >
                Cancel
              </button>
              <button disabled={busy || editImageBusy} className="flex-1 rounded-md bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
                {busy ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

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
                  <p className="font-bold text-ink/55">
                    {winningOptions.length > 1 ? 'Winning options' : 'Winning option'}
                  </p>
                  <p className="mt-1 font-black">
                    {winningOptions.map((option) => option.label).join(', ') || 'Unknown'}
                  </p>
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
