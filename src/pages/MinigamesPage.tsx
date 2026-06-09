import { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Gift, Sparkles } from 'lucide-react';
import { CoinAmount } from '../components/CoinAmount';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../contexts/AuthContext';
import {
  claimChest,
  claimDailyForecast,
  getChestDefinitions,
  spinWheel,
  wheelRewards,
} from '../services/rewardService';
import type { ChestDefinition, DailyForecastMode } from '../types';
import { canClaimDailyReward } from '../utils/coins';

const wheelColors = ['#2f7d63', '#d95f46', '#d49a25', '#8c98a5', '#3b75af', '#d95f46', '#6f5ca8', '#121417'];
const WHEEL_SPIN_MS = 4400;

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

function RewardChest({ open = false, className = '' }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 220 170" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="chest-lid" x1="28" x2="180" y1="20" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffca62" />
          <stop offset="100%" stopColor="#c46b2c" />
        </linearGradient>
        <linearGradient id="chest-body" x1="28" x2="180" y1="78" y2="156" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a96b3d" />
          <stop offset="100%" stopColor="#643a24" />
        </linearGradient>
        <linearGradient id="coin-shine" x1="74" x2="144" y1="52" y2="118" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffe48f" />
          <stop offset="100%" stopColor="#d49a25" />
        </linearGradient>
      </defs>
      {open ? (
        <g className="origin-[110px_86px] animate-chest-open">
          <path d="M37 78 C45 28 175 28 183 78 L170 96 H50 Z" fill="url(#chest-lid)" />
          <path d="M55 76 C63 44 157 44 165 76" fill="none" stroke="#fff3bd" strokeWidth="10" strokeLinecap="round" opacity="0.45" />
          <path d="M37 78 C45 28 175 28 183 78" fill="none" stroke="#121417" strokeOpacity="0.2" strokeWidth="5" />
        </g>
      ) : (
        <path d="M37 78 C45 28 175 28 183 78 L170 96 H50 Z" fill="url(#chest-lid)" stroke="#121417" strokeOpacity="0.18" strokeWidth="5" />
      )}
      {open ? (
        <g className="animate-reward-pop">
          <circle cx="80" cy="75" r="13" fill="url(#coin-shine)" stroke="#9c651b" strokeOpacity="0.28" strokeWidth="3" />
          <circle cx="116" cy="61" r="16" fill="url(#coin-shine)" stroke="#9c651b" strokeOpacity="0.28" strokeWidth="3" />
          <circle cx="148" cy="76" r="12" fill="url(#coin-shine)" stroke="#9c651b" strokeOpacity="0.28" strokeWidth="3" />
          <path d="M103 87 115 72 128 87 115 104 Z" fill="#7dcdf4" stroke="#1f6183" strokeOpacity="0.25" strokeWidth="3" />
        </g>
      ) : null}
      <path d="M30 86 H190 V145 C190 154 184 160 175 160 H45 C36 160 30 154 30 145 Z" fill="url(#chest-body)" />
      <path d="M30 108 H190" stroke="#121417" strokeOpacity="0.18" strokeWidth="5" />
      <path d="M56 88 V158 M164 88 V158" stroke="#f4ba4d" strokeWidth="10" strokeLinecap="round" opacity="0.92" />
      <rect x="91" y="101" width="38" height="40" rx="7" fill="#fff3bd" stroke="#121417" strokeOpacity="0.18" strokeWidth="4" />
      <circle cx="110" cy="118" r="5" fill="#d49a25" />
      <path d="M48 160 H172" stroke="#121417" strokeOpacity="0.18" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
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
  const forecastAvailable = profile ? canClaimDailyReward(profile.lastDailyForecastAt?.toDate?.() ?? null) : false;
  const wheelAvailable = profile ? canClaimDailyReward(profile.lastWheelSpinAt?.toDate?.() ?? null) : false;

  useEffect(() => {
    if (!profile) return;
    getChestDefinitions(profile).then(setChests).catch(() => setChests([]));
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

  return (
    <>
      <PageHeader title="Minigames" description="Daily coin games, milestone chests, and little bits of chaos." />
      {message ? <p className="mb-4 rounded-md bg-mint/10 p-3 text-sm font-semibold text-mint">{message}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-md border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <BadgeDollarSign size={18} className="text-citrus" />
            <h2 className="font-black">Daily forecast</h2>
          </div>
          <p className="mb-3 rounded-md bg-field px-3 py-2 text-xs font-bold text-ink/55">
            One forecast reward per day. {forecastAvailable ? 'Available now.' : 'Already claimed today.'}
          </p>
          <div className="grid gap-3">
            {(['safe', 'random', 'chaos', 'spicy'] as DailyForecastMode[]).map((mode) => {
              const selected = forecastMode === mode;
              const copy: Record<DailyForecastMode, string> = {
                safe: '+60 coins immediately',
                random: '+10 to +100 coins',
                chaos: '-20, +5, or +130 coins',
                spicy: '+20 now, +120 only if your next prediction wins',
              };
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => forecast(mode)}
                  disabled={!!busy || !forecastAvailable}
                  className={`min-h-28 rounded-md border p-4 text-left transition disabled:opacity-50 ${
                    selected ? 'animate-reward-pop border-citrus bg-citrus/10' : 'border-line bg-field hover:bg-white'
                  }`}
                >
                  <p className="text-lg font-black capitalize">{mode}</p>
                  <p className="mt-1 text-sm text-ink/60">{copy[mode]}</p>
                  {selected ? <p className="mt-3 text-xs font-black text-citrus">Revealed</p> : null}
                </button>
              );
            })}
          </div>
          {profile?.pendingSpicyForecast ? (
            <p className="mt-3 rounded-md bg-citrus/10 p-3 text-xs font-bold text-citrus">
              Spicy bonus armed: +{profile.pendingSpicyForecast.bonus} on your next win.
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-line bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={18} className="text-plum" />
            <h2 className="font-black">Spin the wheel</h2>
          </div>
          <p className="mb-3 rounded-md bg-field px-3 py-2 text-xs font-bold text-ink/55">
            {wheelAvailable ? 'Wheel spin available today.' : 'Wheel already used today. Come back tomorrow.'}
          </p>
          <div className="grid h-56 place-items-center rounded-md bg-field">
            <button
              type="button"
              onClick={() => setWheelOpen(true)}
              className="grid h-40 w-40 place-items-center overflow-hidden rounded-full border-8 border-white bg-[conic-gradient(from_22.5deg,#2f7d63,#d95f46,#d49a25,#8c98a5,#3b75af,#d95f46,#6f5ca8,#121417,#2f7d63)] text-white shadow-lift"
            >
              <span className="rounded-full bg-ink px-4 py-2 text-sm font-black">{wheelAvailable ? 'Open wheel' : 'View wheel'}</span>
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
              className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
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
              className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-sm font-bold text-white"
            >
              Nice
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
