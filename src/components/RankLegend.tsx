import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Avatar } from './Avatar';
import { useAuth } from '../contexts/AuthContext';
import { rankRanges } from '../utils/ranks';

export function RankLegend() {
  const [showPopup, setShowPopup] = useState(false);
  const { profile } = useAuth();

  // ELO boundaries
  const boundaries = [
    { elo: 300, label: '300' },
    { elo: 1250, label: '1250' },
    { elo: 1500, label: '1500' },
    { elo: 1750, label: '1750' },
    { elo: 2050, label: '2050' },
    { elo: 2400, label: '2400' },
    { elo: 2800, label: '2800+' },
  ];

  const minElo = 300;
  const maxElo = 2800;
  const totalRange = maxElo - minElo;

  return (
    <>
      {/* Button */}
      <button
        onClick={() => setShowPopup(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-field transition"
      >
        View ranks
        <ChevronDown size={16} />
      </button>

      {/* Popup modal */}
      {showPopup && (
        <>
          <button
            className="fixed inset-0 z-40"
            onClick={() => setShowPopup(false)}
            aria-label="Close"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-lift animate-soft-enter">
              <h2 className="mb-6 text-lg font-black">Rank Ranges</h2>

              {/* Vertical scale with segments */}
              <div className="flex gap-6">
                {/* Left side: user avatar and scale bar */}
                <div className="relative" style={{ width: '60px' }}>
                  {/* User position indicator */}
                  {profile && (
                    <>
                      {/* Calculate user's position */}
                      {(() => {
                        const userPosPercent = Math.max(0, Math.min(100, ((profile.rating - minElo) / totalRange) * 100));
                        const topOffset = 20 + (userPosPercent / 100) * 300; // 20px padding + percentage of 300px scale

                        return (
                          <div
                            className="absolute flex items-center gap-1"
                            style={{
                              top: `${topOffset}px`,
                              transform: 'translateY(-50%)',
                              left: 0,
                            }}
                          >
                            <Avatar
                              name={profile.displayName}
                              src={profile.photoURL}
                              size="md"
                              round
                            />
                            <ChevronRight size={16} className="text-ink/60 shrink-0" />
                            <span className="text-xs font-black text-ink/70 whitespace-nowrap">
                              {profile.rating}
                            </span>
                          </div>
                        );
                      })()}
                    </>
                  )}

                  {/* Vertical scale bar */}
                  <div className="absolute right-0 top-5 rounded-full overflow-visible" style={{ width: '6px', height: '360px' }}>
                    {/* Scale bar container */}
                    <div className="relative rounded-full overflow-hidden" style={{ width: '6px', height: '100%' }}>
                    {/* Colored segments */}
                    {rankRanges.map((rank, idx) => {
                      const colorMatch = rank.className.match(/#[0-9a-f]+/i);
                      const rankColor = colorMatch ? colorMatch[0] : '#121417';

                      const startElos = [300, 1250, 1500, 1750, 2050, 2400, 2800];
                      const endElos = [1249, 1499, 1749, 2049, 2399, 2799, 2800];

                      const rangeSize = endElos[idx] - startElos[idx] + 1;
                      const heightPercent = (rangeSize / totalRange) * 100;

                      return (
                        <div
                          key={rank.rank}
                          style={{
                            backgroundColor: rankColor,
                            height: `${heightPercent}%`,
                          }}
                        />
                      );
                    })}

                      {/* Boundary points */}
                      {boundaries.map((b, idx) => {
                        const posPercent = ((b.elo - minElo) / totalRange) * 100;
                        const rankIndex = Math.min(idx, 6);
                        const colorMatch = rankRanges[rankIndex].className.match(/#[0-9a-f]+/i);
                        const pointColor = colorMatch ? colorMatch[0] : '#121417';

                        return (
                          <div
                            key={`point-${b.elo}`}
                            className="absolute left-1/2 w-4 h-4 rounded-full border-2 border-white shadow-soft"
                            style={{
                              top: `${posPercent}%`,
                              transform: 'translate(-50%, -50%)',
                              backgroundColor: pointColor,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Rank items */}
                <div className="space-y-6 flex-1">
                  {rankRanges.map((rank) => {
                    const colorMatch = rank.className.match(/#[0-9a-f]+/i);
                    const rankColor = colorMatch ? colorMatch[0] : '#121417';

                    return (
                      <div key={rank.rank}>
                        <h3 className="font-black text-sm" style={{ color: rankColor }}>
                          {rank.rank}
                        </h3>
                        <p className="text-xs text-ink/50 mt-0.5">
                          {rank.range}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={() => setShowPopup(false)}
                className="mt-8 w-full rounded-xl border border-line bg-field px-3 py-2 text-sm font-bold text-ink transition hover:bg-line active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
