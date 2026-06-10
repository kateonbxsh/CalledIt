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

  const SVG_WIDTH = 1000;
  const SVG_HEIGHT = 120;
  const LINE_Y = 60;
  const maxElo = 3200;

  // Calculate x position for any ELO value
  const getX = (elo: number) => ((elo - 300) / (maxElo - 300)) * SVG_WIDTH;

  return (
    <div className="space-y-4">
      <svg
        width="100%"
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full"
      >
        {/* Colored segments for each rank */}
        {rankRanges.map((rank, idx) => {
          const colorMatch = rank.className.match(/#[0-9a-f]+/i);
          const rankColor = colorMatch ? colorMatch[0] : '#121417';

          const startElos = [300, 1250, 1500, 1750, 2050, 2400, 2800];
          const endElos = [1249, 1499, 1749, 2049, 2399, 2799, 3200];

          const x1 = getX(startElos[idx]);
          const x2 = getX(endElos[idx]);

          return (
            <rect
              key={rank.rank}
              x={x1}
              y={LINE_Y - 2}
              width={x2 - x1}
              height={4}
              fill={rankColor}
              rx={2}
            />
          );
        })}

        {/* Rank names above the line */}
        {rankRanges.map((rank, idx) => {
          const colorMatch = rank.className.match(/#[0-9a-f]+/i);
          const rankColor = colorMatch ? colorMatch[0] : '#121417';

          const startElos = [300, 1250, 1500, 1750, 2050, 2400, 2800];
          const x = getX(startElos[idx]);

          return (
            <text
              key={`name-${rank.rank}`}
              x={x}
              y={LINE_Y - 15}
              textAnchor="middle"
              className="text-xs font-black"
              fill={rankColor}
              fontSize="12"
              fontWeight="900"
            >
              {rank.rank}
            </text>
          );
        })}

        {/* Points and values at boundaries */}
        {ranges.map((r) => {
          const x = getX(r.elo);

          return (
            <g key={`marker-${r.elo}`}>
              {/* Point on line */}
              <circle
                cx={x}
                cy={LINE_Y}
                r="3"
                fill="#121417"
                filter="drop-shadow(0 1px 2px rgba(0,0,0,0.1))"
              />
              {/* Value below */}
              <text
                x={x}
                y={LINE_Y + 20}
                textAnchor="middle"
                className="text-xs"
                fill="#121417"
                fillOpacity="0.6"
                fontSize="11"
              >
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
