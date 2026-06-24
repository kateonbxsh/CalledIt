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
const fixtureCacheMs = Math.max(60_000, Number(process.env.FIXTURE_CACHE_MS || 15 * 60_000));
const fixtureDays = Math.min(7, Math.max(1, Number(process.env.FIXTURE_DAYS || 7)));
const livePollMs = Math.max(30_000, Number(process.env.LIVE_POLL_MS || 60_000));
const liveIdlePollMs = Math.max(livePollMs, Number(process.env.LIVE_IDLE_POLL_MS || 15 * 60_000));
const standingsCacheMs = Math.max(60 * 60_000, Number(process.env.STANDINGS_CACHE_MS || 6 * 60 * 60_000));
const reconcileMs = Math.max(60_000, Number(process.env.RECONCILE_INTERVAL_MS || 2 * 60_000));
const requestLimit = Math.max(10, Number(process.env.MAX_REQUESTS_PER_MINUTE || 60));
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const terminalStatuses = new Set(['FINISHED', 'AWARDED', 'CANCELLED']);
const liveStatuses = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT']);

const requestBuckets = new Map();
const liveClients = new Set();
const crestCache = new Map();
let fixtureSnapshot = { matches: [], fetchedAt: 0, stale: true };
let fixtureRequest = null;
let liveSnapshot = { matches: [], fetchedAt: 0, stale: true };
let liveRequest = null;
let liveTimer = null;
let standingsTimer = null;
let pendingCompetitionIds = [];
const standingsCache = new Map();
let providerQueue = Promise.resolve();
let providerRateLimit = {
  availableMinute: null,
  resetAt: 0,
  blockedUntil: 0,
};
let firestore = null;
let admin = null;
const terminalObservedAt = new Map();
const reconciledMatchIds = new Set();

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

function nullableNumber(value) {
  return Number.isFinite(value) ? Number(value) : null;
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

function estimatedMinute(match) {
  if (Number.isFinite(match.minute)) return Math.max(0, Number(match.minute));
  if (!liveStatuses.has(match.status)) return null;
  const elapsed = Math.floor((Date.now() - new Date(match.utcDate).getTime()) / 60_000);
  return Math.max(0, Math.min(120, elapsed - Math.max(0, elapsed - 45 >= 15 ? 15 : 0)));
}

function standingsEstimate(match) {
  const competition = standingsCache.get(Number(match.competitionId || match.competition?.id));
  if (!competition) return { estimatedChances: null, chanceSource: null };
  const home = competition.teams.get(Number(match.homeTeam?.id));
  const away = competition.teams.get(Number(match.awayTeam?.id));
  if (!home || !away) return { estimatedChances: null, chanceSource: null };

  const teamStrength = (row) => {
    const played = Math.max(0, Number(row.playedGames || 0));
    if (!played) return 0;
    const pointsRate = Math.max(0, Math.min(1, Number(row.points || 0) / (played * 3)));
    const winRate = Math.max(0, Math.min(1, Number(row.won || 0) / played));
    const goalSignal = Math.tanh((Number(row.goalDifference || 0) / played) / 2);
    const observed = 0.55 * ((pointsRate - 0.5) * 2) + 0.25 * goalSignal + 0.20 * ((winRate - 0.5) * 2);
    const confidence = Math.min(0.82, played / (played + 5));
    return observed * confidence;
  };

  const difference = teamStrength(home) - teamStrength(away);
  const draw = Math.max(0.18, Math.min(0.30, 0.27 - Math.abs(difference) * 0.09));
  const homeShare = 1 / (1 + Math.exp(-difference * 2.2));
  const decisive = 1 - draw;
  const homeChance = Math.max(0.10, Math.min(decisive - 0.10, decisive * homeShare));
  const awayChance = decisive - homeChance;
  const total = homeChance + draw + awayChance;
  return {
    estimatedChances: {
      home: homeChance / total,
      draw: draw / total,
      away: awayChance / total,
    },
    chanceSource: 'competition_standings',
  };
}

function normalizeMatch(match) {
  const kickoffMs = new Date(match.utcDate).getTime();
  const fullTime = match.score?.fullTime || {};
  const halfTime = match.score?.halfTime || {};
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
    ...standingsEstimate(match),
    minute: estimatedMinute(match),
    score: {
      home: nullableNumber(fullTime.home),
      away: nullableNumber(fullTime.away),
      halfTimeHome: nullableNumber(halfTime.home),
      halfTimeAway: nullableNumber(halfTime.away),
    },
    lastUpdated: nullableString(match.lastUpdated),
    endedAt: terminalObservedAt.get(Number(match.id)) || null,
    expectedEnd: new Date(kickoffMs + 4 * 60 * 60 * 1000).toISOString(),
  };
}

function numericHeader(response, ...names) {
  for (const name of names) {
    const value = response.headers.get(name);
    if (value !== null && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function retryAt(response, resetSeconds) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Date.now() + Math.max(1, seconds) * 1000;
    const date = new Date(retryAfter).getTime();
    if (Number.isFinite(date)) return date;
  }
  return resetSeconds !== null ? Date.now() + Math.max(1, resetSeconds) * 1000 : Date.now() + 60_000;
}

function updateProviderRateLimit(response) {
  const resetSeconds = numericHeader(response, 'x-requestcounter-reset');
  const availableMinute = numericHeader(
    response,
    'x-requests-available-minute',
    'x-requestsavailable',
  );
  providerRateLimit = {
    availableMinute,
    resetAt: resetSeconds === null ? providerRateLimit.resetAt : Date.now() + resetSeconds * 1000,
    blockedUntil: providerRateLimit.blockedUntil,
  };
  if (response.status === 429 || (availableMinute !== null && availableMinute <= 1)) {
    providerRateLimit.blockedUntil = retryAt(response, resetSeconds) + 1_000;
  } else if (providerRateLimit.blockedUntil <= Date.now()) {
    providerRateLimit.blockedUntil = 0;
  }
}

async function requestProviderJsonNow(endpoint) {
  if (providerRateLimit.blockedUntil > Date.now()) {
    const waitSeconds = Math.ceil((providerRateLimit.blockedUntil - Date.now()) / 1000);
    throw new Error(`football-data.org throttle active for ${waitSeconds}s`);
  }
  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json', 'X-Auth-Token': token },
    signal: AbortSignal.timeout(15_000),
  });
  updateProviderRateLimit(response);
  if (!response.ok) {
    const error = new Error(`football-data.org returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function requestProviderJson(endpoint) {
  const request = providerQueue.then(() => requestProviderJsonNow(endpoint));
  providerQueue = request.catch(() => undefined);
  return request;
}

async function requestMatches(dateFrom, dateTo) {
  const endpoint = new URL('https://api.football-data.org/v4/matches');
  endpoint.searchParams.set('dateFrom', dateFrom);
  endpoint.searchParams.set('dateTo', dateTo);
  const payload = await requestProviderJson(endpoint);
  return Array.isArray(payload.matches) ? payload.matches : [];
}

function queueStandingsRefresh(matches) {
  const queued = new Set(pendingCompetitionIds);
  matches.forEach((match) => {
    const competitionId = Number(match.competition?.id || 0);
    const cached = standingsCache.get(competitionId);
    if (!competitionId || queued.has(competitionId) || (cached && Date.now() - cached.fetchedAt < standingsCacheMs)) return;
    queued.add(competitionId);
    pendingCompetitionIds.push(competitionId);
  });
  scheduleStandingsRefresh(2_000);
}

function scheduleStandingsRefresh(delay = 15_000) {
  if (standingsTimer || pendingCompetitionIds.length === 0) return;
  const providerWait = Math.max(0, providerRateLimit.blockedUntil - Date.now());
  standingsTimer = setTimeout(refreshNextStandings, Math.max(delay, providerWait));
}

async function refreshNextStandings() {
  standingsTimer = null;
  const competitionId = pendingCompetitionIds.shift();
  if (!competitionId) return;
  try {
    const endpoint = new URL(`https://api.football-data.org/v4/competitions/${competitionId}/standings`);
    const payload = await requestProviderJson(endpoint);
    const teams = new Map();
    (Array.isArray(payload.standings) ? payload.standings : [])
      .filter((standing) => standing.type === 'TOTAL')
      .forEach((standing) => {
        (Array.isArray(standing.table) ? standing.table : []).forEach((row) => {
          if (row.team?.id && !teams.has(Number(row.team.id))) teams.set(Number(row.team.id), row);
        });
      });
    standingsCache.set(competitionId, { teams, fetchedAt: Date.now() });
    fixtureSnapshot = {
      ...fixtureSnapshot,
      matches: fixtureSnapshot.matches.map((match) => ({ ...match, ...standingsEstimate(match) })),
    };
    log('Standings estimate refreshed', { competitionId, teams: teams.size });
  } catch (error) {
    if ([400, 403, 404].includes(error.status)) {
      standingsCache.set(competitionId, { teams: new Map(), fetchedAt: Date.now() });
    } else {
      pendingCompetitionIds.push(competitionId);
    }
    log('Standings estimate refresh failed', { competitionId, error: error.message });
  }
  scheduleStandingsRefresh();
}

async function refreshFixtureSnapshot() {
  if (fixtureRequest) return fixtureRequest;
  const now = new Date();
  fixtureRequest = (async () => {
    try {
      const raw = await requestMatches(dateKey(now), dateKey(addDays(now, fixtureDays)));
      const matches = raw
        .filter((match) => ['SCHEDULED', 'TIMED'].includes(match.status))
        .filter((match) => new Date(match.utcDate).getTime() > Date.now() - 5 * 60_000)
        .map(normalizeMatch)
        .filter((match) => match.matchId && match.homeTeam.id && match.awayTeam.id)
        .sort((left, right) => new Date(left.kickoff) - new Date(right.kickoff));
      fixtureSnapshot = { matches, fetchedAt: Date.now(), stale: false };
      queueStandingsRefresh(raw);
      log('Fixture snapshot refreshed', { days: fixtureDays, matches: matches.length });
    } catch (error) {
      fixtureSnapshot = { ...fixtureSnapshot, stale: true };
      log('Fixture snapshot refresh failed', { error: error.message });
    } finally {
      fixtureRequest = null;
    }
    return fixtureSnapshot;
  })();
  return fixtureRequest;
}

function relevantLiveMatch(match) {
  const kickoffMs = new Date(match.utcDate).getTime();
  const age = Date.now() - kickoffMs;
  return liveStatuses.has(match.status)
    || (terminalStatuses.has(match.status) && age < 48 * 60 * 60 * 1000)
    || (['SCHEDULED', 'TIMED'].includes(match.status) && age > -6 * 60 * 60 * 1000 && age < 10 * 60_000);
}

async function refreshLiveSnapshot() {
  if (liveRequest) return liveRequest;
  liveRequest = (async () => {
    const now = new Date();
    try {
      const raw = await requestMatches(dateKey(addDays(now, -1)), dateKey(addDays(now, 1)));
      raw.forEach((match) => {
        if (terminalStatuses.has(match.status) && !terminalObservedAt.has(Number(match.id))) {
          terminalObservedAt.set(Number(match.id), new Date().toISOString());
        }
      });
      liveSnapshot = {
        matches: raw.filter(relevantLiveMatch).map(normalizeMatch),
        fetchedAt: Date.now(),
        stale: false,
      };
      broadcastLive();
      return liveSnapshot;
    } catch (error) {
      liveSnapshot = { ...liveSnapshot, stale: true };
      log('Live score refresh failed', { error: error.message });
      return liveSnapshot;
    } finally {
      liveRequest = null;
    }
  })();
  return liveRequest;
}

function livePayload() {
  return {
    matches: liveSnapshot.matches,
    refreshedAt: liveSnapshot.fetchedAt ? new Date(liveSnapshot.fetchedAt).toISOString() : null,
    stale: liveSnapshot.stale,
  };
}

function writeEvent(response, event, payload) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcastLive() {
  const payload = livePayload();
  liveClients.forEach((response) => writeEvent(response, 'snapshot', payload));
}

function nextLivePollDelay() {
  let delay;
  if (liveSnapshot.matches.some((match) => liveStatuses.has(match.status))) delay = livePollMs;
  const now = Date.now();
  if (!delay) {
    const nearestKickoff = fixtureSnapshot.matches.reduce((nearest, match) => {
      const kickoff = new Date(match.kickoff).getTime();
      return kickoff >= now - 4 * 60 * 60 * 1000 && kickoff < nearest ? kickoff : nearest;
    }, Number.POSITIVE_INFINITY);
    const untilKickoff = nearestKickoff - now;
    if (untilKickoff <= 30 * 60_000) delay = livePollMs;
    else if (untilKickoff <= 3 * 60 * 60_000) delay = Math.min(liveIdlePollMs, 5 * 60_000);
    else delay = liveIdlePollMs;
  }
  const providerWait = Math.max(0, providerRateLimit.blockedUntil - now);
  return Math.max(delay, providerWait);
}

async function pollLiveAndSchedule() {
  await refreshLiveSnapshot();
  await reconcileFinishedBets();
  liveTimer = setTimeout(pollLiveAndSchedule, nextLivePollDelay());
}

function initFirestore() {
  const serviceAccountPath = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!serviceAccountPath) {
    log('Firebase reconciliation disabled');
    return;
  }
  try {
    admin = require('firebase-admin');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firestore = admin.firestore();
    log('Firebase reconciliation enabled');
  } catch (error) {
    log('Firebase reconciliation could not start', { error: error.message });
  }
}

async function reconcileFinishedBets() {
  if (!firestore || !liveSnapshot.matches.length) return;
  const finished = new Map(
    liveSnapshot.matches
      .filter((match) => terminalStatuses.has(match.status) && !reconciledMatchIds.has(match.matchId))
      .map((match) => [match.matchId, match]),
  );
  if (!finished.size) return;
  try {
    const snapshot = await firestore.collection('bets').where('status', '==', 'open').limit(500).get();
    const batch = firestore.batch();
    let changed = 0;
    snapshot.docs.forEach((betDoc) => {
      const match = finished.get(Number(betDoc.data().footballMatch?.matchId));
      if (!match) return;
      const endedAt = match.endedAt ? new Date(match.endedAt) : new Date();
      batch.update(betDoc.ref, {
        status: 'locked',
        deadline: admin.firestore.Timestamp.fromDate(endedAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      changed += 1;
    });
    if (changed) {
      await batch.commit();
      log('Finished football bets locked', { changed });
    }
    finished.forEach((match) => reconciledMatchIds.add(match.matchId));
  } catch (error) {
    log('Football bet reconciliation failed', { error: error.message });
  }
}

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
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

// Production frontends are always allowed, even if ALLOWED_ORIGINS is misconfigured
// on the host — this is what was returning 403 on https://calledit.qzz.io.
const ALWAYS_ALLOWED_ORIGINS = [
  'https://calledit.qzz.io',
  'https://kateonbxsh.github.io',
];

function originAllowed(origin) {
  if (ALWAYS_ALLOWED_ORIGINS.includes(origin)) return true;
  // Any localhost / 127.0.0.1 port for local dev.
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  return allowedOrigins.some((allowed) => {
    if (allowed === origin) return true;
    // Support "*.domain.tld" wildcard entries in ALLOWED_ORIGINS.
    if (allowed.startsWith('*.')) {
      try { return new URL(origin).hostname.endsWith(allowed.slice(1)); } catch { return false; }
    }
    return false;
  });
}

function corsOrigin(request) {
  const origin = String(request.headers.origin || '').replace(/\/$/, '');
  if (allowedOrigins.includes('*')) return '*';
  if (!origin) return allowedOrigins[0] || ALWAYS_ALLOWED_ORIGINS[0];
  return originAllowed(origin) ? origin : '';
}

function sendJson(response, status, body, origin, cacheControl = 'no-store') {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': cacheControl,
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  });
  response.end(status === 204 ? undefined : JSON.stringify(body));
}

async function serveCrest(url, response, origin) {
  let crestUrl;
  try {
    crestUrl = new URL(url);
  } catch {
    return sendJson(response, 400, { error: 'Invalid crest URL.' }, origin);
  }
  if (crestUrl.protocol !== 'https:' || crestUrl.hostname !== 'crests.football-data.org') {
    return sendJson(response, 400, { error: 'Unsupported crest host.' }, origin);
  }
  try {
    let cached = crestCache.get(crestUrl.href);
    if (!cached) {
      const upstream = await fetch(crestUrl, { signal: AbortSignal.timeout(10_000) });
      if (!upstream.ok) throw new Error(`Crest returned ${upstream.status}`);
      const contentType = upstream.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) throw new Error('Crest response was not an image');
      const body = Buffer.from(await upstream.arrayBuffer());
      if (body.length > 2 * 1024 * 1024) throw new Error('Crest image is too large');
      cached = { body, contentType };
      if (crestCache.size >= 150) crestCache.delete(crestCache.keys().next().value);
      crestCache.set(crestUrl.href, cached);
    }
    response.writeHead(200, {
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Length': cached.body.length,
      'Content-Type': cached.contentType,
      Vary: 'Origin',
    });
    response.end(cached.body);
  } catch (error) {
    log('Crest proxy failed', { error: error.message });
    return sendJson(response, 502, { error: 'Team crest is temporarily unavailable.' }, origin);
  }
}

if (!token) {
  console.error('FOOTBALL_DATA_TOKEN is required.');
  process.exit(1);
}

initFirestore();
const fixtureTimer = setInterval(refreshFixtureSnapshot, fixtureCacheMs);
const reconcileTimer = setInterval(reconcileFinishedBets, reconcileMs);
const heartbeatTimer = setInterval(() => liveClients.forEach((response) => response.write(': heartbeat\n\n')), 25_000);
refreshFixtureSnapshot().finally(pollLiveAndSchedule);

const server = http.createServer(async (request, response) => {
  const origin = corsOrigin(request);
  if (!origin) return sendJson(response, 403, { error: 'Origin not allowed.' }, 'null');
  if (request.method === 'OPTIONS') return sendJson(response, 204, {}, origin);
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed.' }, origin);
  if (!withinRateLimit(request)) return sendJson(response, 429, { error: 'Too many requests.' }, origin);

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/health') {
    return sendJson(response, 200, {
      ok: true,
      liveSubscribers: liveClients.size,
      fixtureCount: fixtureSnapshot.matches.length,
      fixturesRefreshedAt: fixtureSnapshot.fetchedAt ? new Date(fixtureSnapshot.fetchedAt).toISOString() : null,
      liveRefreshedAt: liveSnapshot.fetchedAt ? new Date(liveSnapshot.fetchedAt).toISOString() : null,
      nextLivePollInMs: nextLivePollDelay(),
      standingsCached: standingsCache.size,
      providerRateLimit: {
        availableMinute: providerRateLimit.availableMinute,
        resetAt: providerRateLimit.resetAt ? new Date(providerRateLimit.resetAt).toISOString() : null,
        blockedUntil: providerRateLimit.blockedUntil ? new Date(providerRateLimit.blockedUntil).toISOString() : null,
      },
      firebaseReconciliation: Boolean(firestore),
    }, origin);
  }
  if (url.pathname === '/api/football/crest') {
    return serveCrest(url.searchParams.get('url') || '', response, origin);
  }
  if (url.pathname === '/api/football/live') {
    if (!liveSnapshot.fetchedAt) await refreshLiveSnapshot();
    return sendJson(response, 200, livePayload(), origin);
  }
  if (url.pathname === '/api/football/live/stream') {
    response.writeHead(200, {
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
      Vary: 'Origin',
    });
    response.write(': connected\n\n');
    liveClients.add(response);
    writeEvent(response, 'snapshot', livePayload());
    request.on('close', () => liveClients.delete(response));
    return;
  }
  if (url.pathname !== '/api/football/matches') return sendJson(response, 404, { error: 'Not found.' }, origin);

  const days = Math.min(60, Math.max(1, Number(url.searchParams.get('days') || 30)));
  if (!fixtureSnapshot.fetchedAt) {
    return sendJson(response, 503, { error: 'Football fixtures are warming up.' }, origin);
  }
  const cutoff = Date.now() + days * 24 * 60 * 60 * 1000;
  return sendJson(response, 200, {
    matches: fixtureSnapshot.matches.filter((match) => new Date(match.kickoff).getTime() <= cutoff),
    refreshedAt: new Date(fixtureSnapshot.fetchedAt).toISOString(),
    stale: fixtureSnapshot.stale,
  }, origin, 'public, max-age=300, stale-while-revalidate=900');
});

server.listen(port, '127.0.0.1', () => log('Football worker listening', {
  port, livePollMs, liveIdlePollMs, fixtureCacheMs, fixtureDays,
}));

function shutdown() {
  clearInterval(fixtureTimer);
  if (liveTimer) clearTimeout(liveTimer);
  if (standingsTimer) clearTimeout(standingsTimer);
  clearInterval(reconcileTimer);
  clearInterval(heartbeatTimer);
  liveClients.forEach((response) => response.end());
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
