# Called It Football Worker

Small, separate VPS gateway for football-data.org. It keeps the API token off the GitHub Pages client, caches fixture responses for 15 minutes, and exposes only the normalized fields needed by bet creation.

## Setup

1. Create a free token at [football-data.org](https://www.football-data.org/client/register).
2. Copy this folder to `/opt/called-it-football` on the VPS.
3. Copy `.env.example` to `.env` and set `FOOTBALL_DATA_TOKEN` and `ALLOWED_ORIGINS`.
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
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Set `VITE_FOOTBALL_API_URL` to that HTTPS origin in the frontend build. For GitHub Pages, add it as the `VITE_FOOTBALL_API_URL` repository secret and redeploy.

## Endpoints

- `GET /health`
- `GET /api/football/matches?days=30`

The endpoint is intentionally read-only. It does not use Firebase and does not modify the existing notification worker.

