import { CheckCircle2, CircleDollarSign, Trophy } from 'lucide-react';
import { CoinAmount } from '../components/CoinAmount';
import { PageHeader } from '../components/PageHeader';
import { RankBadge } from '../components/RankBadge';

const steps = [
  {
    title: 'Pick a bet',
    body: 'Open public bets or private invites from the feed',
    preview: (
      <div className="grid grid-cols-[70px_1fr] overflow-hidden rounded-md border border-line bg-white">
        <div className="bg-field" />
        <div className="p-3">
          <span className="rounded-full bg-mint/12 px-2 py-1 text-xs font-black text-mint">Open</span>
          <p className="mt-2 font-black">Will it happen?</p>
          <p className="text-xs text-ink/55">Yes / No</p>
        </div>
      </div>
    ),
  },
  {
    title: 'Stake',
    body: 'Choose an option and set an amount',
    preview: (
      <div className="rounded-md border border-line bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          <button className="rounded-md bg-ink px-3 py-2 text-sm font-bold text-white">Yes</button>
          <button className="rounded-md bg-field px-3 py-2 text-sm font-bold">No</button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md border border-line px-3 py-2">
          <span className="text-sm font-semibold">Stake</span>
          <CoinAmount amount={50} />
        </div>
      </div>
    ),
  },
  {
    title: 'Settle the result',
    body: 'Resolve the bet when the answer is known',
    preview: (
      <div className="rounded-md border border-line bg-white p-3">
        <p className="mb-2 text-sm font-black">Resolve</p>
        <button className="flex w-full items-center justify-center gap-2 rounded-md bg-coral px-3 py-2 text-sm font-bold text-white">
          <CheckCircle2 size={16} /> Resolve bet
        </button>
      </div>
    ),
  },
  {
    title: 'Climb ranks',
    body: 'Correct low-chance picks move your Rating/ELO faster',
    preview: (
      <div className="rounded-md border border-line bg-white p-3">
        <div className="flex items-center justify-between">
          <RankBadge rank="Bronze" />
          <Trophy size={18} className="text-citrus" />
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-field">
          <div className="h-full w-2/3 rounded-full bg-citrus" />
        </div>
      </div>
    ),
  },
];

export function HowToPlayPage() {
  return (
    <>
      <PageHeader title="How to Play" />
      <div className="grid gap-3 md:grid-cols-2">
        {steps.map((step) => (
          <section key={step.title} className="rounded-md border border-line bg-white p-4 shadow-soft">
            {step.preview}
            <h2 className="mt-4 font-black">{step.title}</h2>
            <p className="mt-1 text-sm text-ink/60">{step.body}</p>
          </section>
        ))}
      </div>
      <section className="mt-4 rounded-md border border-line bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <CircleDollarSign className="text-citrus" size={18} />
          <h2 className="font-black text-citrus">Coins are fictional</h2>
        </div>
        <p className="text-sm text-ink/60">
          Coins are for staking and payouts only. Rating/ELO is separate and measures prediction skill.
        </p>
      </section>
    </>
  );
}
