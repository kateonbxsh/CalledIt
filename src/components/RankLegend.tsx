import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { rankRanges } from '../utils/ranks';

export function RankLegend() {
  const [showPopup, setShowPopup] = useState(false);

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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-96 max-w-[90vw] rounded-2xl border border-line bg-white p-6 shadow-lift animate-soft-enter max-h-[80vh] overflow-y-auto">
            <h2 className="mb-4 text-lg font-black">Rank Ranges</h2>

            {/* Vertical scale with ranks */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-12 top-0 bottom-0 w-1 bg-line rounded-full" />

              {/* Rank items */}
              <div className="space-y-4">
                {rankRanges.map((rank, idx) => {
                  const colorMatch = rank.className.match(/#[0-9a-f]+/i);
                  const rankColor = colorMatch ? colorMatch[0] : '#121417';

                  // Calculate position on vertical scale
                  const startElo = [300, 1250, 1500, 1750, 2050, 2400, 2800][idx];
                  const topPercent = ((startElo - 300) / 2500) * 100; // Scale from 300-2800

                  return (
                    <div key={rank.rank} className="relative flex items-start gap-4 pl-28">
                      {/* Point on line */}
                      <div
                        className="absolute left-9 w-4 h-4 rounded-full border-4 border-white shadow-soft"
                        style={{
                          backgroundColor: rankColor,
                          top: `${topPercent}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      />

                      {/* Rank info */}
                      <div>
                        <h3 className="font-black text-sm" style={{ color: rankColor }}>
                          {rank.rank}
                        </h3>
                        <p className="text-xs text-ink/50 mt-0.5">
                          {rank.range}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => setShowPopup(false)}
              className="mt-6 w-full rounded-xl border border-line bg-field px-3 py-2 text-sm font-bold text-ink transition hover:bg-line active:scale-95"
            >
              Close
            </button>
          </div>
        </>
      )}
    </>
  );
}
