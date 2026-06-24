import type { FootballLiveMatch, FootballMatchLink } from '../types';

type FootballMatchesResponse = {
  matches?: FootballMatchLink[];
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const FIXTURE_STORAGE_KEY = 'called-it:football-fixtures:v2';
const DEFAULT_FOOTBALL_API_URL = 'https://accounts.rivalium.online';
let cachedMatches: FootballMatchLink[] | null = null;
let cachedAt = 0;
let matchesRequest: Promise<FootballMatchLink[]> | null = null;
let liveMatches = new Map<number, FootballLiveMatch>();
let liveSource: EventSource | null = null;
let liveCloseTimer: ReturnType<typeof setTimeout> | null = null;
const liveListeners = new Set<() => void>();

export function footballApiUrl() {
  const configuredUrl = String(import.meta.env.VITE_FOOTBALL_API_URL ?? '').trim();
  return (configuredUrl || DEFAULT_FOOTBALL_API_URL).replace(/\/$/, '');
}

export function footballCrestProxyUrl(crestUrl: string) {
  return `${footballApiUrl()}/api/football/crest?url=${encodeURIComponent(crestUrl)}`;
}

export function footballAutocompleteConfigured() {
  return Boolean(footballApiUrl());
}

export async function listUpcomingFootballMatches() {
  if (cachedMatches && Date.now() - cachedAt < CACHE_TTL_MS) return cachedMatches;
  if (!cachedMatches && typeof sessionStorage !== 'undefined') {
    try {
      const stored = JSON.parse(sessionStorage.getItem(FIXTURE_STORAGE_KEY) ?? 'null') as {
        matches?: FootballMatchLink[];
        cachedAt?: number;
      } | null;
      if (stored?.matches && stored.cachedAt && Date.now() - stored.cachedAt < CACHE_TTL_MS) {
        cachedMatches = stored.matches;
        cachedAt = stored.cachedAt;
        return cachedMatches;
      }
    } catch { /* ignore unavailable or invalid browser storage */ }
  }
  if (matchesRequest) return matchesRequest;
  const baseUrl = footballApiUrl();
  if (!baseUrl) throw new Error('Football autocomplete is not configured yet.');

  matchesRequest = fetch(`${baseUrl}/api/football/matches?days=7`, {
    headers: { Accept: 'application/json' },
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error || 'Could not load upcoming football matches.');
    }
    const payload = await response.json() as FootballMatchesResponse;
    cachedMatches = Array.isArray(payload.matches) ? payload.matches : [];
    cachedAt = Date.now();
    try {
      sessionStorage.setItem(FIXTURE_STORAGE_KEY, JSON.stringify({ matches: cachedMatches, cachedAt }));
    } catch { /* memory cache still works */ }
    return cachedMatches;
  }).finally(() => { matchesRequest = null; });
  return matchesRequest;
}

function publishLive(matches: FootballLiveMatch[]) {
  liveMatches = new Map(matches.map((match) => [match.matchId, match]));
  liveListeners.forEach((listener) => listener());
}

function parseLivePayload(raw: string) {
  const payload = JSON.parse(raw) as { matches?: FootballLiveMatch[] };
  if (Array.isArray(payload.matches)) publishLive(payload.matches);
}

function startLiveConnection() {
  const baseUrl = footballApiUrl();
  if (!baseUrl || liveSource || typeof EventSource === 'undefined') return;
  liveSource = new EventSource(`${baseUrl}/api/football/live/stream`);
  liveSource.addEventListener('snapshot', (event) => {
    try { parseLivePayload((event as MessageEvent<string>).data); } catch { /* reconnect keeps the last good snapshot */ }
  });
}

export function subscribeToFootballLive(listener: () => void) {
  if (liveCloseTimer) {
    clearTimeout(liveCloseTimer);
    liveCloseTimer = null;
  }
  liveListeners.add(listener);
  startLiveConnection();
  return () => {
    liveListeners.delete(listener);
    if (liveListeners.size === 0 && liveSource && !liveCloseTimer) {
      liveCloseTimer = setTimeout(() => {
        if (liveListeners.size === 0 && liveSource) {
          liveSource.close();
          liveSource = null;
        }
        liveCloseTimer = null;
      }, 30_000);
    }
  };
}

export function getFootballLiveMatch(matchId?: number | null) {
  return matchId ? liveMatches.get(matchId) ?? null : null;
}

export async function getFootballLiveMatchOnce(matchId?: number | null) {
  const cached = getFootballLiveMatch(matchId);
  if (cached || !matchId) return cached;
  const baseUrl = footballApiUrl();
  if (!baseUrl) return null;
  const response = await fetch(`${baseUrl}/api/football/live`, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  parseLivePayload(await response.text());
  return getFootballLiveMatch(matchId);
}

export function footballMatchIsFinished(match?: Pick<FootballMatchLink, 'status'> | null) {
  return match ? ['FINISHED', 'AWARDED', 'CANCELLED'].includes(match.status) : false;
}

export function footballMatchIsLive(match?: Pick<FootballMatchLink, 'status'> | null) {
  return match ? ['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(match.status) : false;
}
