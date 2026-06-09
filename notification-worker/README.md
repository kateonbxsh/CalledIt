# Called It Notification Worker

Tiny VPS worker for closed-app web push notifications.

The web app writes documents to Firestore `notifications`. This worker polls unsent docs, sends FCM web pushes to enabled user tokens, then marks each notification as sent.

It also scans open bets and wager challenges for deadlines on a slower cadence, creates one deduped "deadline soon" notification inside the last 24 hours, and one "deadline passed" notification when they expire. Deadline scans only query items whose deadline is inside the configured lookahead window.

## Files

- `worker.js`: notification sender
- `package.json`: Node dependencies
- `.env.example`: config template

## VPS Setup

1. Copy this folder to the VPS, for example:
   `/opt/called-it-notifications`
2. Put a Firebase service account JSON on the VPS:
   `/opt/called-it-notifications/service-account.json`
3. Copy `.env.example` to `.env` and update paths if needed.
4. Install and start:

```bash
pnpm install --prod
pnpm pm2:start
pnpm exec pm2 save
```

## systemd Service

Example unit:

```ini
[Unit]
Description=Called It notification worker
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/called-it-notifications
EnvironmentFile=/opt/called-it-notifications/.env
ExecStart=/home/deployment/.nvm/versions/node/v20.17.0/bin/node /opt/called-it-notifications/worker.js
Restart=always
RestartSec=5
User=calledit

[Install]
WantedBy=multi-user.target
```

Keep the service account JSON out of git.

## Web Push Certificate

The frontend can use Firebase's default web push certificate. If you want a custom VAPID key later, create/copy it from:

Firebase Console -> Project settings -> Cloud Messaging -> Web Push certificates.

Then set `VITE_FIREBASE_VAPID_KEY` in the frontend environment and redeploy GitHub Pages.

## Firestore Read Budget

- `POLL_INTERVAL_MS` controls how often unsent notification docs are checked.
- `DEADLINE_SCAN_INTERVAL_MS` controls deadline reminder scans separately. Keep this much higher than `POLL_INTERVAL_MS`; 10 minutes is the default.
- `DEADLINE_LOOKAHEAD_MS` controls how far ahead deadline reminders are generated.
- `QUOTA_BACKOFF_MS` controls how long the worker pauses Firestore reads after a quota-exhausted response.
