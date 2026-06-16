import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp, Hash, Minus, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import type { MinigameWinResult } from '../services/rewardService';
import { minigameAffectsRating } from '../services/rewardService';
import { CoinAmount } from './CoinAmount';
import { StakeInput } from './StakeInput';

type Phase = 'setup' | 'playing' | 'won' | 'lost';
type GuessFeedback = 'higher' | 'lower' | 'correct';

type GuessEntry = {
  value: number;
  feedback: GuessFeedback;
};

const GUESS_LIMIT = 100;
const OPTIMAL_GUESSES = 7;
const MAX_GUESSES = 10;
function randomTarget() {
  return 1 + Math.floor(Math.random() * GUESS_LIMIT);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function boundsFromGuesses(guesses: GuessEntry[]) {
  let min = 1;
  let max = GUESS_LIMIT;
  for (const guess of guesses) {
    if (guess.feedback === 'higher') min = Math.max(min, guess.value + 1);
    if (guess.feedback === 'lower') max = Math.min(max, guess.value - 1);
  }
  return { min, max };
}

function midpoint(min: number, max: number) {
  return Math.floor((min + max) / 2);
}

function multiplierForAttempt(attempt: number, variance: number) {
  const speed = clamp((OPTIMAL_GUESSES - attempt) / (OPTIMAL_GUESSES - 1), 0, 1);
  const base = 1.04 + (speed ** 1.9) * 1.36;
  return Math.max(1.02, Math.min(2.3, base * variance));
}

function refundRateForAttempts(attempts: number) {
  return attempts <= OPTIMAL_GUESSES ? 1 : 0;
}

function riskLevelForAttempts(attempts: number) {
  if (attempts <= 2) return 0.9;
  if (attempts <= 4) return 0.78;
  if (attempts <= 6) return 0.62;
  if (attempts === 7) return 0.4;
  return 0.34;
}

function ratingDeltaForSlowSolve(stake: number, attempts: number) {
  const extra = Math.max(0, attempts - OPTIMAL_GUESSES);
  return -extra;
}

function ratingDeltaForFastSolve(stake: number, attempts: number) {
  const riskLevel = riskLevelForAttempts(attempts);
  const eligible = minigameAffectsRating({
    game: 'guessing',
    stake,
    riskLevel,
  });
  if (!eligible) return 0;
  const speed = clamp((OPTIMAL_GUESSES - attempts) / (OPTIMAL_GUESSES - 1), 0, 1);
  return clamp(Math.round(2 + (speed ** 1.18) * 14), 2, 16);
}

export function NumberGuessGame({
  coins,
  stakes,
  onCharge,
  onWin,
  onSettleCustom,
  onClose,
}: {
  coins: number;
  stakes: number[];
  onCharge: (stake: number) => Promise<boolean>;
  onWin: (payout: number, context: { stake: number; riskLevel: number }) => Promise<MinigameWinResult>;
  onSettleCustom: (params: { payout: number; ratingDelta?: number; historyDelta?: number; reason?: string }) => Promise<MinigameWinResult>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [stake, setStake] = useState(() => stakes.find((amount) => amount <= coins) ?? stakes[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<number | null>(null);
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [guessText, setGuessText] = useState('50');
  const [settlement, setSettlement] = useState<MinigameWinResult | null>(null);
  const [finalRefund, setFinalRefund] = useState(0);
  const [roundVariance, setRoundVariance] = useState(1);
  const knobDragRef = useRef<{ pointerId: number; angle: number } | null>(null);
  const knobRemainderRef = useRef(0);

  const { min: currentMin, max: currentMax } = boundsFromGuesses(guesses);
  const suggestedGuess = midpoint(currentMin, currentMax);
  const numericGuess = Number(guessText);
  const parsedGuess = Number.isFinite(numericGuess) ? Math.round(numericGuess) : NaN;
  const guessAlreadyUsed = guesses.some((guess) => guess.value === parsedGuess);
  const isGuessValid = Number.isFinite(parsedGuess)
    && parsedGuess >= currentMin
    && parsedGuess <= currentMax
    && !guessAlreadyUsed;
  const canStart = stake >= 1 && stake <= coins;
  const attempts = guesses.length;
  const currentAttempt = attempts + 1;
  const currentMultiplier = currentAttempt < OPTIMAL_GUESSES
    ? multiplierForAttempt(currentAttempt, roundVariance)
    : 1;

  useEffect(() => {
    if (phase !== 'playing') return;
    if (guessText === '') return;
    if ((Number.isFinite(parsedGuess) && (parsedGuess < currentMin || parsedGuess > currentMax)) || guessAlreadyUsed) {
      setGuessText(String(suggestedGuess));
    }
  }, [phase, parsedGuess, currentMin, currentMax, guessAlreadyUsed, suggestedGuess, guessText]);

  function setKnobValue(next: number) {
    setGuessText(String(clamp(Math.round(next), currentMin, currentMax)));
  }

  function angleForPointer(clientX: number, clientY: number, rect: DOMRect) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return Math.atan2(clientY - centerY, clientX - centerX);
  }

  function normalizedAngleDelta(next: number, previous: number) {
    let delta = next - previous;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function knobRotationForValue(value: number) {
    const span = Math.max(1, currentMax - currentMin);
    const ratio = (value - currentMin) / span;
    return -135 + ratio * 270;
  }

  function handleKnobPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    knobDragRef.current = {
      pointerId: event.pointerId,
      angle: angleForPointer(event.clientX, event.clientY, rect),
    };
    knobRemainderRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleKnobPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!knobDragRef.current || knobDragRef.current.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextAngle = angleForPointer(event.clientX, event.clientY, rect);
    const delta = normalizedAngleDelta(nextAngle, knobDragRef.current.angle);
    knobDragRef.current.angle = nextAngle;
    knobRemainderRef.current += delta * (180 / Math.PI);
    const stepDelta = knobRemainderRef.current / 7;
    const wholeSteps = stepDelta > 0 ? Math.floor(stepDelta) : Math.ceil(stepDelta);
    if (wholeSteps !== 0) {
      knobRemainderRef.current -= wholeSteps * 7;
      const baseValue = Number.isFinite(parsedGuess) ? parsedGuess : suggestedGuess;
      setKnobValue(baseValue + wholeSteps);
    }
  }

  function handleKnobPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!knobDragRef.current || knobDragRef.current.pointerId !== event.pointerId) return;
    knobDragRef.current = null;
    knobRemainderRef.current = 0;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function startRound() {
    if (!canStart || busy) return;
    setBusy(true);
    setError('');
    try {
      const charged = await onCharge(stake);
      if (!charged) return;
      setTarget(randomTarget());
      setGuesses([]);
      setSettlement(null);
      setFinalRefund(0);
      setGuessText('50');
      setRoundVariance(0.94 + Math.random() * 0.14);
      setPhase('playing');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start.');
    } finally {
      setBusy(false);
    }
  }

  async function resolveWin(nextGuesses: GuessEntry[]) {
    const finalAttempts = nextGuesses.length;
    const riskLevel = riskLevelForAttempts(finalAttempts);
    setBusy(true);
    try {
      if (finalAttempts < OPTIMAL_GUESSES) {
        const multiplier = multiplierForAttempt(finalAttempts, roundVariance);
        const payout = Math.round(stake * multiplier);
        const result = await onSettleCustom({
          payout,
          ratingDelta: ratingDeltaForFastSolve(stake, finalAttempts),
          historyDelta: payout,
          reason: 'Number guessing fast solve',
        });
        setSettlement(result);
        setFinalRefund(result.payout);
        setPhase('won');
        return;
      }

      if (finalAttempts === OPTIMAL_GUESSES) {
        const payout = Math.round(stake * 0.5);
        const result = await onSettleCustom({
          payout,
          ratingDelta: 0,
          historyDelta: payout - stake,
          reason: 'Number guessing seven-guess finish',
        });
        setSettlement(result);
        setFinalRefund(payout);
        setPhase('won');
        return;
      }

      const refund = Math.round(stake * refundRateForAttempts(finalAttempts));
      const ratingDelta = ratingDeltaForSlowSolve(stake, finalAttempts);
      const result = await onSettleCustom({
        payout: refund,
        ratingDelta,
        historyDelta: refund - stake,
        reason: 'Number guessing overflow',
      });
      setSettlement(result);
      setFinalRefund(refund);
      setPhase('lost');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not settle.');
    } finally {
      setBusy(false);
    }
  }

  function submitGuess() {
    if (phase !== 'playing' || !target || busy || !isGuessValid) return;
    const value = parsedGuess;
    const feedback: GuessFeedback = value < target ? 'higher' : value > target ? 'lower' : 'correct';
    const nextGuesses = [...guesses, { value, feedback }];
    setGuesses(nextGuesses);
    if (feedback === 'correct') {
      void resolveWin(nextGuesses);
      return;
    }
    if (nextGuesses.length >= MAX_GUESSES) {
      void resolveWin(nextGuesses);
      return;
    }
    const nextBounds = boundsFromGuesses(nextGuesses);
    const nudgedGuess = feedback === 'higher'
      ? clamp(value + 1, nextBounds.min, nextBounds.max)
      : clamp(value - 1, nextBounds.min, nextBounds.max);
    setGuessText(String(nudgedGuess));
  }

  function reset() {
    setPhase('setup');
    setTarget(null);
    setGuesses([]);
    setSettlement(null);
    setFinalRefund(0);
    setError('');
    setGuessText('50');
    knobDragRef.current = null;
    knobRemainderRef.current = 0;
  }

  const displayGuess = Number.isFinite(parsedGuess) ? clamp(parsedGuess, currentMin, currentMax) : suggestedGuess;
  const validationLabel = guessAlreadyUsed ? 'Used' : !isGuessValid && guessText !== '' ? 'Range' : '';
  const knobRotation = knobRotationForValue(displayGuess);
  const knobProgress = clamp(knobRotation + 135, 0, 270);

  return (
    <div className="fixed inset-0 z-[120] flex h-dvh flex-col overflow-hidden bg-[#101927] text-white">
      <div
        className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}
      >
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-sky-200/60">Arcade</p>
          <h1 className="truncate text-xl font-black">Number Guessing</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
            <CoinAmount amount={Math.round(coins)} className="text-sm" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/10 text-white transition active:scale-95"
            aria-label="Close Number Guessing"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col justify-center gap-3 overflow-hidden px-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] sm:gap-4">
        {phase === 'setup' ? (
          <section className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.07] p-4 shadow-[0_22px_60px_rgba(0,0,0,.35)] sm:p-5">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-sky text-white shadow-lift">
              <Hash size={36} />
            </div>
            <div className="rounded-xl bg-white p-3 text-ink">
              <StakeInput
                label="Stake"
                value={stake}
                min={1}
                step={1}
                onChange={(value) => setStake(Math.max(1, Math.min(Math.floor(coins), Math.round(value))))}
              />
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {stakes.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    disabled={amount > coins}
                    onClick={() => setStake(amount)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${
                      stake === amount ? 'border-sky bg-sky/10 text-sky' : 'border-line bg-white text-ink/65'
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>
            {error ? <p className="text-center text-sm font-bold text-coral">{error}</p> : null}
            <button
              type="button"
              onClick={() => void startRound()}
              disabled={!canStart || busy}
              className="btn-special w-full rounded-xl px-4 py-4 text-base font-black text-white shadow-lift transition active:scale-[.99] disabled:opacity-45"
            >
              {busy ? 'Starting...' : <>Start <CoinAmount amount={stake} className="text-base text-white" /></>}
            </button>
          </section>
        ) : (
          <>
            <div className="grid shrink-0 grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                <p className="text-2xs font-black uppercase text-white/40">Range</p>
                <p className="mt-0.5 text-sm font-black sm:text-base">{currentMin}-{currentMax}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                <p className="text-2xs font-black uppercase text-white/40">Guess</p>
                <p className="mt-0.5 text-sm font-black sm:text-base">{attempts}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                <p className="text-2xs font-black uppercase text-white/40">Current multiplier</p>
                <p className="mt-0.5 text-sm font-black sm:text-base">
                  {currentAttempt < OPTIMAL_GUESSES ? `${currentMultiplier.toFixed(2)}x` : currentAttempt === OPTIMAL_GUESSES ? 'Half back' : currentAttempt >= MAX_GUESSES ? 'Auto bust' : 'Bust'}
                </p>
              </div>
            </div>

            <div className="min-h-[92px] shrink-0 overflow-x-auto pb-1">
              <div className="flex min-w-max justify-center gap-2">
                {guesses.length === 0 ? (
                  Array.from({ length: 6 }, (_, index) => (
                    <div key={index} className="h-[82px] w-[74px] rounded-2xl border border-dashed border-white/10 bg-white/[0.03]" />
                  ))
                ) : guesses.map((guess, index) => {
                  const isHigher = guess.feedback === 'higher';
                  const isLower = guess.feedback === 'lower';
                  const isCorrect = guess.feedback === 'correct';
                  return (
                    <div
                      key={`${guess.value}-${index}`}
                      className={`flex h-[82px] w-[74px] shrink-0 flex-col items-center justify-center rounded-2xl border shadow-card ${
                        isCorrect
                          ? 'border-mint/40 bg-mint/15 text-mint'
                          : isHigher
                            ? 'border-citrus/35 bg-citrus/15 text-citrus'
                            : 'border-plum/35 bg-plum/15 text-purple-200'
                      }`}
                    >
                      <span className="text-xl font-black text-white">{guess.value}</span>
                      {isCorrect ? <Sparkles size={17} /> : isHigher ? <ArrowUp size={17} /> : isLower ? <ArrowDown size={17} /> : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <section className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col justify-center">
              <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(65,150,220,.18),transparent_55%),rgba(255,255,255,.07)] p-4 shadow-[0_22px_60px_rgba(0,0,0,.35)] sm:p-5">
                <div
                  className="mx-auto grid aspect-square w-[min(52dvh,64vw,300px)] min-w-[190px] max-w-[300px] cursor-grab place-items-center rounded-full border border-line bg-white p-3 shadow-lift active:cursor-grabbing"
                  style={{
                    touchAction: 'none',
                    background: `conic-gradient(from 225deg, #3b75af 0deg, #7b5aa6 ${knobProgress}deg, rgba(217,222,216,.95) ${knobProgress}deg, rgba(217,222,216,.95) 270deg, transparent 270deg 360deg)`,
                  }}
                  onPointerDown={handleKnobPointerDown}
                  onPointerMove={handleKnobPointerMove}
                  onPointerUp={handleKnobPointerUp}
                  onPointerCancel={handleKnobPointerUp}
                >
                  <div className="relative grid h-full w-full place-items-center rounded-full border border-white bg-field shadow-[inset_0_10px_24px_rgba(18,20,23,.08),inset_0_-14px_22px_rgba(255,255,255,.9)]">
                    <div className="absolute inset-[8%] rounded-full border border-line bg-white shadow-soft" />
                    <div className="absolute inset-[18%] rounded-full border border-dashed border-line/80" />
                    <div className="relative grid h-[58%] w-[58%] place-items-center rounded-full border border-line bg-white text-center shadow-lift">
                      <div className="absolute left-1/2 top-3 h-2 w-2 -translate-x-1/2 rounded-full bg-sky shadow-soft" />
                      <div>
                        <p className="text-[11px] font-black uppercase text-ink/40">Number</p>
                        <p className="text-6xl font-black leading-none text-ink sm:text-7xl">{displayGuess}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setGuessText(String(clamp(displayGuess - 1, currentMin, currentMax)))}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15 active:scale-95 sm:h-14 sm:w-14"
                    aria-label="Lower guess"
                  >
                    <Minus size={21} />
                  </button>
                  <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-sky/20 bg-white px-3 text-ink shadow-soft focus-within:border-sky sm:h-14">
                    <Hash size={18} className="shrink-0 text-sky" />
                    <input
                      type="number"
                      min={currentMin}
                      max={currentMax}
                      value={guessText}
                      onChange={(event) => setGuessText(event.target.value)}
                      onBlur={() => {
                        const value = Number(guessText);
                        setGuessText(String(Number.isFinite(value) ? clamp(Math.round(value), currentMin, currentMax) : suggestedGuess));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          submitGuess();
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-center text-xl font-black outline-none sm:text-2xl"
                      aria-label="Your guess"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setGuessText(String(clamp(displayGuess + 1, currentMin, currentMax)))}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15 active:scale-95 sm:h-14 sm:w-14"
                    aria-label="Raise guess"
                  >
                    <Plus size={21} />
                  </button>
                </div>

                {validationLabel || error ? (
                  <p className="mt-3 text-center text-sm font-black text-coral">{error || validationLabel}</p>
                ) : null}
                <button
                  type="button"
                  onClick={submitGuess}
                  disabled={!isGuessValid || busy}
                  className="btn-special mt-4 w-full rounded-xl px-4 py-4 text-base font-black text-white shadow-lift transition active:scale-[.99] disabled:opacity-45"
                >
                  {busy ? 'Settling...' : 'Guess'}
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {(phase === 'won' || phase === 'lost') && target !== null ? (
        <div className="fixed inset-0 z-10 grid place-items-center bg-black/55 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-soft-enter rounded-2xl border border-white/10 bg-[#172337] p-6 text-center shadow-lift">
            <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${phase === 'won' ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'}`}>
              {phase === 'won' ? <Sparkles size={30} /> : <RotateCcw size={30} />}
            </div>
            <h2 className="mt-4 text-2xl font-black">{phase === 'won' ? 'Solved' : 'Too slow'}</h2>
            <p className="mt-1 text-sm font-semibold text-white/50">#{target} in {guesses.length}</p>
            <p className={`mt-4 text-4xl font-black ${phase === 'won' ? 'text-mint' : 'text-coral'}`}>
              <CoinAmount amount={finalRefund} className="text-4xl" />
            </p>
            {settlement && settlement.ratingDelta !== 0 ? (
              <p className={`mt-4 rounded-xl px-3 py-2 text-sm font-black ${
                settlement.ratingDelta > 0 ? 'bg-plum/20 text-purple-200' : 'bg-coral/15 text-coral'
              }`}>
                {settlement.ratingDelta > 0 ? '+' : ''}{settlement.ratingDelta} ELO
              </p>
            ) : null}
            {error ? <p className="mt-3 text-sm font-bold text-coral">{error}</p> : null}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white/70">
                Leave
              </button>
              <button type="button" onClick={reset} disabled={busy} className="btn-special flex-1 rounded-xl px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                Again
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
