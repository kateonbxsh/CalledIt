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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-lift animate-soft-enter">
              <h2 className="mb-6 text-lg font-black">Rank Ranges</h2>

              {/* Vertical scale with ranks */}
              <div className="flex gap-6">
                {/* Vertical line */}
                <div className="relative w-1 min-h-96 bg-gradient-to-b from-[#8f5f3d] via-[#6aa6b8] to-[#121417] rounded-full" />

                {/* Rank items */}
                <div className="space-y-6">
                  {rankRanges.map((rank, idx) => {
                    const colorMatch = rank.className.match(/#[0-9a-f]+/i);
                    const rankColor = colorMatch ? colorMatch[0] : '#121417';

                    return (
                      <div key={rank.rank} className="flex items-start gap-3">
                        {/* Point */}
                        <div
                          className="w-3 h-3 rounded-full shadow-soft shrink-0 mt-1"
                          style={{ backgroundColor: rankColor }}
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
