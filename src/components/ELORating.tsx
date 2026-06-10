import { rankForRating, rankMeta, rankProgress } from '../utils/ranks';

export function ELORating({ rating }: { rating: number }) {
  const rank = rankForRating(rating);
  const meta = rankMeta(rank);
  const progress = rankProgress(rating);

  // Extract color from className (bg-[#COLOR])
  const colorMatch = meta.className.match(/#[0-9a-f]+/i);
  const rankColor = colorMatch ? colorMatch[0] : '#121417';

  return (
    <div className="flex flex-col items-end gap-1.5">
      {/* Rank name + ELO number */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-black" style={{ color: rankColor }}>
          {rank}
        </span>
        <span className="text-sm font-black text-ink/60">{rating}</span>
      </div>

      {/* Scale line showing progress in current rank */}
      <div className="w-24 h-1.5 bg-field rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-300 rounded-full"
          style={{
            width: `${progress.percent}%`,
            backgroundColor: rankColor,
          }}
        />
      </div>
    </div>
  );
}
