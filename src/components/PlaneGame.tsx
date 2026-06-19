import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CoinAmount } from './CoinAmount';
import { StakeInput } from './StakeInput';
import type { MinigameWinResult } from '../services/rewardService';
import { createMinigameSessionId, type MinigameAuditInput } from '../services/minigameAuditService';

// ---- Tuning (mirrors the standalone plane-game) ----
const V0 = 480;
const GRAV = 120, VDRAG = 1.8, HDRAG = 0.015, DECEL = 360, MAXVY = 260;
const ANGLE_MIN = 20, ANGLE_MAX = 80;
const CAM_OFF = 0.22;
// Distance reward grows quickly early, then tapers off. Stars are the high-risk
// way to push the multiplier higher.
const MULT_K = 0.72, MULT_SCALE = 500, STAR_MULT = 0.14;
const STAR_BOOST = 230, MISSILE_PUSH = 230, MISSILE_MULT_PENALTY = 0.015, FIRST_BOAT = 340;
// Rare rainbow star: bigger lift, a speed burst, and a short missile-immunity window.
const RAINBOW_CHANCE = 0.08, RAINBOW_LIFT = 430, RAINBOW_SPEED = 1.5, BUFF_DURATION = 3.6;

const ASSET = (name: string) => `${import.meta.env.BASE_URL}plane-game/assets/${name}`;
const ASSETS = {
  plane1: 'plane1.png', plane2: 'plane2.png', plane3: 'plane3.png',
  sky: 'sky.png', puff: 'puff.png', star: 'star.png',
  missile: 'missile.svg', boatSmall: 'boat-small.svg', boatLarge: 'boat-large.svg', boatLong: 'boat-long.svg',
};

type Phase = 'aim' | 'flying' | 'landing' | 'falling' | 'over';
type Result = { won: boolean; payout: number; mult: number; stars: number; ratingDelta?: number } | null;

interface Plane { wx: number; y: number; vx: number; vy: number; w: number; h: number; frame: number; frameT: number; ang: number; }
interface Boat { wx: number; w: number; h: number; deckFrac: number; img: HTMLImageElement; }
interface Missile { wx: number; y: number; w: number; vx: number; hit: boolean; }
interface Star { wx: number; y: number; w: number; t: number; got: boolean; rainbow?: boolean; }
interface Puff { x: number; y: number; t: number; life: number; s: number; }
interface Pop { x: number; y: number; vx: number; vy: number; life: number; t: number; color: string; r: number; }

export function PlaneGame({
  coins, stakes, onCharge, onWin, onLose, onAudit, onClose,
}: {
  coins: number;
  stakes: number[];
  onCharge: (stake: number) => Promise<boolean>;
  onWin: (payout: number, context: { stake: number; riskLevel: number }) => Promise<MinigameWinResult>;
  onLose: (stake: number, context: { riskLevel: number; blunder: boolean }) => Promise<MinigameWinResult | void> | void;
  onAudit: (event: MinigameAuditInput) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('aim');
  const [stake, setStake] = useState(() => stakes.find((s) => s <= coins) ?? stakes[0]);
  const [angle, setAngle] = useState(50);
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // refs the rAF loop / handlers read so they always see the latest
  const angleRef = useRef(angle); angleRef.current = angle;
  const stakeRef = useRef(stake); stakeRef.current = stake;
  const onWinRef = useRef(onWin); onWinRef.current = onWin;
  const onLoseRef = useRef(onLose); onLoseRef.current = onLose;
  const onAuditRef = useRef(onAudit); onAuditRef.current = onAudit;
  const sessionIdRef = useRef('');
  const api = useRef<{ launch: () => void; playAgain: () => void } | null>(null);

  const canPlay = stake <= coins && stake >= 1;

  async function handleLaunch() {
    if (!canPlay || busy) return;
    setErr(''); setBusy(true);
    try {
      const ok = await onCharge(stake);
      if (ok) {
        const sessionId = createMinigameSessionId('plane');
        sessionIdRef.current = sessionId;
        onAudit({
          game: 'plane',
          action: 'launched',
          sessionId,
          choice: `${angle} degree launch`,
          stake,
          multiplier: 1,
          result: 'started',
        });
        api.current?.launch();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start.');
    } finally {
      setBusy(false);
    }
  }

  // ---- the game engine ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const appFontFamily = getComputedStyle(document.documentElement).fontFamily;
    document.fonts?.load(`900 56px ${appFontFamily}`).catch(() => {});
    const IMG: Record<string, HTMLImageElement> = {};
    Object.entries(ASSETS).forEach(([k, v]) => { const im = new Image(); im.src = ASSET(v); IMG[k] = im; });

    let W = 0, H = 0, DPR = 1, waterLine = 0, launchX = 0, launchY = 0;
    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      waterLine = H * 0.78; launchX = 0; launchY = H * 0.34;
    }
    resize();
    window.addEventListener('resize', resize);

    let st: Phase = 'aim';
    let mult = 1, starCount = 0, missilePenalty = 0, camX = 0, buffT = 0;
    const plane: Plane = { wx: 0, y: 0, vx: 0, vy: 0, w: 80, h: 66, frame: 0, frameT: 0, ang: 0 };
    let boats: Boat[] = [], missiles: Missile[] = [], stars: Star[] = [], puffs: Puff[] = [], pops: Pop[] = [];
    let nextStarX = 0, nextMissileX = 0, nextBoatX = 0, landBoat: Boat | null = null;

    let actx: AudioContext | null = null;
    const beep = (f: number, d: number, type: OscillatorType = 'sine', v = 0.05) => {
      try {
        actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(actx.destination);
        o.start(); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d); o.stop(actx.currentTime + d);
      } catch { /* ignore */ }
    };

    const sx = (wx: number) => wx - camX;
    const deckY = (b: Boat) => (waterLine - b.h * 0.62) + b.h * b.deckFrac;
    const curMult = () => {
      const distance = Math.max(0, plane.wx - launchX);
      return Math.max(1, 1 + MULT_K * Math.log(1 + distance / MULT_SCALE) + starCount * STAR_MULT - missilePenalty);
    };

    function stepGlide(o: { wx: number; y: number; vx: number; vy: number }, dt: number) {
      o.vy += GRAV * dt; o.vy *= Math.max(0, 1 - VDRAG * dt); o.vy = Math.min(MAXVY, o.vy);
      o.vx *= Math.max(0, 1 - HDRAG * dt); o.wx += o.vx * dt; o.y += o.vy * dt;
    }
    function spawnPops(x: number, y: number, color: string, n: number) {
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 40 + Math.random() * 170;
        pops.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .5 + Math.random() * .4, t: 0, color, r: 2 + Math.random() * 3 }); }
    }
    function spawnAhead() {
      const front = camX + W * 1.9;
      while (nextStarX < front) { const rainbow = Math.random() < RAINBOW_CHANCE; stars.push({ wx: nextStarX, y: H * 0.14 + Math.random() * (waterLine - H * 0.14 - 120), w: rainbow ? 48 : 38, t: Math.random() * 6, got: false, rainbow }); nextStarX += 150 + Math.random() * 150; }
      while (nextMissileX < front) { missiles.push({ wx: nextMissileX, y: H * 0.14 + Math.random() * (waterLine - H * 0.14 - 70), w: 58, vx: -(70 + Math.random() * 120), hit: false }); nextMissileX += 130 + Math.random() * 150; }
      while (nextBoatX < front) {
        const r = Math.random();
        let w: number, h: number, deckFrac: number, img: HTMLImageElement;
        if (r < 0.12) { w = 460; h = w * (150 / 460); deckFrac = 0.52; img = IMG.boatLong; }   // rare long ship
        else if (r < 0.56) { w = 330; h = w * (140 / 300); deckFrac = 0.50; img = IMG.boatLarge; }
        else { w = 250; h = w * (120 / 200); deckFrac = 0.47; img = IMG.boatSmall; }
        boats.push({ wx: nextBoatX, w, h, deckFrac, img }); nextBoatX += w + (60 + Math.random() * 170);
      }
    }

    function toAim() {
      st = 'aim'; setPhase('aim');
      plane.wx = launchX; plane.y = launchY; plane.vx = 0; plane.vy = 0; plane.ang = 0; mult = 1; starCount = 0; missilePenalty = 0; buffT = 0;
      boats = []; missiles = []; stars = []; puffs = []; pops = []; landBoat = null;
      camX = launchX - W * CAM_OFF;
    }
    function launch() {
      mult = 1; starCount = 0; missilePenalty = 0; buffT = 0;
      plane.wx = launchX; plane.y = launchY; plane.ang = 0;
      const a = angleRef.current * Math.PI / 180; plane.vx = V0 * Math.cos(a); plane.vy = -V0 * Math.sin(a);
      boats = []; missiles = []; stars = []; puffs = []; pops = []; landBoat = null;
      camX = plane.wx - W * CAM_OFF;
      nextStarX = launchX + 300; nextMissileX = launchX + 360; nextBoatX = launchX + FIRST_BOAT;
      spawnAhead();
      st = 'flying'; setPhase('flying');
    }
    function finish(won: boolean, payout: number) {
      st = 'over'; setPhase('over');
      setResult({ won, payout, mult, stars: starCount });
      const riskLevel = Math.min(1, Math.max(0.2, mult / 4.2 + starCount * 0.08));
      if (won && payout > 0) {
        onWinRef.current(payout, { stake: stakeRef.current, riskLevel })
          .then((settled) => {
            setResult((current) => current ? { ...current, ratingDelta: settled.ratingDelta } : current);
            onAuditRef.current({
              game: 'plane',
              action: 'round_finished',
              sessionId: sessionIdRef.current,
              choice: `Landed with ${starCount} ${starCount === 1 ? 'star' : 'stars'}`,
              stake: stakeRef.current,
              payout: settled.payout,
              multiplier: mult,
              ratingDelta: settled.ratingDelta,
              result: 'won',
            });
          })
          .catch(() => {
            onAuditRef.current({
              game: 'plane', action: 'round_finished', sessionId: sessionIdRef.current,
              choice: `Landed with ${starCount} ${starCount === 1 ? 'star' : 'stars'}`,
              stake: stakeRef.current, payout, multiplier: mult, result: 'won',
            });
          });
      } else if (!won) {
        Promise.resolve(onLoseRef.current(stakeRef.current, {
          riskLevel,
          blunder: mult < 1.12 && starCount === 0,
        }))
          .then((settled) => {
            if (settled) {
              setResult((current) => current ? { ...current, ratingDelta: settled.ratingDelta } : current);
            }
            onAuditRef.current({
              game: 'plane',
              action: 'round_finished',
              sessionId: sessionIdRef.current,
              choice: `Crashed with ${starCount} ${starCount === 1 ? 'star' : 'stars'}`,
              stake: stakeRef.current,
              payout: 0,
              multiplier: mult,
              ratingDelta: settled?.ratingDelta ?? 0,
              result: 'lost',
            });
          })
          .catch(() => {
            onAuditRef.current({
              game: 'plane', action: 'round_finished', sessionId: sessionIdRef.current,
              choice: `Crashed with ${starCount} ${starCount === 1 ? 'star' : 'stars'}`,
              stake: stakeRef.current, payout: 0, multiplier: mult, result: 'lost',
            });
          });
      }
    }
    api.current = { launch, playAgain: toAim };

    function update(dt: number) {
      puffs.forEach((p) => p.t += dt); pops.forEach((p) => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; });
      puffs = puffs.filter((p) => p.t < p.life); pops = pops.filter((p) => p.t < p.life);

      if (st === 'flying') {
        stepGlide(plane, dt);
        plane.ang = Math.atan2(plane.vy, plane.vx) * 0.6;
        mult = curMult(); camX = plane.wx - W * CAM_OFF;
        if (plane.y < H * 0.05) { plane.y = H * 0.05; if (plane.vy < 0) plane.vy = 0; }
        if (Math.random() < 0.6) puffs.push({ x: sx(plane.wx) - Math.cos(plane.ang) * plane.w * 0.45, y: plane.y - Math.sin(plane.ang) * plane.w * 0.45, t: 0, life: .55, s: 10 + Math.random() * 8 });
        missiles.forEach((m) => { m.wx += m.vx * dt; if (Math.random() < 0.7) puffs.push({ x: sx(m.wx) + 22, y: m.y, t: 0, life: .4, s: 8 + Math.random() * 6 }); });
        stars.forEach((s) => s.t += dt);
        spawnAhead();
        missiles = missiles.filter((m) => m.wx > camX - 80 && !m.hit);
        stars = stars.filter((s) => s.wx > camX - 80 && !s.got);
        boats = boats.filter((b) => b.wx + b.w > camX - 40);

        if (buffT > 0) { const prev = buffT; buffT = Math.max(0, buffT - dt); if (prev > 0 && buffT === 0) plane.vx /= RAINBOW_SPEED; } // restore normal speed when the buff ends

        const pr = plane.h * 0.40;
        for (const s of stars) { if (s.got) continue; if (Math.hypot(plane.wx - s.wx, plane.y - s.y) < pr + s.w * 0.45) {
          s.got = true;
          if (s.rainbow) {
            starCount += 2; mult = curMult();
            plane.vy -= RAINBOW_LIFT; if (plane.vy < -V0 * 1.35) plane.vy = -V0 * 1.35;
            if (buffT <= 0) plane.vx *= RAINBOW_SPEED; // apply the speed burst once (no stacking)
            buffT = BUFF_DURATION;     // brief missile immunity
            spawnPops(sx(s.wx), s.y, '#ff5db8', 8); spawnPops(sx(s.wx), s.y, '#5db8ff', 8); spawnPops(sx(s.wx), s.y, '#ffd23f', 8);
            beep(660, .1, 'triangle', .06); setTimeout(() => beep(880, .1, 'triangle', .06), 70); setTimeout(() => beep(1175, .16, 'triangle', .06), 145);
          } else {
            starCount++; mult = curMult(); plane.vy -= STAR_BOOST; if (plane.vy < -V0) plane.vy = -V0;
            spawnPops(sx(s.wx), s.y, '#ffd23f', 10); beep(990, .1, 'triangle', .05);
          }
        } }
        for (const m of missiles) { if (m.hit) continue; if (Math.hypot(plane.wx - m.wx, plane.y - m.y) < pr + m.w * 0.34) {
          m.hit = true;
          if (buffT > 0) { // immune — blast the missile away
            spawnPops(sx(m.wx), m.y, '#7cffcb', 10); beep(720, .07, 'triangle', .045);
          } else {
            missilePenalty += MISSILE_MULT_PENALTY; mult = curMult(); plane.vy += MISSILE_PUSH;
            spawnPops(sx(m.wx), m.y, '#d8534f', 8); beep(300, .12, 'square', .05);
          }
        } }
        missiles = missiles.filter((m) => !m.hit);

        const bottom = plane.y + plane.h * 0.34;
        for (const b of boats) { const dy = deckY(b), left = b.wx + b.w * 0.08, right = b.wx + b.w * 0.92;
          if (plane.wx > left && plane.wx < right && plane.vy >= 0 && bottom >= dy - 14 && bottom <= dy + 26) {
            landBoat = b; plane.y = dy - plane.h * 0.34; plane.vy = 0; st = 'landing'; setPhase('landing'); beep(520, .08); break; } }
        if (st === 'flying' && bottom >= waterLine + 4) finish(false, 0);
      } else if (st === 'landing' && landBoat) {
        plane.vx -= DECEL * dt; if (plane.vx < 0) plane.vx = 0; plane.wx += plane.vx * dt;
        plane.ang += (0 - plane.ang) * Math.min(1, dt * 10); plane.y = deckY(landBoat) - plane.h * 0.34;
        const noseRight = plane.wx + plane.w * 0.30, deckRight = landBoat.wx + landBoat.w * 0.92;
        if (noseRight > deckRight) { st = 'falling'; setPhase('falling'); plane.vy = 20; beep(260, .18, 'sawtooth', .05); }
        else if (plane.vx <= 4) { spawnPops(sx(plane.wx), plane.y, '#2f7d63', 16); beep(660, .12); setTimeout(() => beep(880, .16), 90); finish(true, stakeRef.current * mult); }
      } else if (st === 'falling') {
        plane.vy += GRAV * dt; plane.wx += plane.vx * dt; plane.y += plane.vy * dt;
        plane.ang += (1.2 - plane.ang) * Math.min(1, dt * 4);
        if (plane.y + plane.h * 0.34 >= waterLine + 4) finish(false, 0);
      }
    }

    // ---- drawing ----
    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function drawBg() {
      const g = ctx.createLinearGradient(0, 0, 0, waterLine); g.addColorStop(0, '#bfe6f3'); g.addColorStop(1, '#e8f6fb');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, waterLine);
      if (IMG.sky.width) { const cw = 820, ch = cw * (IMG.sky.height / IMG.sky.width), y = waterLine * 0.26;
        const off = -(((camX * 0.3) % cw) + cw) % cw; for (let x = off - cw; x < W + cw; x += cw) ctx.drawImage(IMG.sky, x, y, cw, ch); }
      const gw = ctx.createLinearGradient(0, waterLine, 0, H); gw.addColorStop(0, '#3fa3c7'); gw.addColorStop(1, '#1f6f97');
      ctx.fillStyle = gw; ctx.fillRect(0, waterLine, W, H - waterLine);
      const t = performance.now() / 1000;
      for (let layer = 0; layer < 2; layer++) { ctx.beginPath(); ctx.moveTo(0, waterLine);
        const amp = layer ? 5 : 8, len = layer ? 70 : 120, sp = layer ? 1.4 : 0.8, yo = layer ? 2 : 8;
        for (let x = 0; x <= W; x += 8) ctx.lineTo(x, waterLine + yo + Math.sin((x / len) + t * sp + layer + camX * 0.002) * amp);
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        ctx.fillStyle = layer ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.16)'; ctx.fill(); }
    }
    function drawBoats() {
      for (const b of boats) { const x = sx(b.wx), y = waterLine - b.h * 0.62; if (x > W + 40 || x + b.w < -40) continue;
        if (b.img.width) ctx.drawImage(b.img, x, y, b.w, b.h);
        const dy = y + b.h * b.deckFrac; ctx.save(); ctx.fillStyle = 'rgba(22,61,49,0.82)';
        ctx.font = '800 12px Segoe UI'; const tw = ctx.measureText('DECK').width + 14; roundRect(x + b.w / 2 - tw / 2, dy - 28, tw, 18, 8); ctx.fill();
        ctx.fillStyle = '#f2c879'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DECK', x + b.w / 2, dy - 19); ctx.restore(); }
    }
    function starPath(cx: number, cy: number, outer: number, inner: number, rotation: number) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = rotation - Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 === 0 ? outer : inner;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }
    function drawRainbowStar(x: number, y: number, size: number, t: number) {
      const radius = size / 2;
      const hueShift = (t * 90) % 360;
      ctx.save();
      ctx.globalAlpha = 0.28;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `hsl(${(hueShift + i * 120) % 360}, 95%, 62%)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, radius * (0.58 + i * 0.18), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = `hsl(${hueShift}, 95%, 70%)`;
      ctx.shadowBlur = 16;
      const gradient = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
      gradient.addColorStop(0, '#ff4f81');
      gradient.addColorStop(0.25, '#ffd23f');
      gradient.addColorStop(0.5, '#4fe08b');
      gradient.addColorStop(0.75, '#46a7ff');
      gradient.addColorStop(1, '#9b6dff');
      starPath(x, y, radius * 0.52, radius * 0.23, t * 1.4);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.86)';
      ctx.stroke();
      ctx.restore();
    }
    function drawStars() { for (const s of stars) { if (s.got) continue; const x = sx(s.wx); if (x < -40 || x > W + 40) continue;
      const bob = Math.sin(s.t * 3) * 4, sc = 1 + Math.sin(s.t * 5) * (s.rainbow ? 0.14 : 0.06);
      if (!IMG.star.width) continue;
      if (s.rainbow) {
        drawRainbowStar(x, s.y + bob, s.w * sc, s.t);
      } else {
        ctx.drawImage(IMG.star, x - s.w * sc / 2, s.y + bob - s.w * sc / 2, s.w * sc, s.w * sc);
      }
    } }
    function drawMissiles() { for (const m of missiles) { const x = sx(m.wx); if (x < -60 || x > W + 60) continue;
      const mw = m.w, mh = m.w * 0.5; if (IMG.missile.width) ctx.drawImage(IMG.missile, x - mw / 2, m.y - mh / 2, mw, mh); } }
    function drawPuffs() { for (const p of puffs) { ctx.globalAlpha = (1 - p.t / p.life) * 0.5; if (IMG.puff.width) ctx.drawImage(IMG.puff, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); } ctx.globalAlpha = 1; }
    function drawPops() { for (const p of pops) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); } ctx.globalAlpha = 1; }
    function drawPlane() {
      const f = IMG['plane' + (plane.frame + 1)]; ctx.save(); ctx.translate(sx(plane.wx), plane.y); ctx.rotate(plane.ang);
      if (buffT > 0) {
        // colorful, glowing plane while the rainbow buff is active
        const hue = Math.round(performance.now() / 4) % 360;
        ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = 22;
        ctx.filter = `hue-rotate(${hue}deg) saturate(2.2) brightness(1.15)`;
      }
      if (f && f.width) ctx.drawImage(f, -plane.w / 2, -plane.h / 2, plane.w, plane.h);
      ctx.restore();
    }
    function drawAim() {
      const a = angleRef.current * Math.PI / 180;
      const o = { wx: launchX, y: launchY, vx: V0 * Math.cos(a), vy: -V0 * Math.sin(a) };
      let drawn = 0;
      for (let i = 0; i < 500; i++) { stepGlide(o, 0.05); if (o.y > waterLine) break; const X = sx(o.wx); if (X > W + 30) break;
        if (i % 2 === 0) { const al = Math.max(0.10, 0.72 - drawn * 0.010), r = Math.max(2, 5 - drawn * 0.05);
          ctx.fillStyle = `rgba(22,61,49,${al})`; ctx.beginPath(); ctx.arc(X, o.y, r, 0, 6.28); ctx.fill(); drawn++; } }
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawBg(); drawBoats(); drawStars(); drawPuffs(); drawMissiles();
      if (st === 'aim') drawAim();
      drawPlane(); drawPops();
      plane.frameT += 1 / 60; if (plane.frameT > 0.05) { plane.frame = (plane.frame + 1) % 3; plane.frameT = 0; }
      if (st === 'flying' || st === 'landing') { ctx.save(); ctx.textAlign = 'center'; ctx.font = `900 56px ${appFontFamily}`;
        ctx.fillStyle = 'rgba(47,125,99,0.26)'; ctx.fillText(mult.toFixed(2) + '×', W / 2, H * 0.22); ctx.restore(); }
    }

    // ---- aim drag: grab anywhere in the sky and slide up/down ----
    let aiming = false, startY = 0, startAngle = 50;
    const onDown = (e: PointerEvent) => { if (st !== 'aim') return; aiming = true; startY = e.clientY; startAngle = angleRef.current; canvas.setPointerCapture?.(e.pointerId); };
    const onMove = (e: PointerEvent) => { if (!aiming || st !== 'aim') return;
      const next = Math.round(Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, startAngle + (startY - e.clientY) * 0.35)));
      angleRef.current = next; setAngle(next); e.preventDefault(); };
    const onUp = () => { aiming = false; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    toAim();
    let raf = 0, last = performance.now();
    const loop = (now: number) => { let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05; update(dt); draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      api.current = null;
    };
  // engine is created once; live values flow through refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[120] select-none overflow-hidden bg-[#101927] text-white" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* HUD */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-[#101927]/95 to-transparent px-4 pb-8"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}
      >
        <div>
          <p className="text-xs font-bold uppercase text-sky-200/60">Arcade</p>
          <h1 className="text-xl font-black">Sky Landing</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 backdrop-blur">
            <CoinAmount amount={Math.round(coins)} className="text-sm" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur transition active:scale-95"
            aria-label="Close Sky Landing"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Aim controls */}
      {phase === 'aim' && (
        <div
          className="absolute inset-x-0 bottom-0 flex max-h-[58dvh] flex-col gap-3 overflow-y-auto rounded-t-2xl border-t border-white/10 bg-[#172337]/[0.98] px-4 pt-4 shadow-[0_-18px_45px_rgba(0,0,0,.35)] backdrop-blur"
          style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + 0.25rem))' }}
        >
          <p className="text-center text-xs font-semibold text-white/55">Drag the sky to aim. The dotted line shows your glide.</p>
          {err ? <p className="text-center text-xs font-bold text-coral">{err}</p> : null}

          <div className="mx-auto w-full max-w-md">
            <div className="rounded-xl bg-white p-3 text-ink">
              <StakeInput
                label="Stake"
                value={stake}
                min={1}
                step={1}
                onChange={(v) => setStake(Math.max(1, Math.min(Math.floor(coins), Math.round(v))))}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {stakes.map((s) => (
                  <button key={s} disabled={s > coins} onClick={() => setStake(s)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${stake === s ? 'border-sky bg-sky/10 text-sky' : 'border-line bg-white text-ink/70'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-sm font-bold text-white/55">Angle</span>
            <input type="range" min={ANGLE_MIN} max={ANGLE_MAX} value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
              className="h-8 flex-1 cursor-pointer accent-sky" />
            <span className="w-12 text-right text-base font-black text-white">{angle}°</span>
          </div>

          <button onClick={handleLaunch} disabled={!canPlay || busy}
            className="mx-auto w-full max-w-md rounded-xl bg-sky px-4 py-3.5 text-base font-black text-white shadow-lift transition active:scale-[.99] disabled:opacity-50">
            {busy ? 'Launching…' : coins < 1 ? 'Not enough coins' : <>Launch for <CoinAmount amount={stake} className="text-base" /></>}
          </button>
        </div>
      )}

      {/* Result */}
      {phase === 'over' && result && (
        <div className="absolute inset-0 grid place-items-center bg-black/55 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-soft-enter rounded-2xl border border-white/10 bg-[#172337] p-6 text-center text-white shadow-lift">
            <h2 className="text-2xl font-black">{result.won ? `Landed at ${result.mult.toFixed(2)}×` : 'Crashed'}</h2>
            <p className={`my-2 text-4xl font-black ${result.won ? 'text-mint' : 'text-coral'}`}>
              {result.won ? '+' : '-'}{result.won ? Math.round(result.payout) : stake}
            </p>
            <p className="mb-4 text-sm text-white/55">
              {result.won
                ? `Stopped safely on deck with ${result.stars} stars.`
                : 'Into the sea. Try a different angle next time.'}
            </p>
            {result.ratingDelta ? (
              <p className={`mb-4 rounded-xl px-3 py-2 text-sm font-black ${
                result.ratingDelta > 0 ? 'bg-plum/20 text-purple-200' : 'bg-coral/15 text-coral'
              }`}>
                {result.ratingDelta > 0 ? '+' : ''}{result.ratingDelta} ELO
              </p>
            ) : null}
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white/70">Leave</button>
              <button
                onClick={() => { setResult(null); api.current?.playAgain(); if (stake > coins) setStake(stakes.find((s) => s <= coins) ?? stakes[0]); }}
                className="flex-1 rounded-xl bg-sky px-4 py-3 text-sm font-black text-white">
                Play again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
