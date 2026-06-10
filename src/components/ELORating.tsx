import { useState } from 'react';
import { rankForRating, rankMeta, rankProgress } from '../utils/ranks';

export function ELORating({ rating }: { rating: number }) {
  const [showPopup, setShowPopup] = useState(false);
  const rank = rankForRating(rating);
  const meta = rankMeta(rank);
  const progress = rankProgress(rating);

  // Extract color from className (bg-[#COLOR])
  const colorMatch = meta.className.match(/#[0-9a-f]+/i);
  const rankColor = colorMatch ? colorMatch[0] : '#121417';

  return (
    <>
      <button
        onClick={() => setShowPopup(true)}
        className="group flex flex-col items-end gap-1.5 transition active:scale-95"
        title="Click for ELO details"
      >
        {/* ELO text with rank color */}
        <span className="text-sm font-black" style={{ color: rankColor }}>
          {rating}
        </span>

        {/* Scale line showing progress in current rank */}
        <div className="w-20 h-1.5 bg-field rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${progress.percent}%`,
              backgroundColor: rankColor,
            }}
          />
        </div>
      </button>

      {/* Popup with details */}
      {showPopup && (
        <>
          <button
            className="fixed inset-0 z-40"
            onClick={() => setShowPopup(false)}
            aria-label="Close"
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 max-w-[90vw] rounded-2xl border border-line bg-white p-5 shadow-lift animate-soft-enter">
            {/* Rank name with color */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-black" style={{ color: rankColor }}>
                {rank}
              </h3>
              <p className="text-sm font-black text-ink/60">{rating} ELO</p>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-ink/50">{progress.currentRange}</span>
                {progress.nextRank && (
                  <span className="text-xs text-ink/50">Next: {progress.nextRank}</span>
                )}
              </div>
              <div className="w-full h-2 bg-field rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${progress.percent}%`,
                    backgroundColor: rankColor,
                  }}
                />
              </div>
              <p className="text-xs text-ink/40 mt-1.5">
                {Math.round(progress.percent)}% through {rank}
              </p>
            </div>

            {/* Rank description */}
            <p className="text-xs text-ink/60 leading-relaxed mb-4">
              You're ranked {rank} based on your prediction accuracy and betting performance.
            </p>

            {/* Close button */}
            <button
              onClick={() => setShowPopup(false)}
              className="w-full rounded-xl bg-field px-3 py-2 text-sm font-bold text-ink transition hover:bg-line active:scale-95"
            >
              Close
            </button>
          </div>
        </>
      )}
    </>
  );
}
