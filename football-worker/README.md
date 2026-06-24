# Called It Football Worker

Small, separate VPS gateway for football-data.org. It keeps the API token off the GitHub Pages client, maintains its own warm seven-day fixture snapshot, multiplexes one live-score poll to every connected browser over SSE, and locks linked bets when the provider reports full time. Client fixture requests never trigger football-data.org requests.

Live polling is adaptive: every minute during/just before matches, every five minutes within three hours of kickoff, and every fifteen minutes while idle.
Provider calls are serialized and automatically back off using football-data.org's `X-Requests-Available-Minute`, legacy `X-RequestsAvailable`, `X-RequestCounter-Reset`, and `Retry-After` response headers. Existing fixture and live snapshots remain available if the provider throttles or is temporarily unavailable.
Competition standings are warmed separately every six hours and converted into conservative, editable starting estimates. The free account does not include football-data.org's bookmaker odds package, so these are form estimates rather than market odds.

## Setup

1. Create a free token at [football-data.org](https://www.football-data.org/client/register).
2. Copy this folder to `/opt/called-it-football` on the VPS.
3. Copy `.env.example` to `.env`, set `FOOTBALL_DATA_TOKEN` and `ALLOWED_ORIGINS`, and point `FIREBASE_SERVICE_ACCOUNT` at the existing read/write service account on the VPS.
4. Install and start:

```bash
pnpm install --prod
pnpm pm2:start
pnpm exec pm2 save
```

Put Nginx or Caddy in front of `127.0.0.1:8788` with HTTPS. The deployed PWA cannot call an unsecured HTTP endpoint.

Example Nginx location:

```nginx
location /api/football/ {
  proxy_pass http://127.0.0.1:8788;
  proxy_buffering off;
  proxy_cache off;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header Connection '';
}
```

The client defaults to `https://accounts.rivalium.online`. Set `VITE_FOOTBALL_API_URL` only when a different worker origin is needed, then redeploy the frontend.

On the current VPS, the included installer adds this route safely and keeps a timestamped backup:

```bash
sudo bash ~/called-it-football/install-nginx.sh
```

## Endpoints

- `GET /health` (internal VPS health check)
- `GET /api/football/matches?days=30`
- `GET /api/football/live`
- `GET /api/football/live/stream` (server-sent events)
- `GET /api/football/crest?url=...` (allowlisted, cached crest proxy for generated covers)

The football worker is a separate process and does not modify the existing notification worker. Its only Firestore write is to lock an open linked football bet and replace its estimated deadline with the provider's observed match-end timestamp.
