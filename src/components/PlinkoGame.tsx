import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CoinAmount } from './CoinAmount';
import { StakeInput } from './StakeInput';
import { calculateMinigameLossDelta, calculateMinigameWinDelta, type MinigameAchievement } from '../services/rewardService';

// 16 peg rows -> 17 buckets. Symmetric multipliers: a wide losing centre, modest
// wins, rare big edges. The whole simulation runs in a FIXED virtual board and is
// scaled to fit any screen, so the pyramid shape + physics are identical on every
// device (mobile can't accidentally favour the edges).
const ROWS = 16;
const BUCKETS = ROWS + 1;
const FIRST_ROW = 3; // drop the narrow top rows so the chip free-falls first
const BASE_MULTIPLIERS = [14, 7, 3, 1.6, 1, 0.6, 0.4, 0.3, 0.2, 0.3, 0.4, 0.6, 1, 1.6, 3, 7, 14];

// Wider-than-tall virtual board so it fills the width on mobile and the multiplier
// docks come out wide & short instead of long & thin.
const VW = 620, VH = 720;
const PEG_GAP = VW / (ROWS + 1);
const Y_TOP = VH * 0.05;
const BOTTOM_PEG_Y = VH * 0.85;
const VIS_ROWS = ROWS - FIRST_ROW;
const ROW_GAP = (BOTTOM_PEG_Y - Y_TOP) / (VIS_ROWS - 1);
const BALL_R = PEG_GAP * 0.17;
const PEG_R = PEG_GAP * 0.13;
const FIRST_PEG_Y = Y_TOP;
const DIVIDER_TOP_Y = BOTTOM_PEG_Y + ROW_GAP * 0.4;
const BUCKET_BOTTOM = VH * 0.99;
const BUCKET_TOP_Y = BUCKET_BOTTOM - PEG_GAP * 0.9; // wide & short docks
const BIN_FLOOR_Y = BUCKET_BOTTOM - BALL_R - 2;

const GRAVITY = 2600, RESTITUTION = 0.32, SUBSTEPS = 4, CENTER_PULL = 0.95, HDRAG = 1.1;

const BASE_PEGS: { x: number; y: number }[] = [];
for (let row = FIRST_ROW; row < ROWS; row += 1) {
  const y = Y_TOP + (row - FIRST_ROW) * ROW_GAP;
  for (let j = 0; j <= row; j += 1) BASE_PEGS.push({ x: VW / 2 + (j - row / 2) * PEG_GAP, y });
}
const DIVIDERS: number[] = [];
for (let k = 1; k <= ROWS; k += 1) DIVIDERS.push(k * PEG_GAP);

type Chip = { id: number; stake: number; balanceBefore: number; x: number; y: number; vx: number; vy: number; trail: { x: number; y: number }[]; landed: boolean; removeAt: number };
type Peg = { x: number; y: number; hit: number };
type Pop = { x: number; y: number; text: string; color: string; t: number };
type DropResult = { id: number; multiplier: number; net: number; ratingDelta: number };
type PlinkoAchievement = Extract<MinigameAchievement, { game: 'plinko' }>;

function bucketColor(m: number) { return m >= 4 ? '#7b5aa6' : m >= 2 ? '#3b75af' : m >= 1 ? '#2f7d63' : 'rgba(255,255,255,0.10)'; }

function plinkoMultiplier(base: number, stake: number, balanceBefore: number) {
  void stake;
  void balanceBefore;
  return base;
}

function plinkoRiskLevel(m: number) {
  return Math.min(1, Math.max(0.18, Math.abs(m - 1) / 4.5));
}

function plinkoEloDelta(m: number, stake: number, balanceBefore: number) {
  if (m >= 1) {
    return calculateMinigameWinDelta({
      game: 'plinko',
      stake,
      payout: Math.round(stake * m),
      balanceBefore,
      riskLevel: plinkoRiskLevel(m),
    });
  }
  return calculateMinigameLossDelta({
    game: 'plinko',
    stake,
    balanceBefore,
    riskLevel: plinkoRiskLevel(m),
    blunder: m <= 0.2,
  });
}

export function PlinkoGame({
  coins,
  stakes,
  onSettle,
  onClose,
}: {
  coins: number;
  stakes: number[];
  // Net coin + ELO swing for a batch of drops, flushed in one DB write.
  onSettle: (coinDelta: number, ratingDelta: number, bestMult: number, achievement: PlinkoAchievement) => Promise<void>;
  onClose: () => void;
}) {
  const [stake, setStake] = useState(() => stakes.find((amount) => amount <= coins) ?? stakes[0]);
  const [balance, setBalance] = useState(coins);
  const [recent, setRecent] = useState<DropResult[]>([]);
  const [activeDrops, setActiveDrops] = useState(0);
  const [error, setError] = useState('');

  const canDrop = stake >= 1 && stake <= balance;

  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spawnRef = useRef<((stake: number, balanceBefore: number) => void) | null>(null);
  const stakeRef = useRef(stake); stakeRef.current = stake;
  const balanceRef = useRef(balance); balanceRef.current = balance;

  // ---- batched settlement: accumulate net coin/ELO and flush rarely (debounced) ----
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  const pendingCoin = useRef(0);
  const pendingElo = useRef(0);
  const pendingBestMult = useRef(0);
  const pendingAchievement = useRef<PlinkoAchievement>({
    game: 'plinko', drops: 0, wins: 0, profitableHits: 0,
    highHits: 0, jackpotHits: 0, edgeHits: 0, totalPayout: 0, bestMultiplier: 0,
  });
  const flushTimer = useRef<number | null>(null);
  const lastFlush = useRef(Date.now());

  function flush() {
    if (flushTimer.current !== null) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    const coin = pendingCoin.current, elo = pendingElo.current, bestMult = pendingBestMult.current;
    const achievement = pendingAchievement.current;
    pendingCoin.current = 0; pendingElo.current = 0; pendingBestMult.current = 0; lastFlush.current = Date.now();
    pendingAchievement.current = {
      game: 'plinko', drops: 0, wins: 0, profitableHits: 0,
      highHits: 0, jackpotHits: 0, edgeHits: 0, totalPayout: 0, bestMultiplier: 0,
    };
    if (coin !== 0 || elo !== 0 || bestMult > 0 || achievement.drops > 0) {
      onSettleRef.current(coin, elo, bestMult, achievement).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not save your euros.'));
    }
  }
  const flushRef = useRef(flush);
  flushRef.current = flush;

  function accumulate(coin: number, elo: number, bestMult = 0) {
    pendingCoin.current += coin;
    pendingElo.current += elo;
    pendingBestMult.current = Math.max(pendingBestMult.current, bestMult);
    // flush at least every 8s of continuous play, otherwise 1.5s after the last drop settles
    if (Date.now() - lastFlush.current > 8000) { flushRef.current(); return; }
    if (flushTimer.current !== null) clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(() => flushRef.current(), 1500);
  }
  const accumulateRef = useRef(accumulate);
  accumulateRef.current = accumulate;

  // flush any pending result when leaving the game (unmount, tab hidden, app close)
  useEffect(() => {
    const onHide = () => flushRef.current();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      flushRef.current();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const board = boardRef.current!;
    const pegs: Peg[] = BASE_PEGS.map((p) => ({ ...p, hit: 0 }));
    const bucketHit = new Array(BUCKETS).fill(0);
    const chips: Chip[] = [];
    const pops: Pop[] = [];
    let nextId = 1;
    let view = { scale: 1, offX: 0, offY: 0, cssW: VW, cssH: VH, dpr: 1 };
    let raf: number | null = null;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = board.clientWidth;
      const cssH = board.clientHeight;
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      const scale = Math.min(cssW / VW, cssH / VH);
      // centre horizontally, bottom-align so the buckets sit next to the controls
      view = { scale, offX: (cssW - VW * scale) / 2, offY: cssH - VH * scale, cssW, cssH, dpr };
      draw();
    }

    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function draw() {
      const { scale, offX, offY, cssW, cssH, dpr } = view;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);

      // board backdrop for depth + the drop slot the chip enters from
      const bg = ctx.createLinearGradient(0, 0, 0, VH);
      bg.addColorStop(0, 'rgba(255,255,255,0.04)');
      bg.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(VW / 2 - PEG_GAP * 0.75, Y_TOP - ROW_GAP * 1.5, PEG_GAP * 1.5, ROW_GAP * 0.55, 4); ctx.fill();

      // funnel guides + bucket band
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      for (const dx of DIVIDERS) { ctx.beginPath(); ctx.moveTo(dx, DIVIDER_TOP_Y); ctx.lineTo(dx, BUCKET_TOP_Y); ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const bandH = BUCKET_BOTTOM - BUCKET_TOP_Y;
      for (let k = 0; k < BUCKETS; k += 1) {
        const m = plinkoMultiplier(BASE_MULTIPLIERS[k], stakeRef.current, balanceRef.current);
        const x0 = k * PEG_GAP;
        const hit = bucketHit[k];
        const lift = hit * 5;
        ctx.fillStyle = bucketColor(m);
        roundRect(x0 + 1, BUCKET_TOP_Y - lift, PEG_GAP - 2, bandH, 6); ctx.fill();
        if (hit > 0) { ctx.globalAlpha = hit * 0.5; ctx.fillStyle = '#fff'; roundRect(x0 + 1, BUCKET_TOP_Y - lift, PEG_GAP - 2, bandH, 6); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.fillStyle = m >= 1 ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.font = `900 ${13 * (1 + hit * 0.25)}px Segoe UI, sans-serif`;
        ctx.fillText(`${Number(m.toFixed(2))}x`, x0 + PEG_GAP / 2, (BUCKET_TOP_Y - lift) + bandH / 2);
      }

      // pegs
      for (const peg of pegs) {
        if (peg.hit > 0) {
          ctx.globalAlpha = peg.hit * 0.30; ctx.fillStyle = '#ffe39a';
          ctx.beginPath(); ctx.arc(peg.x, peg.y, PEG_R + peg.hit * PEG_R * 1.2, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = peg.hit > 0 ? 'rgba(255,255,255,' + (0.55 + peg.hit * 0.45) + ')' : 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(peg.x, peg.y, PEG_R + peg.hit * PEG_R * 0.2, 0, Math.PI * 2); ctx.fill();
      }

      // chips
      for (const chip of chips) {
        for (let i = 0; i < chip.trail.length; i += 1) {
          const p = chip.trail[i];
          ctx.fillStyle = `rgba(63,148,115,${(i / chip.trail.length) * 0.26})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (0.45 + 0.5 * (i / chip.trail.length)), 0, Math.PI * 2); ctx.fill();
        }
        const g = ctx.createRadialGradient(chip.x - BALL_R * 0.3, chip.y - BALL_R * 0.3, BALL_R * 0.2, chip.x, chip.y, BALL_R);
        g.addColorStop(0, '#9ae3c1'); g.addColorStop(1, '#3f9473');
        ctx.beginPath(); ctx.arc(chip.x, chip.y, BALL_R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = BALL_R * 0.15; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
      }

      // floating result pops
      for (const pop of pops) {
        ctx.globalAlpha = Math.max(0, 1 - pop.t);
        ctx.fillStyle = pop.color;
        ctx.font = '900 22px Segoe UI, sans-serif';
        ctx.fillText(pop.text, pop.x, pop.y - pop.t * 46);
        ctx.globalAlpha = 1;
      }
    }

    function physics(chip: Chip, dt: number) {
      const sub = dt / SUBSTEPS, minDist = BALL_R + PEG_R;
      for (let s = 0; s < SUBSTEPS; s += 1) {
        chip.vy += GRAVITY * sub;
        chip.vx += (VW / 2 - chip.x) * CENTER_PULL * sub;
        chip.vx -= chip.vx * HDRAG * sub;
        chip.x += chip.vx * sub;
        chip.y += chip.vy * sub;
        for (const peg of pegs) {
          if (Math.abs(peg.y - chip.y) > ROW_GAP * 1.3 || Math.abs(peg.x - chip.x) > PEG_GAP * 1.3) continue;
          let dx = chip.x - peg.x, dy = chip.y - peg.y, dist = Math.hypot(dx, dy);
          if (dist >= minDist) continue;
          if (dist === 0) { dx = Math.random() - 0.5; dy = -1; dist = Math.hypot(dx, dy); }
          peg.hit = 1;
          const nx = dx / dist, ny = dy / dist;
          chip.x = peg.x + nx * minDist; chip.y = peg.y + ny * minDist;
          const vdotn = chip.vx * nx + chip.vy * ny;
          if (vdotn < 0) {
            chip.vx -= (1 + RESTITUTION) * vdotn * nx;
            chip.vy -= (1 + RESTITUTION) * vdotn * ny;
            const nudge = (Math.random() - 0.5) * (0.10 * Math.hypot(chip.vx, chip.vy) + 32);
            chip.vx += -ny * nudge; chip.vy += nx * nudge;
          }
        }
        if (chip.x < BALL_R) { chip.x = BALL_R; chip.vx = Math.abs(chip.vx) * RESTITUTION; }
        if (chip.x > VW - BALL_R) { chip.x = VW - BALL_R; chip.vx = -Math.abs(chip.vx) * RESTITUTION; }
        if (chip.y > DIVIDER_TOP_Y) {
          for (const dx of DIVIDERS) {
            if (Math.abs(chip.x - dx) < BALL_R) {
              if (chip.x < dx) { chip.x = dx - BALL_R; chip.vx = -Math.abs(chip.vx) * RESTITUTION; }
              else { chip.x = dx + BALL_R; chip.vx = Math.abs(chip.vx) * RESTITUTION; }
            }
          }
        }
      }
    }

    function settle(chip: Chip, bin: number) {
      const baseMultiplier = BASE_MULTIPLIERS[bin] ?? 0;
      const m = plinkoMultiplier(baseMultiplier, chip.stake, chip.balanceBefore);
      const payout = Math.round(chip.stake * m);
      const net = payout - chip.stake;
      const ratingDelta = plinkoEloDelta(m, chip.stake, chip.balanceBefore);
      bucketHit[bin] = 1;
      pops.push({ x: bin * PEG_GAP + PEG_GAP / 2, y: BUCKET_TOP_Y - 6, text: `${net >= 0 ? '+' : '-'}${Math.abs(net).toLocaleString()}€`, color: net >= 0 ? '#d49a25' : '#d95f46', t: 0 });
      setBalance((current) => Math.max(0, current + payout));
      setRecent((current) => [{ id: chip.id, multiplier: m, net, ratingDelta }, ...current].slice(0, 12));
      setActiveDrops((current) => Math.max(0, current - 1));
      const pending = pendingAchievement.current;
      pendingAchievement.current = {
        game: 'plinko',
        drops: pending.drops + 1,
        wins: pending.wins + (m >= 1 ? 1 : 0),
        profitableHits: pending.profitableHits + (m > 1 ? 1 : 0),
        highHits: pending.highHits + (m >= 3 ? 1 : 0),
        jackpotHits: pending.jackpotHits + (m >= 7 ? 1 : 0),
        edgeHits: pending.edgeHits + (bin === 0 || bin === BUCKETS - 1 ? 1 : 0),
        totalPayout: pending.totalPayout + payout,
        bestMultiplier: Math.max(pending.bestMultiplier, m),
      };
      accumulateRef.current(payout, ratingDelta, m); // credit the win to the batched flush
    }

    let last = performance.now();
    function step(now: number) {
      let dt = (now - last) / 1000; last = now; if (dt > 0.04) dt = 0.04;
      for (const chip of chips) {
        if (chip.landed) continue;
        physics(chip, dt);
        chip.trail.push({ x: chip.x, y: chip.y });
        if (chip.trail.length > 8) chip.trail.shift();
        if (chip.y + BALL_R >= BIN_FLOOR_Y) {
          chip.y = BIN_FLOOR_Y - BALL_R; chip.landed = true; chip.removeAt = now + 260;
          settle(chip, Math.max(0, Math.min(ROWS, Math.floor(chip.x / PEG_GAP))));
        }
      }
      for (let i = chips.length - 1; i >= 0; i -= 1) if (chips[i].landed && now >= chips[i].removeAt) chips.splice(i, 1);
      let busy = chips.length > 0;
      for (const peg of pegs) if (peg.hit > 0) { peg.hit = Math.max(0, peg.hit - dt * 3.2); if (peg.hit > 0) busy = true; }
      for (let k = 0; k < BUCKETS; k += 1) if (bucketHit[k] > 0) { bucketHit[k] = Math.max(0, bucketHit[k] - dt * 3); if (bucketHit[k] > 0) busy = true; }
      for (let i = pops.length - 1; i >= 0; i -= 1) { pops[i].t += dt * 1.2; if (pops[i].t >= 1) pops.splice(i, 1); else busy = true; }
      draw();
      raf = busy ? requestAnimationFrame(step) : null;
    }

    spawnRef.current = (dropStake: number, balanceBefore: number) => {
      chips.push({
        id: nextId++, stake: dropStake, balanceBefore: Math.max(dropStake, balanceBefore),
        x: VW / 2 + (Math.random() - 0.5) * PEG_GAP * 0.6,
        y: FIRST_PEG_Y - ROW_GAP * 0.8, vx: (Math.random() - 0.5) * 40, vy: 0,
        trail: [], landed: false, removeAt: 0,
      });
      if (raf === null) { last = performance.now(); raf = requestAnimationFrame(step); }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(board);
    resize();
    return () => {
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
      spawnRef.current = null;
    };
  }, []);

  function dropChip() {
    if (!canDrop) return;
    const dropStake = stake;
    const balanceBefore = balance;
    setError('');
    setBalance((current) => Math.max(0, current - dropStake)); // optimistic; flushed in a batch
    setActiveDrops((current) => current + 1);
    accumulateRef.current(-dropStake, 0);
    spawnRef.current?.(dropStake, balanceBefore);
  }

  function closeGame() {
    flushRef.current();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[120] flex h-dvh select-none flex-col overflow-hidden bg-[#101927] text-white" style={{ touchAction: 'manipulation' }}>
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wide text-white/35">Arcade</p>
          <h1 className="truncate text-lg font-black sm:text-xl">Plinko Drop</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2"><CoinAmount amount={Math.round(balance)} className="text-sm" /></div>
          <button type="button" onClick={closeGame} aria-label="Close Plinko" className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/10 transition active:scale-95">
            <X size={20} />
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] lg:flex-row lg:items-stretch lg:gap-4 lg:px-4">
        {/* Board — the focus */}
        <section className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#142033] lg:order-2">
          <div ref={boardRef} className="absolute inset-0">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          </div>
        </section>

        {/* Controls */}
        <section className="flex shrink-0 flex-col gap-2.5 rounded-2xl border border-white/10 bg-[#172337] p-3 lg:order-1 lg:w-80 lg:gap-3 lg:p-4">
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1 rounded-xl bg-white p-1.5 text-ink">
              <StakeInput label="Stake" value={stake} min={1} step={10} onChange={(value) => setStake(Math.max(1, Math.min(Math.floor(balance) || 1, Math.round(value))))} />
            </div>
            <button type="button" onClick={dropChip} disabled={!canDrop} aria-label={`Drop a ${stake.toLocaleString()}€ chip`}
              className="shrink-0 rounded-xl bg-gradient-to-br from-plum to-sky px-6 text-base font-black text-white shadow-lift transition active:scale-[.97] disabled:opacity-45">
              {balance < 1 ? 'Broke' : 'Drop'}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {stakes.map((amount) => (
              <button key={amount} type="button" disabled={amount > balance} onClick={() => setStake(amount)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-black transition disabled:opacity-40 ${stake === amount ? 'border-sky bg-sky text-white' : 'border-white/10 bg-white/10 text-white/65'}`}>
                {amount}
              </button>
            ))}
          </div>

          <div className="min-h-[76px] min-w-0 sm:min-h-[96px]">
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-white/40">
              <span>Recent drops</span>
              {activeDrops > 0 ? <span className="text-mint">{activeDrops} dropping…</span> : null}
            </div>
            {recent.length === 0 ? (
              <p className="h-[42px] rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-white/35 sm:h-[62px]">Your results will show up here.</p>
            ) : (
              <div className="max-h-[42px] overflow-y-auto pr-0.5 sm:max-h-[62px]">
                <div className="flex flex-wrap gap-1.5">
                {recent.map((item) => (
                  <span key={item.id} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-bold">
                    <span className={item.multiplier >= 1 ? 'text-mint' : 'text-white/45'}>{Number(item.multiplier.toFixed(1))}x</span>
                    <span className={item.net >= 0 ? 'text-citrus' : 'text-coral'}>{item.net >= 0 ? '+' : '-'}{Math.abs(item.net).toLocaleString()}€</span>
                    {item.ratingDelta ? (
                      <span className={`text-[9px] font-black ${item.ratingDelta > 0 ? 'text-mint' : 'text-coral'}`}>{item.ratingDelta > 0 ? '▲' : '▼'}{Math.abs(item.ratingDelta)}</span>
                    ) : null}
                  </span>
                ))}
                </div>
              </div>
            )}
          </div>

          {error ? <p className="rounded-xl bg-coral/15 p-3 text-xs font-bold text-coral">{error}</p> : null}
        </section>
      </main>
    </div>
  );
}
