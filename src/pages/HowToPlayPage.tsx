import { PageHeader } from '../components/PageHeader';
import { RankBadge } from '../components/RankBadge';
import { rankRanges } from '../utils/ranks';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-black">{title}</h2>
      <div className="space-y-2 rounded-2xl border border-line bg-white p-5 text-sm leading-6 text-ink/70">
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
            <strong className="text-ink">Called it</strong> is a prediction game played with fictional coins.
            No real money, ever. You and your friends predict sports results, personal challenges, world events,
            random bets, and anything else worth calling early.
          </p>
          <p>The goal is to make correct predictions, build coin momentum, and climb the ELO ranks.</p>
        </Section>

        <Section title="Creating a bet">
          <p>Anyone can create a bet. Pick a type, write the question, set a deadline, and choose who can see it.</p>
          <ul className="mt-1 space-y-1.5 list-none">
            {[
              ['Yes / No', 'Simple two-sided outcome.'],
              ['Sports Match', 'Pick home / away / draw. Optionally allow exact-score guesses for a bonus.'],
              ['Over / Under', 'Will a number be above or below a line you set?'],
              ['Before / After', 'Will something happen before or after a date?'],
              ['Multiple Choice', 'Three or more custom options.'],
              ['Closest Number', 'Everyone guesses a number; closest to the real answer wins.'],
              ['Closest Date', 'Same idea, but with dates.'],
              ['Open Choice', 'Players add their own answers while predicting.'],
            ].map(([label, desc]) => (
              <li key={label} className="flex gap-2">
                <span className="mt-0.5 shrink-0 font-black text-ink">-</span>
                <span><span className="font-bold text-ink">{label}:</span> {desc}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Predicting">
          <p>Open any bet, pick your outcome, and set your stake. The minimum stake is 10 coins.</p>
          <p>You can update an open prediction before the deadline. Changes cost a small coin fee, and repeated switches reduce the extra skill reward you can earn.</p>
          <p>For Closest Number and Closest Date bets, individual guesses are hidden from others until resolution.</p>
        </Section>

        <Section title="Payouts">
          <p>Winners get their active stake back, split the loser pool, and can earn a minted skill reward.</p>
          <p>Coins gained are no longer limited to the losing pool. If the losing pool is empty, correct predictors can still earn coins for being right.</p>
          <p>The skill reward is bigger for harder calls, earlier calls, higher conviction, and fewer prediction changes. Late crowd-chasing still works, but pays less.</p>
          <p>For Closest bets, the nearest guess wins. Ties are split proportionally by stake, with a small skill reward added.</p>
        </Section>

        <Section title="Displayed odds">
          <p>
            The percentage shown on each option is a weighted mix: 62% from user count, 23% from coins staked,
            and 15% from the rating signal of the predictors on that option.
          </p>
          <p>Odds update live as people join or change predictions.</p>
        </Section>

        <Section title="ELO rating">
          <p>
            Every resolved bet changes your ELO. Correct predictions gain points; wrong predictions lose points.
            The formula rewards contrarian accuracy, so being right when the odds were against you earns more.
          </p>
          <p>Timing matters too. Early conviction can earn more ELO, while changing predictions many times reduces the final swing.</p>
          <p>Your starting ELO is 1000. It has no effect on coins; it is a separate skill score.</p>
        </Section>

        <Section title="Feed tabs">
          <p>The Bets feed has tabs for All, Private, and each friend group. Group tabs show bets posted directly into that group.</p>
          <p>The Challenges page uses the same tab idea, so public completions and group-only dares live in the right place.</p>
        </Section>

        <Section title="Minigames">
          <p>The Minigames page contains forecast refills, chests, and the wheel.</p>
          <p><strong className="text-ink">Safe</strong> gives 60 coins immediately.</p>
          <p><strong className="text-ink">Random</strong> gives a random positive amount from 10 to 100 coins.</p>
          <p><strong className="text-ink">Chaos</strong> gives -20, +5, or +130 coins.</p>
          <p><strong className="text-ink">Spicy</strong> gives 20 coins immediately and arms a 120 coin bonus only if your next resolved prediction wins. If that next prediction loses, the bonus is voided.</p>
          <p><strong className="text-ink">Chests</strong> are one-time reward boxes you open from Minigames. They unlock from simple quests, challenge progress, and strong prediction moments.</p>
          <p>Opening a chest plays the chest reveal popup, gives the listed coin reward once, and marks that chest as claimed.</p>
          <p>Weekly challenges can also give bonus chest coins immediately after completion. That bonus is separate from the normal challenge reward and is shown with the same chest-style reveal.</p>
          <p>The wheel can be spun once per day in a popup. It has bonuses and maluses written on the wheel, so it can give coins or take some away.</p>
        </Section>

        <Section title="Challenges">
          <p>Each user gets ten deterministic weekly real-life challenges from the system. Open one in a popup, upload a proof photo, and choose where to post it to earn coins and bonus chest coins.</p>
          <p>When completing a system challenge, choose whether the proof post is public or posted into a friend group.</p>
          <p>You can also create a wager challenge publicly or in a group. You cannot complete your own dare. The deadline must be at least one week away.</p>
          <p>If someone else completes it with proof, they get your stake plus a bonus. If no one does it by the deadline, you can close the wager and receive your stake plus 50%.</p>
          <p>Examples: cook something, run a distance, clean a room, draw something, send gym proof, or finish a personal dare.</p>
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

        <Section title="Private bets">
          <p>Set a bet to Private and enter usernames to invite. Only invited users can see and join it.</p>
          <p>Create Friend Groups under the Groups tab to save a list of usernames. When a group changes, bets and challenges linked to that group refresh their invite list.</p>
        </Section>

        <Section title="Resolving bets">
          <p>Once the real outcome is known, any signed-in user can resolve the bet from the bet detail page.</p>
          <p>For sports bets, entering the actual score awards an extra bonus to anyone who predicted it exactly or came closest.</p>
        </Section>
      </div>
    </>
  );
}
