import { useMemo, useState } from 'react';
import { Bomb, Gem, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { MinigameWinResult } from '../services/rewardService';
import { CoinAmount } from './CoinAmount';
import { StakeInput } from './StakeInput';

type Phase = 'setup' | 'playing' | 'won' | 'lost';

function shuffledBombs(total: number, count: number) {
  const cells = Array.from({ length: total }, (_, index) => index);
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [cells[index], cells[swap]] = [cells[swap], cells[index]];
  }
  return new Set(cells.slice(0, count));
}

function payoutMultiplier(total: number, bombs: number, safeReveals: number) {
  if (safeReveals <= 0) return 1;
  let inverseSurvival = 1;
  for (let reveal = 0; reveal < safeReveals; reveal += 1) {
    inverseSurvival *= (total - reveal) / (total - bombs - reveal);
  }
  return Math.min(7.68, 1 + (inverseSurvival - 1) * 1.229);
}

export function MinesGame({
  coins,
  stakes,
  onCharge,
  onWin,
  onLose,
  onClose,
}: {
  coins: number;
  stakes: number[];
  onCharge: (stake: number) => Promise<boolean>;
  onWin: (payout: number, context: { stake: number; riskLevel: number }) => Promise<MinigameWinResult>;
  onLose: (stake: number, context: { riskLevel: number; blunder: boolean }) => Promise<MinigameWinResult | void> | void;
  onClose: () => void;
}) {
  const [size, setSize] = useState<3 | 5>(5);
  const [bombCount, setBombCount] = useState(3);
  const [stake, setStake] = useState(() => stakes.find((amount) => amount <= coins) ?? stakes[0]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [bombs, setBombs] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settlement, setSettlement] = useState<MinigameWinResult | null>(null);
  const [lastCashout, setLastCashout] = useState(0);

  const total = size * size;
  const safeTotal = total - bombCount;
  const multiplier = payoutMultiplier(total, bombCount, revealed.size);
  const payout = Math.round(stake * multiplier);
  const canStart = stake >= 1 && stake <= coins;

  const cells = useMemo(() => Array.from({ length: total }, (_, index) => index), [total]);

  async function startRound() {
    if (!canStart || busy) return;
    setBusy(true);
    setError('');
    try {
      const charged = await onCharge(stake);
      if (!charged) return;
      setBombs(shuffledBombs(total, bombCount));
      setRevealed(new Set());
      setSettlement(null);
      setPhase('playing');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start Mines.');
    } finally {
      setBusy(false);
    }
  }

  async function settleWin(finalPayout: number) {
    setBusy(true);
    setPhase('won');
    try {
      setSettlement(await onWin(finalPayout, {
        stake,
        riskLevel: Math.min(1, bombCount / Math.max(1, size === 3 ? 3 : 5) + revealed.size / Math.max(1, safeTotal * 1.4)),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The win could not be credited.');
    } finally {
      setBusy(false);
    }
  }

  function revealCell(index: number) {
    if (phase !== 'playing' || revealed.has(index) || busy) return;
    if (bombs.has(index)) {
      setLastCashout(Math.round(stake * payoutMultiplier(total, bombCount, revealed.size)));
      setRevealed(new Set([...revealed, index]));
      setPhase('lost');
      Promise.resolve(onLose(stake, {
        riskLevel: Math.min(1, bombCount / Math.max(1, size === 3 ? 3 : 5) + revealed.size / Math.max(1, safeTotal * 1.4)),
        blunder: revealed.size <= 1,
      })).then((result) => {
        if (result) setSettlement(result);
      }).catch(() => {});
      return;
    }

    const next = new Set(revealed);
    next.add(index);
    setRevealed(next);
    if (next.size === safeTotal) {
      void settleWin(Math.round(stake * payoutMultiplier(total, bombCount, next.size)));
    }
  }

  function reset() {
    setPhase('setup');
    setBombs(new Set());
    setRevealed(new Set());
    setSettlement(null);
    setLastCashout(0);
    setError('');
  }

  return (
    <div className="fixed inset-0 z-[120] flex h-dvh flex-col overflow-hidden bg-[#101927] text-white sm:overflow-y-auto">
      <div
        className="flex items-center justify-between gap-3 px-4 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}
      >
        <div>
          <p className="text-xs font-bold uppercase text-sky-200/60">Arcade</p>
          <h1 className="text-xl font-black">Mines</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
            <CoinAmount amount={Math.round(coins)} className="text-sm" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/10 text-white transition active:scale-95"
            aria-label="Close Mines"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <main className={`mx-auto min-h-0 w-full flex-1 justify-center gap-5 overflow-hidden px-4 py-4 sm:min-h-max sm:overflow-visible ${
        phase === 'setup'
          ? 'flex max-w-3xl flex-col pb-[min(58dvh,430px)] sm:pb-4 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-center lg:gap-x-10'
          : 'flex max-w-3xl flex-col'
      }`}>
        <div className={`flex items-end justify-between gap-3 ${
          phase === 'setup' ? 'lg:col-start-2 lg:row-start-1' : ''
        }`}>
          <div>
            <p className="text-sm font-semibold text-white/55">
              {phase === 'setup' ? 'Choose the board, bombs, and stake.' : `${revealed.size} of ${safeTotal} safe tiles found`}
            </p>
            {phase !== 'setup' ? <p className="mt-1 text-3xl font-black text-white">{multiplier.toFixed(2)}x</p> : null}
          </div>
          {phase === 'playing' && revealed.size > 0 ? (
            <button
              type="button"
              onClick={() => void settleWin(payout)}
              disabled={busy}
              className="rounded-xl bg-mint px-5 py-3 text-sm font-black text-white shadow-lift transition active:scale-95 disabled:opacity-50"
            >
              Cash out <CoinAmount amount={payout} className="ml-1 text-sm text-white" />
            </button>
          ) : phase !== 'setup' ? (
            <div className="text-right">
              <p className="text-xs font-bold text-white/45">Possible cashout</p>
              <CoinAmount amount={payout} className="text-lg" />
            </div>
          ) : null}
        </div>

        <div
          className={`mx-auto grid w-[min(100%,calc(100dvh-13rem),620px)] shrink-0 gap-2 sm:w-full sm:max-w-[min(72vh,620px)] sm:gap-3 ${
            phase === 'setup' ? 'lg:col-start-2 lg:row-start-2' : ''
          } ${
            size === 3 ? 'grid-cols-3' : 'grid-cols-5'
          }`}
        >
          {cells.map((index) => {
            const isRevealed = revealed.has(index);
            const showBomb = bombs.has(index) && (isRevealed || phase === 'lost');
            const showSafe = isRevealed && !bombs.has(index);
            return (
              <button
                key={`${size}-${index}`}
                type="button"
                disabled={phase !== 'playing' || isRevealed}
                onClick={() => revealCell(index)}
                className={`aspect-square min-w-0 rounded-xl border shadow-lg transition duration-200 ${
                  showBomb
                    ? 'animate-mine-burst border-coral bg-coral text-white'
                    : showSafe
                      ? 'animate-mine-reveal border-mint bg-mint text-white'
                      : 'border-white/10 bg-white/10 text-white/30 enabled:hover:-translate-y-0.5 enabled:hover:border-sky-300/60 enabled:hover:bg-white/15 enabled:active:scale-95'
                }`}
                aria-label={showBomb ? 'Bomb' : showSafe ? 'Safe tile' : 'Hidden tile'}
              >
                <span className="grid h-full place-items-center">
                  {showBomb ? <Bomb className="h-1/2 w-1/2" /> : showSafe ? <Gem className="h-1/2 w-1/2" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
              </button>
            );
          })}
        </div>

        {phase === 'setup' ? (
          <section className="fixed inset-x-0 bottom-0 z-20 overflow-hidden rounded-t-2xl border border-white/10 bg-[#172337]/[0.98] p-4 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)+0.25rem))] shadow-[0_-18px_45px_rgba(0,0,0,.35)] backdrop-blur sm:static sm:overflow-visible sm:rounded-2xl sm:bg-white/[0.07] sm:pb-4 sm:shadow-lift lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:w-full lg:self-center">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-black uppercase text-white/45">Board</p>
                <div className="grid grid-cols-2 gap-2">
                  {([3, 5] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSize(option)}
                      className={`rounded-xl border px-3 py-3 text-sm font-black transition ${
                        size === option ? 'border-sky-300 bg-sky-400/20 text-white' : 'border-white/10 bg-white/5 text-white/60'
                      }`}
                    >
                      {option} x {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-black uppercase text-white/45">Bombs</p>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setBombCount(option)}
                      className={`rounded-xl border px-3 py-3 text-sm font-black transition ${
                        bombCount === option ? 'border-coral bg-coral/20 text-white' : 'border-white/10 bg-white/5 text-white/60'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-white p-3 text-ink">
              <StakeInput
                label="Stake"
                value={stake}
                min={1}
                step={1}
                onChange={(value) => setStake(Math.max(1, Math.min(Math.floor(coins), Math.round(value))))}
              />
              <div className="mt-2 flex flex-wrap gap-2">
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

            {error ? <p className="mt-3 text-center text-sm font-bold text-coral">{error}</p> : null}
            <button
              type="button"
              onClick={() => void startRound()}
              disabled={!canStart || busy}
              className="mt-4 w-full rounded-xl bg-sky px-4 py-3.5 text-base font-black text-white shadow-lift transition active:scale-[.99] disabled:opacity-45"
            >
              {busy ? 'Planting mines...' : <>Start for <CoinAmount amount={stake} className="text-base text-white" /></>}
            </button>
          </section>
        ) : null}

        {phase === 'playing' ? (
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-white/55">
            <ShieldCheck size={17} className="text-mint" />
            Every safe tile raises your cashout. Leave before you hit a bomb.
          </div>
        ) : null}
      </main>

      {(phase === 'won' || phase === 'lost') ? (
        <div className="fixed inset-0 z-10 grid place-items-center bg-black/55 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-soft-enter rounded-2xl border border-white/10 bg-[#172337] p-6 text-center shadow-lift">
            <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${phase === 'won' ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'}`}>
              {phase === 'won' ? <Sparkles size={30} /> : <Bomb size={30} />}
            </div>
            <h2 className="mt-4 text-2xl font-black">{phase === 'won' ? 'Cashed out' : 'Mine hit'}</h2>
            <p className={`mt-2 text-4xl font-black ${phase === 'won' ? 'text-mint' : 'text-coral'}`}>
              {phase === 'won' ? <CoinAmount amount={settlement?.payout ?? payout} className="text-4xl" /> : <>-{stake}</>}
            </p>
            <p className="mt-2 text-sm text-white/55">
              {phase === 'won' ? `${revealed.size} safe tiles at ${multiplier.toFixed(2)}x.` : 'The stake is gone. The next board is freshly shuffled.'}
            </p>
            <div
              className={`mx-auto mt-4 grid w-full max-w-56 gap-1.5 ${
                size === 3 ? 'grid-cols-3' : 'grid-cols-5'
              }`}
              aria-label="Mine locations"
            >
              {cells.map((index) => {
                const isBomb = bombs.has(index);
                const wasRevealed = revealed.has(index);
                return (
                  <div
                    key={`result-${size}-${index}`}
                    className={`grid aspect-square place-items-center rounded-lg border ${
                      isBomb
                        ? 'border-coral/70 bg-coral/20 text-coral'
                        : wasRevealed
                          ? 'border-mint/60 bg-mint/15 text-mint'
                          : 'border-white/10 bg-white/5 text-white/15'
                    }`}
                  >
                    {isBomb ? <Bomb className="h-1/2 w-1/2" /> : wasRevealed ? <Gem className="h-1/2 w-1/2" /> : null}
                  </div>
                );
              })}
            </div>
            {phase === 'lost' ? (
              <p className="mt-4 rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-white/60">
                Last available cashout: <CoinAmount amount={lastCashout} className="ml-1 text-sm" />
              </p>
            ) : null}
            {settlement && settlement.ratingDelta !== 0 ? (
              <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-black ${
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
              <button type="button" onClick={reset} disabled={busy} className="flex-1 rounded-xl bg-sky px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                Play again
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
