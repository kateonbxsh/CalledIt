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
    <div className="flex flex-col gap-2 items-end">
      {/* Row with rank on left, ELO on right, and progress line */}
      <div className="w-full flex items-center gap-2">
        {/* Rank name on left */}
        <span className="text-xs font-black whitespace-nowrap shrink-0" style={{ color: rankColor }}>
          {rank}
        </span>

        {/* Scale line showing progress */}
        <div className="flex-1 h-2 bg-field rounded-full overflow-hidden min-w-12">
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${progress.percent}%`,
              backgroundColor: rankColor,
            }}
          />
        </div>

        {/* ELO number on right */}
        <span className="text-sm font-black text-ink/70 whitespace-nowrap shrink-0">
          {rating}
        </span>
      </div>

      {/* Coin balance below, right-aligned, smaller */}
      {coins !== undefined && (
        <CoinAmount amount={coins} className="justify-end text-xs" />
      )}
    </div>
  );
}
