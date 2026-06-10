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
    { elo: 0, label: '0' },
    { elo: 250, label: '250' },
    { elo: 700, label: '700' },
    { elo: 1100, label: '1100' },
    { elo: 1450, label: '1450' },
    { elo: 1750, label: '1750' },
    { elo: 2000, label: '2000' },
    { elo: 2250, label: '2250+' },
  ];

  const minElo = 0;
  const maxElo = 2250;
  const totalRange = maxElo - minElo;
  const scaleHeight = 480; // Fixed scale height for precise calculations

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
          {/* Blurred backdrop */}
          <button
            className="fixed inset-0 z-40 backdrop-blur-sm"
            onClick={() => setShowPopup(false)}
            aria-label="Close"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-line bg-white p-8 shadow-lift animate-soft-enter">
              <h2 className="mb-8 text-lg font-black">Rank Ranges</h2>

              {/* Main flex container */}
              <div className="flex gap-4 items-stretch">
                {/* Left: User indicator */}
                {profile && (
                  <div className="relative" style={{ width: '100px' }}>
                    {/* Calculate user's position on scale */}
                    {(() => {
                      const userPosPercent = Math.max(0, Math.min(100, ((profile.rating - minElo) / totalRange) * 100));
                      const topOffset = (userPosPercent / 100) * scaleHeight;

                      return (
                        <div
                          className="absolute flex items-center gap-0.5 right-0"
                          style={{
                            top: `${topOffset}px`,
                            transform: 'translateY(-50%)',
                          }}
                        >
                          <span className="text-xs font-black text-ink/70 whitespace-nowrap">
                            {profile.rating}
                          </span>
                          <Avatar
                            name={profile.displayName}
                            src={profile.photoURL}
                            size="md"
                            round
                          />
                          <ChevronRight size={14} className="text-ink/50 shrink-0" />
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Center: Vertical scale */}
                <div className="relative flex flex-col" style={{ width: '12px', height: `${scaleHeight}px` }}>
                  {/* Colored segments */}
                  {rankRanges.map((rank, idx) => {
                    const colorMatch = rank.className.match(/#[0-9a-f]+/i);
                    const rankColor = colorMatch ? colorMatch[0] : '#121417';

                    const startElos = [0, 250, 700, 1100, 1450, 1750, 2000, 2250];
                    const endElos = [249, 699, 1099, 1449, 1749, 1999, 2249, 2250];

                    const rangeSize = endElos[idx] - startElos[idx] + 1;
                    const heightPercent = (rangeSize / totalRange) * 100;

                    return (
                      <div
                        key={rank.rank}
                        className="flex-grow rounded-full"
                        style={{
                          backgroundColor: rankColor,
                          height: `${heightPercent}%`,
                          minHeight: '2px',
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
                        className="absolute left-1/2 w-5 h-5 rounded-full border-2 border-white shadow-soft"
                        style={{
                          top: `${posPercent}%`,
                          transform: 'translate(-50%, -50%)',
                          backgroundColor: pointColor,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Right: Rank information - positioned to align with boundary points */}
                <div className="flex-1 relative" style={{ height: `${scaleHeight}px` }}>
                  {boundaries.map((b, idx) => {
                    const rank = rankRanges[idx];
                    const colorMatch = rank.className.match(/#[0-9a-f]+/i);
                    const rankColor = colorMatch ? colorMatch[0] : '#121417';

                    // Position at boundary point
                    const posPercent = ((b.elo - minElo) / totalRange) * 100;
                    const topOffset = (posPercent / 100) * scaleHeight;

                    return (
                      <div
                        key={rank.rank}
                        className="absolute"
                        style={{
                          top: `${topOffset}px`,
                          transform: 'translateY(-50%)',
                        }}
                      >
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
