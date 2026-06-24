import { useCallback, useSyncExternalStore } from 'react';
import { getFootballLiveMatch, subscribeToFootballLive } from '../services/footballService';

export function useFootballLiveMatch(matchId?: number | null) {
  const subscribe = useCallback((listener: () => void) => (
    matchId ? subscribeToFootballLive(listener) : () => {}
  ), [matchId]);
  const getSnapshot = useCallback(() => getFootballLiveMatch(matchId), [matchId]);
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );
}
