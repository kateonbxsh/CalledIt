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
      {/* Scale line with rank names on top */}
      <div className="relative pt-8">
        {/* Rank names positioned absolutely above the line */}
        {rankRanges.map((r, idx) => {
          const colorMatch = r.className.match(/#[0-9a-f]+/i);
          const rankColor = colorMatch ? colorMatch[0] : '#121417';

          // Position based on range
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

        {/* Thin line */}
        <div className="h-0.5 bg-line rounded-full" />
      </div>

      {/* Range markers with values */}
      <div className="relative h-6">
        {ranges.map((r) => {
          const pos = ((r.elo - 300) / (maxElo - 300)) * 100;

          return (
            <div
              key={r.elo}
              className="absolute flex flex-col items-center"
              style={{
                left: `${pos}%`,
                transform: 'translateX(-50%)',
              }}
            >
              {/* Point/dot */}
              <div className="w-2 h-2 rounded-full bg-ink/30 mb-1" />
              {/* Value below */}
              <span className="text-xs text-ink/40">{r.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
