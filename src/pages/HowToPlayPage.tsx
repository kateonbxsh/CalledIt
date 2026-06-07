import {
  BarChart2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Flame,
  Hash,
  HelpCircle,
  Lock,
  Medal,
  Minus,
  Plus,
  Shield,
  Swords,
  Trophy,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { RankBadge } from '../components/RankBadge';
import { rankRanges } from '../utils/ranks';

function Pill({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${
        active ? 'bg-ink text-white' : 'bg-field text-ink/60'
      }`}
    >
      {label}
    </span>
  );
}

function Coin({ amount, className = '' }: { amount: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-citrus ${className}`}>
      <CircleDollarSign size={14} className="fill-citrus/15" />
      {amount}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-xs font-black uppercase tracking-widest text-ink/35">{children}</p>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-white p-5 ${className}`}>{children}</div>
  );
}

/* ── Mini bet card visual ────────────────────────────────────── */
function BetCardPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-soft">
      <div className="flex items-center gap-3 bg-field/60 px-4 py-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-mint/15 grid place-items-center">
          <Swords size={16} className="text-mint" />
        </div>
        <div>
          <p className="text-xs font-semibold text-ink/50">Sports</p>
          <p className="font-black text-sm leading-tight">Will Algeria qualify for the World Cup?</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-mint/12 px-2.5 py-0.5 text-xs font-black text-mint">
          Open
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 py-3">
        <div className="rounded-lg bg-mint/8 px-3 py-2 text-center">
          <p className="text-xs text-ink/55">Yes</p>
          <p className="text-sm font-black text-mint">62%</p>
        </div>
        <div className="rounded-lg bg-field px-3 py-2 text-center">
          <p className="text-xs text-ink/55">No</p>
          <p className="text-sm font-black">38%</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line/60 px-4 py-2.5 text-xs text-ink/50">
        <span>12 predictions</span>
        <Coin amount={840} className="text-xs" />
      </div>
    </div>
  );
}

/* ── Stake visual ────────────────────────────────────────────── */
function StakePreview() {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-wider text-ink/40">Your prediction</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button className="rounded-lg bg-ink py-2.5 text-sm font-bold text-white">Yes</button>
        <button className="rounded-lg bg-field py-2.5 text-sm font-bold text-ink/60">No</button>
      </div>
      <div className="mb-3 flex items-center justify-between rounded-lg border border-line bg-field px-3 py-2">
        <span className="text-sm font-semibold">Stake</span>
        <div className="flex items-center gap-2">
          <button className="grid h-6 w-6 place-items-center rounded-md border border-line bg-white">
            <Minus size={12} />
          </button>
          <Coin amount={100} />
          <button className="grid h-6 w-6 place-items-center rounded-md border border-line bg-white">
            <Plus size={12} />
          </button>
        </div>
      </div>
      <div className="rounded-lg bg-mint/8 px-3 py-2 text-xs text-mint">
        <div className="flex justify-between">
          <span>If Yes wins</span>
          <span className="font-bold">+<Coin amount={62} className="text-xs text-mint" /> profit</span>
        </div>
      </div>
    </div>
  );
}

/* ── Pool payout visual ──────────────────────────────────────── */
function PayoutPreview() {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-wider text-ink/40">How the pool works</p>
      <div className="mb-3 space-y-1.5">
        {[
          { name: 'Alice', pick: 'Yes', stake: 200, won: true },
          { name: 'Bob', pick: 'Yes', stake: 100, won: true },
          { name: 'Carlos', pick: 'No', stake: 150, won: false },
          { name: 'Dana', pick: 'No', stake: 90, won: false },
        ].map((p) => (
          <div
            key={p.name}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
              p.won ? 'bg-mint/8' : 'bg-field'
            }`}
          >
            <span className={`font-semibold ${p.won ? 'text-mint' : 'text-ink/50'}`}>{p.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.won ? 'bg-mint text-white' : 'bg-line/60 text-ink/50'}`}>{p.pick}</span>
            <Coin amount={p.stake} className="ml-auto text-xs" />
            {p.won ? <CheckCircle2 size={12} className="text-mint" /> : <span className="text-xs text-ink/30">lost</span>}
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-citrus/20 bg-citrus/6 px-3 py-2 text-xs">
        <div className="flex justify-between font-semibold">
          <span>Losing pool <span className="font-normal text-ink/50">(redistributed)</span></span>
          <Coin amount={240} className="text-xs" />
        </div>
        <div className="mt-1 flex justify-between text-ink/55">
          <span>Alice gets back stake + <Coin amount={160} className="text-xs" /></span>
        </div>
        <div className="mt-0.5 flex justify-between text-ink/55">
          <span>Bob gets back stake + <Coin amount={80} className="text-xs" /></span>
        </div>
      </div>
    </div>
  );
}

/* ── Chance formula visual ───────────────────────────────────── */
function ChancePreview() {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-wider text-ink/40">Chance = weighted mix</p>
      <div className="space-y-2">
        {[
          { label: 'Users who picked this', pct: '42%', color: 'bg-sky' },
          { label: 'Coins staked on this', pct: '51%', color: 'bg-mint' },
          { label: 'Past accuracy of pickers', pct: '7%', color: 'bg-plum' },
        ].map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-ink/65">{r.label}</span>
              <span className="font-bold">{r.pct}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-field">
              <div className={`h-full rounded-full ${r.color}`} style={{ width: r.pct }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink/45 italic">
        Heavier stakers and more accurate users shift the displayed odds.
      </p>
    </div>
  );
}

/* ── ELO visual ──────────────────────────────────────────────── */
function EloPreview() {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-wider text-ink/40">ELO changes on resolution</p>
      <div className="space-y-2">
        {[
          { label: 'Correct pick (low chance)', delta: '+48', color: 'text-mint', bg: 'bg-mint/8' },
          { label: 'Correct pick (high chance)', delta: '+12', color: 'text-mint', bg: 'bg-mint/6' },
          { label: 'Wrong pick (low chance)', delta: '−8', color: 'text-coral', bg: 'bg-coral/6' },
          { label: 'Wrong pick (high chance)', delta: '−24', color: 'text-coral', bg: 'bg-coral/8' },
        ].map((row) => (
          <div key={row.label} className={`flex items-center justify-between rounded-lg px-3 py-2 ${row.bg}`}>
            <span className="text-xs text-ink/70">{row.label}</span>
            <span className={`text-sm font-black ${row.color}`}>{row.delta}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/45 italic">Being right when everyone else is wrong earns more.</p>
    </div>
  );
}

/* ── Bet types grid ──────────────────────────────────────────── */
const betTypes = [
  {
    icon: HelpCircle,
    label: 'Yes / No',
    desc: 'Simple binary outcome. Will it happen or not?',
    color: 'text-mint',
    bg: 'bg-mint/8',
  },
  {
    icon: Swords,
    label: 'Sports match',
    desc: 'Pick a winner (home / away / draw). Add exact score for a bonus.',
    color: 'text-sky',
    bg: 'bg-sky/8',
  },
  {
    icon: TrendingUp,
    label: 'Over / Under',
    desc: 'Will a value exceed a line you set? E.g. more than 2.5 goals.',
    color: 'text-citrus',
    bg: 'bg-citrus/8',
  },
  {
    icon: CalendarDays,
    label: 'Before / After date',
    desc: 'Will something happen before or on/after a target date?',
    color: 'text-plum',
    bg: 'bg-plum/8',
  },
  {
    icon: BarChart2,
    label: 'Multiple choice',
    desc: 'Create 3+ custom options. Who will win the tournament?',
    color: 'text-coral',
    bg: 'bg-coral/8',
  },
  {
    icon: Hash,
    label: 'Closest number',
    desc: 'Everyone guesses a number. Closest to the real answer wins the pool.',
    color: 'text-aqua',
    bg: 'bg-aqua/8',
  },
  {
    icon: CalendarDays,
    label: 'Closest date',
    desc: 'Everyone guesses a date. Closest to the actual date wins.',
    color: 'text-aqua',
    bg: 'bg-aqua/8',
  },
];

/* ── Closest guess visual ────────────────────────────────────── */
function ClosestPreview() {
  const entries = [
    { name: 'Ali', guess: '43', dist: 2, won: true },
    { name: 'Sara', guess: '47', dist: 2, won: true },
    { name: 'Nour', guess: '38', dist: 7, won: false },
    { name: 'Zied', guess: '55', dist: 10, won: false },
  ];
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-1 text-xs font-black uppercase tracking-wider text-ink/40">Closest Number example</p>
      <p className="mb-3 text-xs text-ink/55">
        Question: "How many goals in the tournament?" — Actual answer: <strong>45</strong>
      </p>
      <div className="space-y-1.5">
        {entries.map((e) => (
          <div
            key={e.name}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
              e.won ? 'bg-mint/8 font-semibold' : 'bg-field'
            }`}
          >
            <span className={e.won ? 'text-mint' : 'text-ink/55'}>{e.name}</span>
            <span className="font-mono ml-auto">{e.guess}</span>
            <span className="text-ink/40">±{e.dist}</span>
            {e.won ? (
              <span className="rounded-full bg-mint text-white text-xs px-2 py-0.5 font-black">Win</span>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/45 italic">
        Tied winners (same distance) split the losing pool proportionally.
      </p>
    </div>
  );
}

/* ── Private + groups visual ─────────────────────────────────── */
function PrivatePreview() {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-field px-3 py-1 text-xs font-bold border border-line">All</span>
        <span className="rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">Weekend crew</span>
        <span className="rounded-full bg-field px-3 py-1 text-xs font-bold border border-line">Footy group</span>
      </div>
      <div className="space-y-2">
        {['Will Ahmed pay for dinner?', 'Who arrives late on Saturday?'].map((title) => (
          <div key={title} className="flex items-center gap-2 rounded-lg border border-line bg-field/50 px-3 py-2">
            <Lock size={12} className="shrink-0 text-ink/40" />
            <span className="text-xs font-semibold text-ink/70">{title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Ranks visual ────────────────────────────────────────────── */
function RanksPreview() {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {rankRanges.map((r) => (
          <div key={r.rank} className="rounded-lg bg-field px-3 py-2 text-center">
            <RankBadge rank={r.rank} />
            <p className="mt-1.5 text-xs text-ink/45">{r.range}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export function HowToPlayPage() {
  return (
    <div className="space-y-10 pb-6">
      {/* Hero */}
      <section>
        <div className="relative overflow-hidden rounded-2xl bg-ink px-6 py-8 text-white sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-mint/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 left-8 h-40 w-40 rounded-full bg-coral/20 blur-3xl" />
          <div className="relative">
            <div className="mb-3 flex items-center gap-2">
              <Zap size={20} className="text-citrus" />
              <span className="text-sm font-black text-white/70 uppercase tracking-widest">Called it</span>
            </div>
            <h1 className="text-3xl font-black leading-tight sm:text-4xl">
              Bet on anything.<br />
              <span className="text-mint">No real money.</span>
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/65">
              Create or join prediction bets with friends using fictional coins.
              The better your predictions, the higher your ELO rating and rank.
              It's about being right — and bragging about it.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {['Fictional coins only', 'ELO-ranked skill', 'Any topic', 'Private groups'].map((tag) => (
                <span key={tag} className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/75">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Core loop */}
      <section>
        <SectionLabel>Core loop</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              n: '1',
              icon: Flame,
              title: 'Create or find a bet',
              body: 'Anyone can create a bet on any topic. Browse the public feed or check private invites.',
              color: 'text-coral',
              bg: 'bg-coral/8',
            },
            {
              n: '2',
              icon: CircleDollarSign,
              title: 'Stake your coins',
              body: 'Pick the outcome you believe in and put coins on it. Higher stakes = bigger potential payout.',
              color: 'text-citrus',
              bg: 'bg-citrus/8',
            },
            {
              n: '3',
              icon: CheckCircle2,
              title: 'Resolve when ready',
              body: 'Once the answer is known, any user can resolve the bet. Coins are redistributed instantly.',
              color: 'text-mint',
              bg: 'bg-mint/8',
            },
            {
              n: '4',
              icon: Trophy,
              title: 'Earn ELO & rank up',
              body: 'Correct predictions earn ELO. The harder the call, the bigger the rating swing.',
              color: 'text-plum',
              bg: 'bg-plum/8',
            },
          ].map((step) => (
            <Card key={step.n} className="relative">
              <div className={`mb-3 inline-flex rounded-lg p-2 ${step.bg}`}>
                <step.icon size={18} className={step.color} />
              </div>
              <span className="absolute right-4 top-4 text-3xl font-black text-ink/6 select-none">{step.n}</span>
              <h3 className="font-black">{step.title}</h3>
              <p className="mt-1 text-sm text-ink/60 leading-5">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* What a bet looks like */}
      <section>
        <SectionLabel>A bet at a glance</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <BetCardPreview />
            <Card className="text-sm text-ink/65 leading-6">
              Each bet card shows the <strong className="text-ink">live odds</strong> (chance percentages),
              how many people predicted, and the total coin pool.
              Odds update every time someone new predicts.
            </Card>
          </div>
          <div className="space-y-3">
            <StakePreview />
            <Card className="text-sm text-ink/65 leading-6">
              You can stake any amount between 10 and your current balance cap.
              The estimated profit shown adjusts in real time as others join.
            </Card>
          </div>
        </div>
      </section>

      {/* How payouts work */}
      <section>
        <SectionLabel>Payouts</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <PayoutPreview />
          <Card className="flex flex-col gap-3 text-sm text-ink/65 leading-6">
            <p>
              All coins staked on the <strong className="text-ink">losing side</strong> are collected
              into a pool and split proportionally among winners based on their stake size.
            </p>
            <p>
              Winners always get their original stake back plus a share of the loser pool.
              The bigger your share of the winning side, the larger your cut.
            </p>
            <div className="mt-auto rounded-lg bg-field px-4 py-3 text-xs text-ink/55">
              <p className="font-bold text-ink/70 mb-1">Example formula</p>
              <p>Payout = your stake + (your stake / total winning stakes) × total losing pool</p>
            </div>
          </Card>
        </div>
      </section>

      {/* Chance calculation */}
      <section>
        <SectionLabel>How odds are calculated</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col gap-3 text-sm text-ink/65 leading-6">
            <p>
              Displayed odds are <strong className="text-ink">not</strong> simple vote counts.
              They factor in three things at once:
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><span className="shrink-0 font-bold text-sky">42%</span> Share of users who picked each option</li>
              <li className="flex gap-2"><span className="shrink-0 font-bold text-mint">51%</span> Share of total coins staked on each option</li>
              <li className="flex gap-2"><span className="shrink-0 font-bold text-plum">7%</span> Weighted average past accuracy of each option's pickers</li>
            </ul>
            <p>
              This means big stakers and historically accurate predictors have more influence on displayed odds.
            </p>
          </Card>
          <ChancePreview />
        </div>
      </section>

      {/* Bet types */}
      <section>
        <SectionLabel>Bet types</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {betTypes.map((t) => (
            <div key={t.label} className="flex gap-3 rounded-xl border border-line bg-white p-4">
              <div className={`mt-0.5 shrink-0 rounded-lg p-2 ${t.bg}`}>
                <t.icon size={16} className={t.color} />
              </div>
              <div>
                <p className="font-black text-sm">{t.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-ink/60">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Closest guess detail */}
      <section>
        <SectionLabel>Closest number & date bets</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <ClosestPreview />
          <Card className="flex flex-col gap-3 text-sm text-ink/65 leading-6">
            <p>
              Unlike standard bets, each player submits their own <strong className="text-ink">unique guess</strong> —
              there are no predefined options. Whoever is closest to the actual answer wins.
            </p>
            <p>
              If multiple people are tied (same distance to the answer), they split the
              losing pool <strong className="text-ink">proportionally to their stake</strong>.
            </p>
            <p>
              Individual guesses are hidden until the bet is resolved to prevent anchoring —
              you won't see what others guessed until the answer is revealed.
            </p>
            <div className="mt-auto rounded-lg bg-aqua/8 px-4 py-3 text-xs text-aqua font-medium">
              Good for: "How many goals in the Cup?", "When will the baby be born?", "Score of the match?"
            </div>
          </Card>
        </div>
      </section>

      {/* ELO */}
      <section>
        <SectionLabel>ELO rating system</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <EloPreview />
          <Card className="flex flex-col gap-3 text-sm text-ink/65 leading-6">
            <p>
              Your <strong className="text-ink">ELO rating</strong> measures prediction skill independently
              from coins. It starts at <strong className="text-ink">1000</strong> and moves up or down with every resolved bet.
            </p>
            <p>
              The formula rewards <strong className="text-ink">contrarian correctness</strong> — being
              right when the crowd was wrong earns far more ELO than calling the obvious winner.
            </p>
            <p>
              Correct prediction where odds were against you: <span className="font-bold text-mint">big gain</span>.
              Wrong prediction on something everyone expected: <span className="font-bold text-coral">bigger loss</span>.
            </p>
          </Card>
        </div>
      </section>

      {/* Ranks */}
      <section>
        <SectionLabel>Ranks</SectionLabel>
        <RanksPreview />
        <p className="mt-3 text-sm text-ink/55 text-center">
          Ranks are purely cosmetic — they reflect your accumulated ELO rating over all bets.
        </p>
      </section>

      {/* Private bets & groups */}
      <section>
        <SectionLabel>Private bets &amp; friend groups</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <PrivatePreview />
          <Card className="flex flex-col gap-3 text-sm text-ink/65 leading-6">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-lg bg-field p-2">
                <Lock size={16} className="text-ink/50" />
              </div>
              <div>
                <p className="font-bold text-ink">Private bets</p>
                <p>Only invited users can see and join. Create a bet and enter usernames manually.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-lg bg-field p-2">
                <Users size={16} className="text-ink/50" />
              </div>
              <div>
                <p className="font-bold text-ink">Friend groups</p>
                <p>Save a list of usernames as a group. When creating a private bet, select the group to auto-fill all invites at once.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-lg bg-field p-2">
                <Shield size={16} className="text-ink/50" />
              </div>
              <div>
                <p className="font-bold text-ink">Group tabs</p>
                <p>In the Private feed, switch between tabs to see bets from each of your groups separately.</p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Coins disclaimer */}
      <section>
        <div className="flex items-start gap-4 rounded-xl border border-citrus/25 bg-citrus/6 p-5">
          <CircleDollarSign size={22} className="mt-0.5 shrink-0 text-citrus" />
          <div>
            <p className="font-black text-citrus">Coins are completely fictional</p>
            <p className="mt-1 text-sm text-ink/65 leading-6">
              No real money is involved. Coins exist only within the app for staking and payouts.
              You get a starting balance when you sign up, and a daily refill if your balance runs low.
              ELO rating is the real measure of skill.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
