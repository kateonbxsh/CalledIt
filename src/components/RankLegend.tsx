import { rankRanges } from '../utils/ranks';

export function RankLegend() {
  return (
    <div className="space-y-2">
      {rankRanges.map((r, idx) => {
        // Extract color from className (bg-[#COLOR])
        const colorMatch = r.className.match(/#[0-9a-f]+/i);
        const rankColor = colorMatch ? colorMatch[0] : '#121417';

        // Calculate position in scale (0-100%)
        const positions = [0, 14, 28, 42, 57, 71, 85];
        const position = positions[idx] || 0;

        return (
          <div key={r.rank} className="flex items-center gap-2.5">
            {/* Rank name colored */}
            <span className="text-xs font-black whitespace-nowrap w-16" style={{ color: rankColor }}>
              {r.rank}
            </span>

            {/* Range text */}
            <span className="text-xs text-ink/45 whitespace-nowrap w-24">
              {r.range.replace(' ELO', '')}
            </span>

            {/* Scale line with marker */}
            <div className="flex-1 h-2 bg-field rounded-full overflow-hidden relative min-w-32">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: '20%',
                  backgroundColor: rankColor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
