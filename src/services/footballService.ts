import type { FootballMatchLink } from '../types';

type FootballMatchesResponse = {
  matches?: FootballMatchLink[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedMatches: FootballMatchLink[] | null = null;
let cachedAt = 0;

function footballApiUrl() {
  return String(import.meta.env.VITE_FOOTBALL_API_URL ?? '').trim().replace(/\/$/, '');
}

export function footballAutocompleteConfigured() {
  return Boolean(footballApiUrl());
}

export async function listUpcomingFootballMatches(signal?: AbortSignal) {
  if (cachedMatches && Date.now() - cachedAt < CACHE_TTL_MS) return cachedMatches;
  const baseUrl = footballApiUrl();
  if (!baseUrl) throw new Error('Football autocomplete is not configured yet.');

  const response = await fetch(`${baseUrl}/api/football/matches?days=30`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || 'Could not load upcoming football matches.');
  }

  const payload = await response.json() as FootballMatchesResponse;
  cachedMatches = Array.isArray(payload.matches) ? payload.matches : [];
  cachedAt = Date.now();
  return cachedMatches;
}

