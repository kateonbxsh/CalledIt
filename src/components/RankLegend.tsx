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

  // ELO ranges for each rank
  const rankBoundaries = [
    { start: 300, end: 1249 },
    { start: 1250, end: 1499 },
    { start: 1500, end: 1749 },
    { start: 1750, end: 2049 },
    { start: 2050, end: 2399 },
    { start: 2400, end: 2799 },
    { start: 2800, end: 3200 },
  ];

  return (
    <div className="px-4 py-2 space-y-3">
      {/* Rank names row */}
      <div className="flex gap-0 h-4">
        {rankRanges.map((rank, idx) => {
          const colorMatch = rank.className.match(/#[0-9a-f]+/i);
          const rankColor = colorMatch ? colorMatch[0] : '#121417';
          const boundary = rankBoundaries[idx];
          const rangeSize = boundary.end - boundary.start + 1;
          const totalSize = 3200 - 300; // 2900
          const widthPercent = (rangeSize / totalSize) * 100;

          return (
            <div
              key={rank.rank}
              style={{ width: `${widthPercent}%` }}
              className="flex items-center justify-center px-0.5 min-w-0"
            >
              <span
                className="text-[10px] font-black whitespace-nowrap text-center truncate"
                style={{ color: rankColor }}
                title={rank.rank}
              >
                {rank.rank}
              </span>
            </div>
          );
        })}
      </div>

      {/* Colored segments bar with points */}
      <div className="relative flex gap-0 h-2 rounded-full overflow-hidden">
        {/* Colored segments */}
        {rankRanges.map((rank, idx) => {
          const colorMatch = rank.className.match(/#[0-9a-f]+/i);
          const rankColor = colorMatch ? colorMatch[0] : '#121417';
          const boundary = rankBoundaries[idx];
          const rangeSize = boundary.end - boundary.start + 1;
          const totalSize = 3200 - 300;
          const widthPercent = (rangeSize / totalSize) * 100;

          return (
            <div
              key={rank.rank}
              style={{
                width: `${widthPercent}%`,
                backgroundColor: rankColor,
              }}
            />
          );
        })}

        {/* Points overlay */}
        {ranges.map((r, idx) => {
          const eloFromStart = r.elo - 300;
          const totalSize = 3200 - 300;
          const posPercent = (eloFromStart / totalSize) * 100;
          const rankIndex = idx < 6 ? idx : 6;
          const colorMatch = rankRanges[rankIndex].className.match(/#[0-9a-f]+/i);
          const pointColor = colorMatch ? colorMatch[0] : '#121417';

          return (
            <div
              key={`point-${r.elo}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${posPercent}%` }}
            >
              {/* Point */}
              <div
                className="w-3 h-3 rounded-full shadow-soft"
                style={{ backgroundColor: pointColor }}
              />
            </div>
          );
        })}
      </div>

      {/* ELO values row below */}
      <div className="relative h-5">
        {ranges.map((r) => {
          const eloFromStart = r.elo - 300;
          const totalSize = 3200 - 300;
          const posPercent = (eloFromStart / totalSize) * 100;

          return (
            <div
              key={`label-${r.elo}`}
              className="absolute text-xs text-ink/40 whitespace-nowrap"
              style={{ left: `${posPercent}%`, transform: 'translateX(-50%)' }}
            >
              {r.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
