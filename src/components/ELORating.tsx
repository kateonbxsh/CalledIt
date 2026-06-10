import { rankForRating, rankMeta, rankProgress } from '../utils/ranks';

export function ELORating({ rating }: { rating: number }) {
  const rank = rankForRating(rating);
  const meta = rankMeta(rank);
  const progress = rankProgress(rating);

  // Extract color from className (bg-[#COLOR])
  const colorMatch = meta.className.match(/#[0-9a-f]+/i);
  const rankColor = colorMatch ? colorMatch[0] : '#121417';

  return (
    <div className="flex flex-col gap-1.5 items-end">
      {/* Rank name (colored, bold) */}
      <span className="text-xs font-black" style={{ color: rankColor }}>
        {rank}
      </span>

      {/* Scale line showing progress in current rank */}
      <div className="w-28 h-2 bg-field rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-300 rounded-full"
          style={{
            width: `${progress.percent}%`,
            backgroundColor: rankColor,
          }}
        />
      </div>

      {/* ELO number below line */}
      <span className="text-sm font-black text-ink/70">{rating}</span>
    </div>
  );
}
