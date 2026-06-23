const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(path.join(__dirname, '.env'));

const token = String(process.env.FOOTBALL_DATA_TOKEN || '').trim();
const port = Number(process.env.PORT || 8788);
const cacheMs = Math.max(60_000, Number(process.env.FIXTURE_CACHE_MS || 15 * 60_000));
const requestLimit = Math.max(10, Number(process.env.MAX_REQUESTS_PER_MINUTE || 60));
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const cache = new Map();
const requestBuckets = new Map();

function log(message, extra = {}) {
  const suffix = Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function nullableString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeTeam(team = {}) {
  return {
    id: Number(team.id || 0),
    name: String(team.name || team.shortName || 'Unknown team'),
    shortName: nullableString(team.shortName),
    tla: nullableString(team.tla),
    crest: nullableString(team.crest),
  };
}

function normalizeMatch(match) {
  return {
    provider: 'football-data.org',
    matchId: Number(match.id),
    kickoff: String(match.utcDate),
    status: String(match.status || 'SCHEDULED'),
    matchday: Number.isFinite(match.matchday) ? match.matchday : null,
    competitionId: Number(match.competition?.id || 0),
    competitionName: String(match.competition?.name || 'Football'),
    competitionCode: nullableString(match.competition?.code),
    competitionEmblem: nullableString(match.competition?.emblem),
    homeTeam: normalizeTeam(match.homeTeam),
    awayTeam: normalizeTeam(match.awayTeam),
  };
}

async function fetchUpcomingMatches(days) {
  const cacheKey = String(days);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < cacheMs) return cached;

  const now = new Date();
  const endpoint = new URL('https://api.football-data.org/v4/matches');
  endpoint.searchParams.set('dateFrom', dateKey(now));
  endpoint.searchParams.set('dateTo', dateKey(addDays(now, days)));

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'X-Auth-Token': token,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`football-data.org returned ${response.status}`);
    const payload = await response.json();
    const matches = (Array.isArray(payload.matches) ? payload.matches : [])
      .filter((match) => ['SCHEDULED', 'TIMED'].includes(match.status))
      .filter((match) => new Date(match.utcDate).getTime() > Date.now() - 5 * 60_000)
      .map(normalizeMatch)
      .filter((match) => match.matchId && match.homeTeam.id && match.awayTeam.id)
      .sort((left, right) => new Date(left.kickoff) - new Date(right.kickoff));
    const next = { matches, fetchedAt: Date.now(), stale: false };
    cache.set(cacheKey, next);
    log('Fixture cache refreshed', { days, matches: matches.length });
    return next;
  } catch (error) {
    if (cached) {
      log('Serving stale fixture cache', { error: error.message });
      return { ...cached, stale: true };
    }
    throw error;
  }
}

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

function withinRateLimit(request) {
  const key = clientIp(request);
  const now = Date.now();
  const current = requestBuckets.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    requestBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= requestLimit;
}

function corsOrigin(request) {
  const origin = String(request.headers.origin || '').replace(/\/$/, '');
  if (allowedOrigins.includes('*')) return '*';
  if (!origin) return allowedOrigins[0] || '*';
  return allowedOrigins.includes(origin) ? origin : '';
}

function sendJson(response, status, body, origin) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  });
  response.end(JSON.stringify(body));
}

if (!token) {
  console.error('FOOTBALL_DATA_TOKEN is required. Copy .env.example to .env and add the token.');
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  const origin = corsOrigin(request);
  if (!origin) return sendJson(response, 403, { error: 'Origin not allowed.' }, 'null');
  if (request.method === 'OPTIONS') return sendJson(response, 204, {}, origin);
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed.' }, origin);
  if (!withinRateLimit(request)) return sendJson(response, 429, { error: 'Too many requests.' }, origin);

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/health') return sendJson(response, 200, { ok: true }, origin);
  if (url.pathname !== '/api/football/matches') return sendJson(response, 404, { error: 'Not found.' }, origin);

  const days = Math.min(60, Math.max(1, Number(url.searchParams.get('days') || 30)));
  try {
    const result = await fetchUpcomingMatches(days);
    return sendJson(response, 200, {
      matches: result.matches,
      refreshedAt: new Date(result.fetchedAt).toISOString(),
      stale: result.stale,
    }, origin);
  } catch (error) {
    log('Fixture request failed', { error: error.message });
    return sendJson(response, 502, { error: 'Football fixtures are temporarily unavailable.' }, origin);
  }
});

server.listen(port, '127.0.0.1', () => {
  log('Football worker listening', { port, cacheMs });
});

