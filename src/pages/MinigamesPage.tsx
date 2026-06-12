import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BadgeDollarSign, Dice5, Flame, Gift, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { CoinAmount } from '../components/CoinAmount';
import { PageHeader } from '../components/PageHeader';
import { RewardChest } from '../components/RewardChest';
import { useAuth } from '../contexts/AuthContext';
import {
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
    reward: <CoinAmount amount={60} className="text-2xs" />,
    copy: <>Claim <CoinAmount amount={60} className="text-xs" /> now.</>,
    Icon: ShieldCheck,
    shell: 'border-mint/25 bg-mint/10 hover:border-mint/40 hover:bg-mint/15',
    icon: 'bg-mint text-white',
    pill: 'bg-mint/10 text-mint',
  },
  random: {
    title: 'Random',
    reward: <span className="inline-flex items-center gap-1"><CoinAmount amount={10} className="text-2xs" /><span>to</span><CoinAmount amount={100} className="text-2xs" /></span>,
    copy: <>Roll once for <CoinAmount amount={10} className="text-xs" /> to <CoinAmount amount={100} className="text-xs" />.</>,
    Icon: Dice5,
    shell: 'border-sky/25 bg-sky/10 hover:border-sky/40 hover:bg-sky/15',
    icon: 'bg-sky text-white',
    pill: 'bg-sky/10 text-sky',
  },
  chaos: {
    title: 'Chaos',
    reward: <span className="inline-flex items-center gap-1"><CoinAmount amount={-20} className="text-2xs text-coral" /><span>/</span><CoinAmount amount={5} className="text-2xs" /><span>/</span><CoinAmount amount={130} className="text-2xs" /></span>,
    copy: <>Roll: <CoinAmount amount={-20} className="text-xs text-coral" />, <CoinAmount amount={5} className="text-xs" />, or <CoinAmount amount={130} className="text-xs" />.</>,
    Icon: Zap,
    shell: 'border-coral/25 bg-coral/10 hover:border-coral/40 hover:bg-coral/15',
    icon: 'bg-coral text-white',
    pill: 'bg-coral/10 text-coral',
  },
  spicy: {
    title: 'Spicy',
    reward: <span className="inline-flex items-center gap-1"><CoinAmount amount={20} className="text-2xs" /><span>then</span><CoinAmount amount={120} className="text-2xs" /></span>,
    copy: <>Claim <CoinAmount amount={20} className="text-xs" /> now; arm <CoinAmount amount={120} className="text-xs" /> if your next prediction wins.</>,
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
  const [wheelOpen, setWheelOpen] = useState(false);
  const [rewardPopup, setRewardPopup] = useState<RewardPopupState | null>(null);
  const [dailyBonusProgress, setDailyBonusProgress] = useState<any>({
    totalClaimed: 0,
    bonuses: [],
    potential: 135,
    bonusAmounts: { bet: 50, challenge: 50, prediction: 25, comment: 10 },
    claimedTypes: [],
  });
  const [testPushSending, setTestPushSending] = useState(false);
  const forecastAvailable = profile ? canClaimSixHourReward(profile.lastDailyForecastAt?.toDate?.() ?? null) : false;
  const wheelAvailable = profile ? canClaimSixHourReward(profile.lastWheelSpinAt?.toDate?.() ?? null) : false;

  useEffect(() => {
    if (!profile) return;
    getChestDefinitions(profile).then(setChests).catch(() => setChests([]));
    getDailyBonusProgress(profile.uid).then(setDailyBonusProgress).catch(() => {
      // On error (likely permissions), show default empty progress
      setDailyBonusProgress({
        totalClaimed: 0,
        bonuses: [],
        potential: 135,
        bonusAmounts: { bet: 50, challenge: 50, prediction: 25, comment: 10 },
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
      setMessage(`✓ Test push sent to ${result.count} user(s) with enabled notifications.`);
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

      {/* Daily Bonus Progress */}
      {dailyBonusProgress && (
        <div className="mb-4 rounded-md border border-line bg-gradient-to-r from-citrus/5 to-plum/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Gift size={18} className="text-citrus" />
            <h3 className="font-black">Daily bonuses</h3>
          </div>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between rounded-md bg-white/50 px-3 py-2">
              <span className="text-ink/70">Earned today</span>
              <span className="font-black"><CoinAmount amount={dailyBonusProgress.totalClaimed} className="text-sm" /></span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-white/50 px-3 py-2">
              <span className="text-ink/70">Potential remaining</span>
              <span className="font-black"><CoinAmount amount={dailyBonusProgress.potential} className="text-sm" /></span>
            </div>
            <div className="text-xs text-ink/50">
              {(dailyBonusProgress.claimedTypes?.length ?? 0) > 0
                ? `Claimed: ${dailyBonusProgress.claimedTypes.join(', ')} • Get +${dailyBonusProgress.potential} more!`
                : 'Claim bonuses by creating bets, challenges, predictions, or comments'}
            </div>
          </div>
        </div>
      )}

      {/* Admin: Test Push Button */}
      {profile?.isAdmin && (
        <div className="mb-4 rounded-md border border-line bg-field p-4">
          <button
            onClick={sendTestPush}
            disabled={testPushSending}
            className="w-full rounded-md bg-plum px-4 py-2 text-sm font-bold text-white transition-all enabled:hover:bg-plum/90 disabled:opacity-60"
          >
            {testPushSending ? 'Sending...' : '🧪 Send Test Push to All Users'}
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <section className="rounded-md border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <BadgeDollarSign size={18} className="text-citrus" />
            <h2 className="font-black">Forecast</h2>
          </div>
          <p className="mb-3 rounded-md bg-field px-3 py-2 text-xs font-bold text-ink/55">
            Claim every 6 hours. {forecastAvailable ? 'Available now.' : 'Cooldown in progress.'}
          </p>
          <div className="grid gap-3">
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
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl shadow-soft transition group-hover:scale-105 ${card.icon}`}>
                      <ForecastIcon size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-black">{card.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-ink/60">{card.copy}</span>
                      {selected ? <span className="mt-3 inline-flex rounded-full bg-citrus/10 px-2 py-0.5 text-2xs font-black text-citrus">Revealed</span> : null}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {profile?.pendingSpicyForecasts && profile.pendingSpicyForecasts.length > 0 ? (
            <p className="mt-3 rounded-md bg-citrus/10 p-3 text-xs font-bold text-citrus">
              Spicy bonus armed: +{profile.pendingSpicyForecasts.reduce((sum, b) => sum + b.bonus, 0)} on your next win.
              {profile.pendingSpicyForecasts.length > 1 && ` (${profile.pendingSpicyForecasts.length} stacked)`}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={18} className="text-plum" />
            <h2 className="font-black">Wheel</h2>
          </div>
          <p className="mb-3 rounded-md bg-field px-3 py-2 text-xs font-bold text-ink/55">
            {wheelAvailable ? 'Wheel spin available now.' : 'Wheel on cooldown. Available in up to 6 hours.'}
          </p>
          <div className="grid h-56 place-items-center rounded-md bg-field">
            <button
              type="button"
              onClick={() => setWheelOpen(true)}
              className="grid h-40 w-40 place-items-center overflow-hidden rounded-full border-8 border-white bg-[conic-gradient(from_22.5deg,#2f7d63,#d95f46,#d49a25,#8c98a5,#3b75af,#d95f46,#6f5ca8,#121417,#2f7d63)] text-white shadow-lift"
            >
              <span className="btn-special rounded-full px-4 py-2 text-sm font-black">{wheelAvailable ? 'Open wheel' : 'View wheel'}</span>
            </button>
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Gift size={18} className="text-mint" />
            <h2 className="font-black">Chests</h2>
          </div>
          <div className="space-y-3">
            {chests.length === 0 ? (
              <div className="grid min-h-40 place-items-center rounded-md border border-dashed border-line bg-field px-4 text-center">
                <p className="text-sm font-bold text-ink/50">No chests right now.</p>
              </div>
            ) : chests.map((chest) => {
              const opening = busy === `chest-${chest.id}` || openedChestId === chest.id;
              return (
                <div key={chest.id} className="rounded-md bg-field p-3">
                  <div className="flex items-center gap-3">
                    <RewardChest open={opening} className="h-16 w-20 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold">{chest.title}</p>
                        <CoinAmount amount={chest.reward} className="shrink-0 text-xs" />
                      </div>
                      <p className="mt-0.5 text-xs text-ink/50">{chest.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => openChest(chest.id)}
                    disabled={!chest.unlocked || chest.claimed || !!busy}
                    className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-xs font-bold disabled:opacity-45"
                  >
                    {chest.claimed ? 'Opened' : chest.unlocked ? 'Open chest' : 'Locked'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

      </div>

      {wheelOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-md border border-line bg-white p-5 shadow-lift">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">Spin the wheel</h2>
              <button onClick={() => setWheelOpen(false)} className="rounded-md border border-line px-3 py-1.5 text-sm font-bold">Close</button>
            </div>
            <div className="relative mx-auto grid h-80 w-80 max-w-full place-items-center">
              <div className="absolute top-0 z-10 h-0 w-0 border-x-[14px] border-t-[24px] border-x-transparent border-t-ink" />
              <svg
                viewBox="0 0 300 300"
                className="h-72 w-72 rounded-full border-8 border-white shadow-lift transition-transform duration-[4200ms] ease-out"
                style={{ transform: `rotate(${wheelRotation}deg)` }}
              >
                {wheelRewards.map((option, index) => {
                  const mid = (360 / wheelRewards.length) * index + 360 / wheelRewards.length / 2;
                  const labelPoint = polarToCartesian(150, 150, 92, mid);
                  return (
                    <g key={`${option.label}-${index}`}>
                      <path d={wheelSlicePath(index, wheelRewards.length)} fill={wheelColors[index % wheelColors.length]} />
                      <text
                        x={labelPoint.x}
                        y={labelPoint.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${mid}, ${labelPoint.x}, ${labelPoint.y})`}
                        className="fill-white text-[13px] font-black"
                      >
                        {option.label}
                      </text>
                    </g>
                  );
                })}
                <circle cx="150" cy="150" r="42" fill="white" />
                <text x="150" y="153" textAnchor="middle" dominantBaseline="middle" className="fill-[#121417] text-[12px] font-black">
                  {wheelResult === null ? 'READY' : !wheelRevealed ? 'SPIN' : wheelResult > 0 ? `+${wheelResult}` : String(wheelResult)}
                </text>
              </svg>
            </div>
            <button
              onClick={wheel}
              disabled={!!busy || !wheelAvailable}
              className="btn-special mt-5 w-full rounded-md px-4 py-3 text-sm font-bold disabled:opacity-50"
            >
              {busy === 'wheel' ? 'Spinning slowly...' : wheelAvailable ? 'Spin today' : 'Already spun today'}
            </button>
          </div>
        </div>
      ) : null}

      {rewardPopup ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/55 px-4 backdrop-blur-sm">
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
    </>
  );
}
