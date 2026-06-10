import { rankRanges } from '../utils/ranks';

export function RankLegend() {
  // Calculate segment widths based on ELO ranges
  // Bronze: 300-1249 (949)
  // Silver: 1250-1499 (250)
  // Gold: 1500-1749 (250)
  // Platinum: 1750-2049 (300)
  // Diamond: 2050-2399 (350)
  // Master: 2400-2799 (400)
  // Legend: 2800+ (infinite, use fixed)

  const totalWidth = 949 + 250 + 250 + 300 + 350 + 400;
  const segments = [
    { width: 949, range: 949 },
    { width: 250, range: 250 },
    { width: 250, range: 250 },
    { width: 300, range: 300 },
    { width: 350, range: 350 },
    { width: 400, range: 400 },
  ];

  return (
    <div className="space-y-3">
      {/* Horizontal scale bar */}
      <div className="flex gap-0 h-8 rounded-lg overflow-hidden border border-line shadow-soft">
        {rankRanges.map((r, idx) => {
          const colorMatch = r.className.match(/#[0-9a-f]+/i);
          const rankColor = colorMatch ? colorMatch[0] : '#121417';
          const widthPercent = idx < 6 ? (segments[idx].width / totalWidth) * 100 : 8;

          return (
            <div
              key={r.rank}
              className="relative group"
              style={{
                backgroundColor: rankColor,
                width: `${widthPercent}%`,
                opacity: 0.8,
              }}
              title={`${r.rank}: ${r.range}`}
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-ink text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                {r.rank}
              </div>
            </div>
          );
        })}
        {/* Infinity indicator */}
        <div className="text-ink/30 text-xs flex items-center px-1">•••</div>
      </div>

      {/* Legend labels */}
      <div className="flex justify-between text-xs text-ink/50 px-1">
        <span>300 ELO</span>
        <span>~1600 ELO</span>
        <span>2800+ ELO</span>
      </div>
    </div>
  );
}
