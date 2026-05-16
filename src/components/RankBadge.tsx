import type { Rank } from '../types';
import { rankMeta } from '../utils/ranks';

export function RankBadge({ rank }: { rank: Rank }) {
  const meta = rankMeta(rank);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${meta.className}`}>
      {rank}
    </span>
  );
}
