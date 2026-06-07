import { CircleDollarSign } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { rankRanges } from '../utils/ranks';
import { RankBadge } from '../components/RankBadge';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-black">{title}</h2>
      <div className="rounded-2xl border border-line bg-white p-5 text-sm leading-6 text-ink/70 space-y-2">
        {children}
      </div>
    </section>
  );
}

export function HowToPlayPage() {
  return (
    <>
      <PageHeader title="How to Play" />

      <div className="space-y-6">

        <Section title="The concept">
          <p>
            <strong className="text-ink">Called it</strong> is a prediction game played with fictional coins —
            no real money, ever. You and your friends bet on anything:
            sports results, personal challenges, world events, random bets.
          </p>
          <p>
            The goal is to make correct predictions. The better your track record, the higher your <strong className="text-ink">ELO rating</strong> and rank.
          </p>
        </Section>

        <Section title="Creating a bet">
          <p>Anyone can create a bet. Pick a type, write the question, set a deadline (optional), and choose who can see it:</p>
          <ul className="mt-1 space-y-1.5 list-none">
            {[
              ['Yes / No', 'Simple two-sided outcome.'],
              ['Sports Match', 'Pick home / away / draw. Optionally allow exact-score guesses for a bonus.'],
              ['Over / Under', 'Will a number be above or below a line you set?'],
              ['Before / After', 'Will something happen before or after a date?'],
              ['Multiple Choice', 'Three or more custom options.'],
              ['Closest Number', 'Everyone guesses a number — closest to the real answer wins the pool.'],
              ['Closest Date', 'Same idea but with dates.'],
            ].map(([label, desc]) => (
              <li key={label} className="flex gap-2">
                <span className="mt-0.5 shrink-0 font-black text-ink">·</span>
                <span><span className="font-bold text-ink">{label}:</span> {desc}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Predicting">
          <p>Open any bet, pick your outcome, and set your stake (minimum 10 coins). Your coins are locked until the bet is resolved.</p>
          <p>For <strong className="text-ink">Closest Number / Date</strong> bets, just type your guess — individual guesses are hidden from others until resolution.</p>
        </Section>

        <Section title="Payouts">
          <p>When a bet is resolved, the coins staked on the losing side are collected and split among winners — proportional to each winner's share of the winning-side total.</p>
          <p>You always get your original stake back plus a share of the loser pool. The fewer people on your side, the bigger your share if you're right.</p>
          <p>For Closest bets: the player(s) nearest to the actual answer win. Ties are split proportionally by stake.</p>
        </Section>

        <Section title="Displayed odds">
          <p>
            The percentage shown on each option is a weighted mix:
            42% from how many users picked it, 51% from how many coins are staked on it,
            and 7% from the past prediction accuracy of those users.
          </p>
          <p>
            This means the odds update live as people join and shift slightly toward historically accurate predictors.
          </p>
        </Section>

        <Section title="ELO rating">
          <p>
            Every resolved bet changes your ELO. A correct prediction gains you points; a wrong one loses some.
            The formula rewards <strong className="text-ink">contrarian accuracy</strong>: being right when odds were against you earns far more than picking the obvious favourite.
          </p>
          <p>Your starting ELO is 1000. It has no effect on your coins — it's a separate skill score.</p>
        </Section>

        <Section title="Ranks">
          <p className="mb-3">Your rank is determined by your ELO rating:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {rankRanges.map((r) => (
              <div key={r.rank} className="rounded-xl bg-field px-3 py-2 text-center">
                <RankBadge rank={r.rank} />
                <p className="mt-1.5 text-xs text-ink/45">{r.range}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Private bets &amp; friend groups">
          <p>Set a bet to <strong className="text-ink">Private</strong> and enter usernames to invite. Only invited users can see and join it.</p>
          <p>Create <strong className="text-ink">Friend Groups</strong> (under the Groups tab) to save a list of usernames. When creating a private bet, select a group to auto-fill all invites at once.</p>
          <p>In the Private feed, switch between group tabs to see bets from each group separately.</p>
        </Section>

        <Section title="Resolving bets">
          <p>Once the real outcome is known, any signed-in user can resolve the bet. Open the bet and use the Resolve section on the right.</p>
          <p>For sports bets you can also enter the actual score, which awards a bonus to anyone who predicted it exactly.</p>
        </Section>

        <div className="flex items-start gap-3 rounded-2xl border border-citrus/25 bg-citrus/6 p-5 text-sm leading-6">
          <CircleDollarSign size={20} className="mt-0.5 shrink-0 text-citrus" />
          <p>
            <strong className="text-citrus">Coins are completely fictional.</strong>{' '}
            No real money is involved. You get a starting balance on signup and a daily refill if your balance runs low.
          </p>
        </div>

      </div>
    </>
  );
}
