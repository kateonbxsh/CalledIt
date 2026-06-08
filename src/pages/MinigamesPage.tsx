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

const wheelColors = ['#2f7d63', '#d95f46', '#d49a25', '#8c98a5', '#3b75af', '#d95f46', '#6f5ca8', '#121417'];

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

export function MinigamesPage() {
  const { profile } = useAuth();
  const [chests, setChests] = useState<ChestDefinition[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [wheelResult, setWheelResult] = useState<number | null>(null);
  const [wheelTurns, setWheelTurns] = useState(0);
  const [openedChestId, setOpenedChestId] = useState('');
  const [openedChestReward, setOpenedChestReward] = useState<number | null>(null);
  const [forecastMode, setForecastMode] = useState<DailyForecastMode | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);

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
      await claimDailyForecast(profile, mode);
      setForecastMode(mode);
      const messages: Record<DailyForecastMode, string> = {
        safe: 'Safe reward claimed: +60 coins.',
        random: 'Random reward claimed.',
        chaos: 'Chaos reward claimed. Check your coin balance.',
        spicy: 'Spicy reward claimed: +20 now, +120 only if your next prediction wins.',
      };
      setMessage(messages[mode]);
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
      await claimChest(profile, chestId);
      const chest = chests.find((item) => item.id === chestId);
      setOpenedChestId(chestId);
      setOpenedChestReward(chest?.reward ?? null);
      setMessage('Chest opened.');
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
      const reward = await spinWheel(profile);
      setWheelResult(reward);
      setWheelTurns((turns) => turns + 1);
      setMessage(reward > 0 ? `Wheel landed on +${reward} coins.` : reward < 0 ? `Wheel landed on ${reward} coins.` : 'Wheel landed on 0. It resets tomorrow.');
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
                  disabled={!!busy}
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
          <div className="grid h-56 place-items-center rounded-md bg-field">
            <button
              type="button"
              onClick={() => setWheelOpen(true)}
              className="grid h-40 w-40 place-items-center rounded-full border-8 border-white bg-[conic-gradient(#2f7d63,#d95f46,#d49a25,#8c98a5,#3b75af,#d95f46,#6f5ca8,#121417)] text-white shadow-lift"
            >
              <span className="rounded-full bg-ink px-4 py-2 text-sm font-black">Open wheel</span>
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
                    <div className={`relative h-14 w-16 shrink-0 ${opening ? 'animate-chest-open' : ''}`}>
                      <div className="absolute left-1 top-1 h-5 w-14 rounded-t-md border border-citrus/40 bg-citrus" />
                      <div className="absolute bottom-1 left-0 h-9 w-16 rounded-md border border-ink/10 bg-[#8f5f3d]" />
                      <div className="absolute bottom-4 left-7 h-5 w-3 rounded-sm bg-[#f8faf4]" />
                    </div>
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
                  {wheelResult === null ? 'READY' : wheelResult > 0 ? `+${wheelResult}` : String(wheelResult)}
                </text>
              </svg>
            </div>
            <button
              onClick={wheel}
              disabled={!!busy}
              className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === 'wheel' ? 'Spinning slowly...' : 'Spin today'}
            </button>
          </div>
        </div>
      ) : null}

      {openedChestReward !== null ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-reward-pop rounded-md border border-line bg-white p-6 text-center shadow-lift">
            <div className="mx-auto mb-4 grid h-28 w-32 animate-chest-open place-items-end">
              <div className="h-16 w-28 rounded-md bg-[#8f5f3d] shadow-lift" />
              <div className="-mt-24 h-9 w-28 rotate-[-8deg] rounded-t-md bg-citrus shadow-soft" />
            </div>
            <h2 className="text-xl font-black">Chest opened</h2>
            <div className="mt-3 inline-flex rounded-md bg-field px-4 py-3">
              <CoinAmount amount={openedChestReward} className="text-lg" />
            </div>
            <button
              onClick={() => setOpenedChestReward(null)}
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
