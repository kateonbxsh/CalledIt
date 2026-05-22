# Called it

A private prediction app for friend groups. Coins are fictional. Rating/ELO tracks skill.

## Stack

- React + Vite + TypeScript
- Firebase Auth and Firestore
- Self-hosted Inter font via `@fontsource-variable/inter`
- Tailwind CSS
- Recharts for chance history
- pnpm and Bun compatible scripts

## Local Setup

1. Create a Firebase project and enable Email/Password plus Google authentication.
2. Copy `.env.example` to `.env.local` and fill in the Firebase web app values.
3. Install dependencies with `pnpm install` or `bun install`.
4. Run `pnpm dev` or `bun run dev`.

## Firebase

Deploy the rules and indexes with:

```bash
firebase deploy --only firestore
```

For GitHub Pages, set these repository secrets:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_ADMIN_UIDS`

## Data Model

- `users/{uid}`: profile, base64 avatar, coins, rating, rank, stats.
- `usernames/{username}`: unique username claim.
- `bets/{betId}`: bet metadata, options, visibility, status, summary chances.
- `predictions/{betId_uid}`: immutable prediction with stake and chance snapshot at placement.
- `chanceSnapshots/{snapshotId}`: option chance history for charts.
- `activity/{activityId}`: reserved for MVP activity/comments.
- `adminConfig/{uid}`: optional Firestore admin allowlist used by rules.

## Notes

The main transactional logic lives in `src/services/betService.ts`. Utility math for chances, coins, ratings, ranks, and sports bonuses lives in `src/utils`.
