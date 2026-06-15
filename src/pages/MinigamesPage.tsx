import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BadgeDollarSign,
  Bomb,
  Check,
  ChevronRight,
  Dice5,
  Flame,
  Gift,
  MessageCircle,
  Plane,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { CoinAmount } from '../components/CoinAmount';
import { MinesGame } from '../components/MinesGame';
import { PageHeader } from '../components/PageHeader';
import { PlaneGame } from '../components/PlaneGame';
import { RewardChest } from '../components/RewardChest';
import { useAuth } from '../contexts/AuthContext';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import {
  awardPlaneWin,
  awardMinigameWin,
  chargeMinigameStake,
  chargePlaneStake,
  recordMinigameLoss,
  claimChest,
  claimDailyForecast,
  getChestDefinitions,
  spinWheel,
  wheelRewards,
} from '../services/rewardService';
import { getDailyBonusProgress } from '../services/bonusService';
import { sendTestPushToAllUsers } from '../services/notificationService';
import type { ChestDefinition, DailyForecastMode } from '../types';
import { canClaimSixHourReward } from '../utils/coins';

const wheelColors = ['#2f7d63', '#d95f46', '#d49a25', '#8c98a5', '#3b75af', '#d95f46', '#6f5ca8', '#121417'];
const WHEEL_SPIN_MS = 4400;

const forecastCards = {
  safe: {
    title: 'Safe',
    reward: <CoinAmount amount={120} className="text-2xs" />,
    copy: <>Claim <CoinAmount amount={120} className="text-xs" /> now.</>,
    Icon: ShieldCheck,
    shell: 'border-mint/25 bg-mint/10 hover:border-mint/40 hover:bg-mint/15',
    icon: 'bg-mint text-white',
    pill: 'bg-mint/10 text-mint',
  },
  random: {
    title: 'Random',
    reward: <span className="inline-flex items-center gap-1"><CoinAmount amount={20} className="text-2xs" /><span>to</span><CoinAmount amount={200} className="text-2xs" /></span>,
    copy: <>Roll once for <CoinAmount amount={20} className="text-xs" /> to <CoinAmount amount={200} className="text-xs" />.</>,
    Icon: Dice5,
    shell: 'border-sky/25 bg-sky/10 hover:border-sky/40 hover:bg-sky/15',
    icon: 'bg-sky text-white',
    pill: 'bg-sky/10 text-sky',
  },
  chaos: {
    title: 'Chaos',
    reward: <span className="inline-flex items-center gap-1"><CoinAmount amount={-40} className="text-2xs text-coral" /><span>/</span><CoinAmount amount={10} className="text-2xs" /><span>/</span><CoinAmount amount={260} className="text-2xs" /></span>,
    copy: <>Roll: <CoinAmount amount={-40} className="text-xs text-coral" />, <CoinAmount amount={10} className="text-xs" />, or <CoinAmount amount={260} className="text-xs" />.</>,
    Icon: Zap,
    shell: 'border-coral/25 bg-coral/10 hover:border-coral/40 hover:bg-coral/15',
    icon: 'bg-coral text-white',
    pill: 'bg-coral/10 text-coral',
  },
  spicy: {
    title: 'Spicy',
    reward: <span className="inline-flex items-center gap-1"><CoinAmount amount={40} className="text-2xs" /><span>then</span><CoinAmount amount={240} className="text-2xs" /></span>,
    copy: <>Claim <CoinAmount amount={40} className="text-xs" /> now; arm <CoinAmount amount={240} className="text-xs" /> if your next prediction wins.</>,
    Icon: Flame,
    shell: 'border-plum/25 bg-plum/10 hover:border-plum/40 hover:bg-plum/15',
    icon: 'bg-plum text-white',
    pill: 'bg-plum/10 text-plum',
  },
} satisfies Record<DailyForecastMode, {
  title: string;
  reward: ReactNode;
  copy: ReactNode;
  Icon: typeof ShieldCheck;
  shell: string;
  icon: string;
  pill: string;
}>;

type RewardPopupState = {
  title: string;
  amount: number;
  detail: string;
  variant: 'forecast' | 'wheel' | 'chest';
};

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function wheelSlicePath(index: number, total: number) {
  const start = (360 / total) * index;
  const end = (360 / total) * (index + 1);
  const startPoint = polarToCartesian(150, 150, 140, end);
  const endPoint = polarToCartesian(150, 150, 140, start);
  return [
    `M 150 150`,
    `L ${startPoint.x} ${startPoint.y}`,
    `A 140 140 0 0 0 ${endPoint.x} ${endPoint.y}`,
    'Z',
  ].join(' ');
}

function signedCoins(amount: number) {
  return amount > 0 ? `+${amount} coins` : amount < 0 ? `${amount} coins` : '0 coins';
}

export function MinigamesPage() {
  const { profile } = useAuth();
  const [chests, setChests] = useState<ChestDefinition[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [wheelResult, setWheelResult] = useState<number | null>(null);
  const [wheelRevealed, setWheelRevealed] = useState(false);
  const [wheelTurns, setWheelTurns] = useState(0);
  const [openedChestId, setOpenedChestId] = useState('');
  const [forecastMode, setForecastMode] = useState<DailyForecastMode | null>(null);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [chestsOpen, setChestsOpen] = useState(false);
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const [dailyBonusProgress, setDailyBonusProgress] = useState<any>({
    totalClaimed: 0,
    bonuses: [],
    potential: 270,
    bonusAmounts: { bet: 100, challenge: 100, prediction: 50, comment: 20 },
    claimedTypes: [],
  });
  const [testPushSending, setTestPushSending] = useState(false);
  const [showPlane, setShowPlane] = useState(false);
  const [showMines, setShowMines] = useState(false);
  const forecastSheet = useSwipeToDismiss(() => setForecastOpen(false), forecastOpen);
  const chestsSheet = useSwipeToDismiss(() => setChestsOpen(false), chestsOpen);
  const wheelSheet = useSwipeToDismiss(() => setWheelOpen(false), wheelOpen);
  const forecastAvailable = profile ? canClaimSixHourReward(profile.lastDailyForecastAt?.toDate?.() ?? null) : false;
  const wheelAvailable = profile ? canClaimSixHourReward(profile.lastWheelSpinAt?.toDate?.() ?? null) : false;
  const openableChests = chests.filter((chest) => chest.unlocked && !chest.claimed).length;

  useEffect(() => {
    if (!profile) return;
    getChestDefinitions(profile).then(setChests).catch(() => setChests([]));
    getDailyBonusProgress(profile.uid).then(setDailyBonusProgress).catch(() => {
      // On error (likely permissions), show default empty progress
      setDailyBonusProgress({
        totalClaimed: 0,
        bonuses: [],
        potential: 270,
        bonusAmounts: { bet: 100, challenge: 100, prediction: 50, comment: 20 },
        claimedTypes: [],
      });
    });
  }, [profile]);

  const wheelRotation = useMemo(() => {
    if (wheelResult === null) return 0;
    const index = Math.max(0, wheelRewards.findIndex((option) => option.amount === wheelResult));
    const slice = 360 / wheelRewards.length;
    return wheelTurns * 1440 + 360 - index * slice - slice / 2;
  }, [wheelResult, wheelTurns]);

  async function forecast(mode: DailyForecastMode) {
    if (!profile) return;
    setBusy(`forecast-${mode}`);
    setMessage('');
    setForecastMode(null);
    try {
      const reward = await claimDailyForecast(profile, mode);
      setForecastMode(mode);
      const messages: Record<DailyForecastMode, string> = {
        safe: `Safe reward claimed: +${reward.amount} coins.`,
        random: `Random reward claimed: +${reward.amount} coins.`,
        chaos: reward.amount >= 0 ? `Chaos reward claimed: +${reward.amount} coins.` : `Chaos reward claimed: ${reward.amount} coins.`,
        spicy: `Spicy reward claimed: +${reward.amount} now, +${reward.spicyBonus ?? 0} only if your next prediction wins.`,
      };
      setMessage(messages[mode]);
      setForecastOpen(false);
      setRewardPopup({
        title: `${mode[0].toUpperCase()}${mode.slice(1)} forecast`,
        amount: reward.amount,
        detail: mode === 'spicy'
          ? `You got ${reward.amount} coins now. The ${reward.spicyBonus ?? 0} coin spicy bonus only pays if your next resolved prediction wins.`
          : reward.amount < 0
            ? 'Chaos took coins this time.'
            : 'Coins were added to your balance.',
        variant: 'forecast',
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Daily forecast unavailable.');
    } finally {
      setBusy('');
    }
  }

  async function openChest(chestId: string) {
    if (!profile) return;
    setBusy(`chest-${chestId}`);
    setMessage('');
    setOpenedChestId('');
    try {
      const reward = await claimChest(profile, chestId);
      setOpenedChestId(chestId);
      setMessage(`Chest opened: +${reward.amount} coins.`);
      setChestsOpen(false);
      setRewardPopup({
        title: `${reward.label} opened`,
        amount: reward.amount,
        detail: 'Chest reward added to your balance.',
        variant: 'chest',
      });
      setChests(await getChestDefinitions(profile));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Chest unavailable.');
    } finally {
      setBusy('');
    }
  }

  async function wheel() {
    if (!profile) return;
    setBusy('wheel');
    setMessage('');
    try {
      setWheelOpen(true);
      setWheelRevealed(false);
      const reward = await spinWheel(profile);
      setWheelResult(reward);
      setWheelTurns((turns) => turns + 1);
      await new Promise((resolve) => window.setTimeout(resolve, WHEEL_SPIN_MS));
      setWheelRevealed(true);
      setMessage(reward > 0 ? `Wheel landed on +${reward} coins.` : reward < 0 ? `Wheel landed on ${reward} coins.` : 'Wheel landed on 0. It resets tomorrow.');
      setRewardPopup({
        title: 'Wheel result',
        amount: reward,
        detail: reward > 0 ? 'Wheel coins added to your balance.' : reward < 0 ? 'The wheel took coins this time.' : 'No coin change today.',
        variant: 'wheel',
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Wheel unavailable.');
    } finally {
      setBusy('');
    }
  }

  async function sendTestPush() {
    if (!profile || !profile.isAdmin) return;
    setTestPushSending(true);
    setMessage('');
    try {
      const result = await sendTestPushToAllUsers(profile);
      setMessage(result.allEnabled
        ? '✓ Test push queued for all users with enabled notifications.'
        : `✓ Test push sent to ${result.count} user(s) with enabled notifications.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to send test push.');
    } finally {
      setTestPushSending(false);
    }
  }

  return (
    <>
      <PageHeader title="Minigames" description="Daily coin games, milestone chests, and little bits of chaos." />
      {message ? <p className="mb-4 rounded-2xl bg-mint/10 p-3 text-sm font-semibold text-mint">{message}</p> : null}

      <section className="mb-7">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-ink/40">Replayable</p>
            <h2 className="text-xl font-black">Arcade</h2>
          </div>
          <p className="hidden text-xs font-semibold text-ink/45 sm:block">High-risk wins can spike ELO. Losses cost a little.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <button
            onClick={() => setShowPlane(true)}
            disabled={!profile}
            className="group flex min-h-36 items-center gap-4 rounded-2xl border border-sky/20 bg-gradient-to-br from-sky/15 via-white to-mint/10 p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-sky/45 hover:shadow-lift active:scale-[.99] disabled:opacity-60"
          >
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky text-white shadow-soft transition group-hover:rotate-[-4deg] group-hover:scale-105">
              <Plane size={25} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-black">Sky Landing</h3>
              <p className="mt-1 text-sm leading-5 text-ink/60">Aim, dodge missiles, collect stars, and stop on a ship before the deck runs out.</p>
              <span className="mt-3 inline-flex rounded-lg bg-sky px-3 py-1.5 text-xs font-black text-white">Play</span>
            </div>
          </button>

          <button
            onClick={() => setShowMines(true)}
            disabled={!profile}
            className="group flex min-h-36 items-center gap-4 rounded-2xl border border-coral/20 bg-gradient-to-br from-coral/10 via-white to-plum/10 p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-coral/45 hover:shadow-lift active:scale-[.99] disabled:opacity-60"
          >
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-coral text-white shadow-soft transition group-hover:rotate-6 group-hover:scale-105">
              <Bomb size={25} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-black">Mines</h3>
              <p className="mt-1 text-sm leading-5 text-ink/60">Reveal safe tiles to grow the multiplier, then cash out before a bomb takes the stake.</p>
              <span className="mt-3 inline-flex rounded-lg bg-coral px-3 py-1.5 text-xs font-black text-white">Play</span>
            </div>
          </button>
        </div>
      </section>

      {profile?.isAdmin ? (
        <button
          onClick={sendTestPush}
          disabled={testPushSending}
          className="mb-6 w-full rounded-md bg-plum px-4 py-2 text-sm font-bold text-white transition-all enabled:hover:bg-plum/90 disabled:opacity-60"
        >
          {testPushSending ? 'Sending...' : 'Send test push to all users'}
        </button>
      ) : null}

      <div className="mb-3">
        <p className="text-xs font-black uppercase text-ink/40">Timed and earned</p>
        <h2 className="text-xl font-black">Rewards</h2>
      </div>
      {dailyBonusProgress ? (
        <section className="mb-4 rounded-2xl border border-line bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Gift size={18} className="text-citrus" />
                <h3 className="font-black">Daily activity bonuses</h3>
              </div>
              <p className="mt-1 max-w-xl text-xs leading-5 text-ink/55">
                Do each activity once per day to collect its reward automatically. They reset at midnight UTC.
              </p>
            </div>
            <div className="flex gap-2">
              <div className="rounded-xl bg-mint/10 px-3 py-2">
                <p className="text-2xs font-bold uppercase text-mint/70">Earned</p>
                <CoinAmount amount={dailyBonusProgress.totalClaimed} className="text-sm" />
              </div>
              <div className="rounded-xl bg-citrus/10 px-3 py-2">
                <p className="text-2xs font-bold uppercase text-citrus/70">Left</p>
                <CoinAmount amount={dailyBonusProgress.potential} className="text-sm" />
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { type: 'bet', label: 'Create a bet', amount: dailyBonusProgress.bonusAmounts.bet, Icon: PlusCircle },
              { type: 'challenge', label: 'Create a wager', amount: dailyBonusProgress.bonusAmounts.challenge, Icon: Trophy },
              { type: 'prediction', label: 'Make a prediction', amount: dailyBonusProgress.bonusAmounts.prediction, Icon: Target },
              { type: 'comment', label: 'Comment on a bet', amount: dailyBonusProgress.bonusAmounts.comment, Icon: MessageCircle },
            ].map(({ type, label, amount, Icon }) => {
              const claimed = dailyBonusProgress.claimedTypes?.includes(type);
              return (
                <div
                  key={type}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    claimed ? 'border-mint/20 bg-mint/10' : 'border-line bg-field'
                  }`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${claimed ? 'bg-mint text-white' : 'bg-white text-ink/50'}`}>
                    {claimed ? <Check size={17} /> : <Icon size={17} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">{label}</span>
                    <CoinAmount amount={amount} className="text-xs" />
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {[
          {
            id: 'forecast',
            title: 'Forecast',
            copy: 'Choose Safe, Random, Chaos, or Spicy.',
            status: forecastAvailable ? 'Available now' : 'Cooling down',
            statusClass: forecastAvailable ? 'bg-mint/10 text-mint' : 'bg-field text-ink/45',
            Icon: BadgeDollarSign,
            iconClass: 'bg-citrus/10 text-citrus',
            action: () => setForecastOpen(true),
          },
          {
            id: 'wheel',
            title: 'Wheel',
            copy: 'Spin for bonuses, blanks, and a few painful misses.',
            status: wheelAvailable ? 'Spin ready' : 'Cooling down',
            statusClass: wheelAvailable ? 'bg-plum/10 text-plum' : 'bg-field text-ink/45',
            Icon: Sparkles,
            iconClass: 'bg-plum/10 text-plum',
            action: () => setWheelOpen(true),
          },
          {
            id: 'chests',
            title: 'Chests',
            copy: 'Unlock milestone rewards through bets and challenges.',
            status: openableChests > 0 ? `${openableChests} to open` : chests.length ? 'No open chests' : 'No chests',
            statusClass: openableChests > 0 ? 'bg-sky/10 text-sky' : 'bg-field text-ink/45',
            Icon: Gift,
            iconClass: 'bg-sky/10 text-sky',
            action: () => setChestsOpen(true),
          },
        ].map(({ id, title, copy, status, statusClass, Icon, iconClass, action }, index) => (
          <button
            key={id}
            type="button"
            onClick={action}
            className={`group flex w-full items-center gap-3 p-4 text-left transition hover:bg-field/70 active:bg-field ${
              index ? 'border-t border-line' : ''
            }`}
          >
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconClass}`}>
              <Icon size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-black">{title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-ink/50">{copy}</span>
              <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-2xs font-black sm:hidden ${statusClass}`}>
                {status}
              </span>
            </span>
            <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-2xs font-black sm:inline-flex ${statusClass}`}>
              {status}
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-ink/60" />
          </button>
        ))}
      </div>

      {forecastOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/55 sm:grid sm:place-items-center sm:px-4 sm:backdrop-blur-sm">
          <div
            {...forecastSheet.sheetProps}
            data-sheet-scroll
            className="max-h-[90dvh] w-full touch-pan-y overflow-y-auto rounded-t-2xl border border-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lift sm:max-w-2xl sm:rounded-2xl sm:p-5"
          >
            {forecastSheet.dragHandle}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Choose a forecast</h2>
                <p className="mt-1 text-sm text-ink/50">
                  Pick one reward every 6 hours. Each option has a different level of risk.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForecastOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-field text-ink/60 transition hover:bg-line"
                aria-label="Close forecast"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['safe', 'random', 'chaos', 'spicy'] as DailyForecastMode[]).map((mode) => {
                const selected = forecastMode === mode;
                const card = forecastCards[mode];
                const ForecastIcon = card.Icon;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => forecast(mode)}
                    disabled={!!busy || !forecastAvailable}
                    className={`group min-h-28 rounded-2xl border p-3 text-left shadow-card transition disabled:opacity-50 ${
                      selected ? 'animate-reward-pop border-citrus bg-white ring-2 ring-citrus/20' : card.shell
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-soft transition group-hover:scale-105 ${card.icon}`}>
                        <ForecastIcon size={22} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-black">{card.title}</span>
                        <span className="mt-1 block text-sm leading-6 text-ink/60">{card.copy}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            {!forecastAvailable ? (
              <p className="mt-4 rounded-xl bg-field px-3 py-2 text-center text-xs font-bold text-ink/50">
                Your next forecast becomes available when the 6-hour cooldown ends.
              </p>
            ) : null}
            {profile?.pendingSpicyForecasts && profile.pendingSpicyForecasts.length > 0 ? (
              <p className="mt-3 rounded-xl bg-citrus/10 p-3 text-xs font-bold text-citrus">
                Spicy bonus armed: +{profile.pendingSpicyForecasts.reduce((sum, bonus) => sum + bonus.bonus, 0)} on your next prediction win.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {chestsOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/55 sm:grid sm:place-items-center sm:px-4 sm:backdrop-blur-sm">
          <div
            {...chestsSheet.sheetProps}
            className="flex max-h-[88dvh] w-full touch-pan-y flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-lift sm:max-w-2xl sm:rounded-2xl"
          >
            <div className="shrink-0 pt-2 sm:hidden">{chestsSheet.dragHandle}</div>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
              <div>
                <h2 className="text-xl font-black">Reward chests</h2>
                <p className="mt-1 text-sm text-ink/50">Complete milestones to unlock permanent one-time rewards.</p>
              </div>
              <button
                type="button"
                onClick={() => setChestsOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-field text-ink/60 transition hover:bg-line"
                aria-label="Close chests"
              >
                <X size={18} />
              </button>
            </div>
            <div data-sheet-scroll className="grid min-h-0 gap-3 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:grid-cols-2 sm:px-5 sm:pb-5">
              {chests.length === 0 ? (
                <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-line bg-field px-4 text-center sm:col-span-2">
                  <div>
                    <Gift size={28} className="mx-auto text-ink/25" />
                    <p className="mt-2 text-sm font-bold text-ink/50">There are no chests right now.</p>
                  </div>
                </div>
              ) : chests.map((chest) => {
                const opening = busy === `chest-${chest.id}` || openedChestId === chest.id;
                return (
                  <div key={chest.id} className="rounded-xl border border-line bg-field p-3">
                    <div className="flex items-center gap-3">
                      <RewardChest open={opening} className="h-16 w-20 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold">{chest.title}</p>
                          <CoinAmount amount={chest.reward} className="shrink-0 text-xs" />
                        </div>
                        <p className="mt-0.5 text-xs leading-5 text-ink/50">{chest.description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openChest(chest.id)}
                      disabled={!chest.unlocked || chest.claimed || !!busy}
                      className={`mt-3 w-full rounded-lg border px-3 py-2.5 text-xs font-bold transition disabled:opacity-45 ${
                        chest.unlocked && !chest.claimed
                          ? 'border-sky bg-sky text-white shadow-soft hover:shadow-lift'
                          : 'border-line bg-white text-ink/60'
                      }`}
                    >
                      {chest.claimed ? 'Opened' : chest.unlocked ? 'Open chest' : 'Locked'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {wheelOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/65 sm:grid sm:place-items-center sm:px-4 sm:backdrop-blur-sm">
          <div
            {...wheelSheet.sheetProps}
            className="w-full touch-pan-y overflow-hidden rounded-t-2xl border border-white/10 bg-[#141b26] text-white shadow-lift sm:max-w-lg sm:rounded-2xl"
          >
            <div className="pt-2 sm:hidden">{wheelSheet.dragHandle}</div>
            <div className="flex items-start justify-between gap-3 px-5 pt-5">
              <div>
                <p className="text-2xs font-black uppercase text-white/40">One spin every 6 hours</p>
                <h2 className="mt-1 text-xl font-black">Lucky wheel</h2>
              </div>
              <button
                type="button"
                onClick={() => setWheelOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
                aria-label="Close wheel"
              >
                <X size={18} />
              </button>
            </div>
            <div className="relative mx-auto mt-2 grid aspect-square w-[min(86vw,390px)] place-items-center">
              <div className="absolute inset-[5%] rounded-full bg-black/25 blur-xl" />
              <div className="absolute top-[1%] z-20 h-9 w-8 drop-shadow-[0_5px_5px_rgba(0,0,0,.45)]">
                <div className="mx-auto h-3 w-5 rounded-t-full bg-white" />
                <div className="mx-auto h-0 w-0 border-x-[14px] border-t-[25px] border-x-transparent border-t-white" />
              </div>
              <div className="relative grid h-[90%] w-[90%] place-items-center rounded-full border border-white/15 bg-[#202b3b] p-[4.5%] shadow-[0_22px_55px_rgba(0,0,0,.4),inset_0_0_0_2px_rgba(255,255,255,.05)]">
                {Array.from({ length: 16 }, (_, index) => {
                  const angle = index * 22.5;
                  const radians = (angle * Math.PI) / 180;
                  return (
                    <span
                      key={angle}
                      className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-white/80 shadow-[0_0_8px_rgba(255,255,255,.55)]"
                      style={{
                        left: `${50 + Math.sin(radians) * 45}%`,
                        top: `${50 - Math.cos(radians) * 45}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                  );
                })}
                <svg
                  viewBox="0 0 300 300"
                  className="h-full w-full rounded-full transition-transform duration-[4200ms] ease-out"
                  style={{ transform: `rotate(${wheelRotation}deg)` }}
                >
                  {wheelRewards.map((option, index) => {
                    const mid = (360 / wheelRewards.length) * index + 360 / wheelRewards.length / 2;
                    const labelPoint = polarToCartesian(150, 150, 96, mid);
                    const labelRotation = mid > 90 && mid < 270 ? mid + 180 : mid;
                    return (
                      <g key={`${option.label}-${index}`}>
                        <path
                          d={wheelSlicePath(index, wheelRewards.length)}
                          fill={wheelColors[index % wheelColors.length]}
                          stroke="rgba(255,255,255,.24)"
                          strokeWidth="2"
                        />
                        <text
                          x={labelPoint.x}
                          y={labelPoint.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${labelRotation}, ${labelPoint.x}, ${labelPoint.y})`}
                          className="fill-white text-[14px] font-black"
                          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.18)', strokeWidth: 2 }}
                        >
                          {option.label}
                        </text>
                      </g>
                    );
                  })}
                  <circle cx="150" cy="150" r="45" fill="#141b26" stroke="rgba(255,255,255,.2)" strokeWidth="5" />
                  <circle cx="150" cy="150" r="34" fill="#f7f8f4" />
                  <text x="150" y="151" textAnchor="middle" dominantBaseline="middle" className="fill-[#121417] text-[12px] font-black">
                    {wheelResult === null ? 'SPIN' : !wheelRevealed ? '...' : wheelResult > 0 ? `+${wheelResult}` : String(wheelResult)}
                  </text>
                </svg>
              </div>
            </div>
            <div className="border-t border-white/10 bg-white/[0.04] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <div className="mb-3 flex items-center justify-between text-xs text-white/45">
                <span>Possible result</span>
                <span>-80 to +400</span>
              </div>
              <button
                onClick={wheel}
                disabled={!!busy || !wheelAvailable}
                className="w-full rounded-xl bg-white px-4 py-3.5 text-sm font-black text-ink shadow-lift transition enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 disabled:opacity-40"
              >
                {busy === 'wheel' ? 'Spinning...' : wheelAvailable ? 'Spin the wheel' : 'Wheel is cooling down'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rewardPopup ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-reward-pop rounded-md border border-line bg-white p-6 text-center shadow-lift">
            {rewardPopup.variant === 'chest' ? (
              <RewardChest open className="mx-auto mb-3 h-32 w-40" />
            ) : (
              <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-citrus/10">
                {rewardPopup.variant === 'wheel' ? <Sparkles size={34} className="text-citrus" /> : <BadgeDollarSign size={34} className="text-citrus" />}
              </div>
            )}
            <h2 className="text-xl font-black">{rewardPopup.title}</h2>
            <p className="mt-2 text-sm text-ink/60">{rewardPopup.detail}</p>
            <p className={`mt-4 text-3xl font-black ${rewardPopup.amount < 0 ? 'text-rust' : 'text-citrus'}`}>
              {signedCoins(rewardPopup.amount)}
            </p>
            <div className="mt-4 inline-flex rounded-md bg-field px-4 py-3">
              <CoinAmount amount={rewardPopup.amount} className="text-lg" />
            </div>
            <button
              onClick={() => setRewardPopup(null)}
              className="mt-5 w-full rounded-md border border-line bg-white px-4 py-3 text-sm font-bold text-ink hover:bg-field transition"
            >
              Nice
            </button>
          </div>
        </div>
      ) : null}

      {showPlane && profile ? (
        <PlaneGame
          coins={profile.coinBalance}
          stakes={[50, 100, 250, 500]}
          onCharge={async (s) => { await chargePlaneStake(profile, s); return true; }}
          onWin={async (p) => awardPlaneWin(profile, p)}
          onLose={async (s, context) => recordMinigameLoss(profile, { game: 'plane', stake: s, ...context })}
          onClose={() => setShowPlane(false)}
        />
      ) : null}

      {showMines && profile ? (
        <MinesGame
          coins={profile.coinBalance}
          stakes={[50, 100, 250, 500]}
          onCharge={async (s) => { await chargeMinigameStake(profile, s); return true; }}
          onWin={async (p, context) => awardMinigameWin(profile, p, { game: 'mines', ...context })}
          onLose={async (s, context) => recordMinigameLoss(profile, { game: 'mines', stake: s, ...context })}
          onClose={() => setShowMines(false)}
        />
      ) : null}
    </>
  );
}
