import { rankForRating, rankMeta, rankProgress } from '../utils/ranks';
import { CoinAmount } from './CoinAmount';

export function ELORating({ rating, coins }: { rating: number; coins?: number }) {
  const rank = rankForRating(rating);
  const meta = rankMeta(rank);
  const progress = rankProgress(rating);

  // Extract color from className (bg-[#COLOR])
  const colorMatch = meta.className.match(/#[0-9a-f]+/i);
  const rankColor = colorMatch ? colorMatch[0] : '#121417';

  return (
    <div className="flex flex-col gap-1.5 items-end">
      {/* Rank and ELO above the line */}
      <div className="w-full flex items-center justify-between gap-2 text-xs font-black">
        <span style={{ color: rankColor }}>
          {rank}
        </span>
        <span className="text-ink/70">
          {rating}
        </span>
      </div>

      {/* Scale line showing progress */}
      <div className="h-2 bg-field rounded-full overflow-hidden w-24 sm:w-40 lg:w-56">
        <div
          className="h-full transition-all duration-300 rounded-full"
          style={{
            width: `${progress.percent}%`,
            backgroundColor: rankColor,
          }}
        />
      </div>

      {/* Coin balance below, right-aligned, smaller */}
      {coins !== undefined && (
        <CoinAmount amount={coins} className="justify-end text-xs" />
      )}
    </div>
  );
}
