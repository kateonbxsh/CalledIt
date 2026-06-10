import { rankRanges } from '../utils/ranks';

export function RankLegend() {
  const ranges = [
    { elo: 300, label: '300' },
    { elo: 1250, label: '1250' },
    { elo: 1500, label: '1500' },
    { elo: 1750, label: '1750' },
    { elo: 2050, label: '2050' },
    { elo: 2400, label: '2400' },
    { elo: 2800, label: '2800+' },
  ];

  const maxElo = 3200;

  return (
    <div className="space-y-6">
      {/* Rank names positioned above the scale */}
      <div className="relative h-5">
        {rankRanges.map((r, idx) => {
          const colorMatch = r.className.match(/#[0-9a-f]+/i);
          const rankColor = colorMatch ? colorMatch[0] : '#121417';

          // Position based on range start
          const startElos = [300, 1250, 1500, 1750, 2050, 2400, 2800];
          const startPos = ((startElos[idx] - 300) / (maxElo - 300)) * 100;

          return (
            <div
              key={r.rank}
              className="absolute text-xs font-black whitespace-nowrap"
              style={{
                color: rankColor,
                left: `${startPos}%`,
                top: 0,
                transform: 'translateX(-50%)',
              }}
            >
              {r.rank}
            </div>
          );
        })}
      </div>

      {/* Colored scale bar with overlaid points and values */}
      <div className="relative">
        {/* Colored bar */}
        <div className="h-1 rounded-full overflow-hidden flex">
          {rankRanges.map((r, idx) => {
            const colorMatch = r.className.match(/#[0-9a-f]+/i);
            const rankColor = colorMatch ? colorMatch[0] : '#121417';

            // Calculate segment widths
            const widths = [949, 250, 250, 300, 350, 400, 400];
            const totalWidth = widths.slice(0, 6).reduce((a, b) => a + b, 0);
            const widthPercent = idx < 6 ? (widths[idx] / totalWidth) * 100 : 8;

            return (
              <div
                key={r.rank}
                style={{
                  backgroundColor: rankColor,
                  width: idx < 6 ? `${widthPercent}%` : '8%',
                }}
              />
            );
          })}
        </div>

        {/* Points and values overlaid on the line */}
        {ranges.map((r) => {
          const pos = ((r.elo - 300) / (maxElo - 300)) * 100;

          return (
            <div
              key={r.elo}
              className="absolute flex flex-col items-center"
              style={{
                left: `${pos}%`,
                transform: 'translateX(-50%)',
                top: '-0.25rem', // Vertically center on the line
              }}
            >
              {/* Value above */}
              <span className="text-xs text-ink/40 mb-1">{r.label}</span>
              {/* Point on line */}
              <div className="w-2 h-2 rounded-full bg-ink shadow-soft" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
