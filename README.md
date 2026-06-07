# Called It

A private prediction betting app for friend groups. Make predictions on any outcome, stake fictional coins, and climb the leaderboard through an ELO-inspired skill rating system.

## Features

- **5 bet types** — Binary (Yes/No), Multiple Choice, Sports Match, Over/Under, Date
- **Fictional coin economy** — Start with 1,000 coins; daily refill if balance drops below 50
- **ELO skill rating** — Rewarded for confident, accurate predictions; penalised for overconfident wrong ones
- **7 ranks** — Bronze → Silver → Gold → Platinum → Diamond → Master → Legend
- **Sports score bonuses** — Extra rating and coins for predicting the exact final score
- **Public & private bets** — Private bets are invite-only by username
- **Real-time odds** — Live chance percentages that update as bets come in
- **Cooperative resolution** — Any participant can resolve a bet once the outcome is known

## Tech Stack

- **Frontend** — React 18 + TypeScript + Vite + Tailwind CSS
- **Backend** — Firebase Auth + Firestore + Storage
- **Hosting** — GitHub Pages (frontend) + Firebase (backend)

---

## Local Development

### 1. Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- A [Firebase](https://firebase.google.com/) project with **Authentication**, **Firestore**, and **Storage** enabled

### 2. Clone and install

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
pnpm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.development.local
```

Open `.env.development.local` and fill in your Firebase project values (found in the Firebase console under **Project Settings → Your apps → SDK setup and configuration**):

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Optional: comma-separated Firebase UIDs that get admin privileges
VITE_ADMIN_UIDS=
```

### 4. Set up Firebase

In the Firebase console, enable:

- **Authentication → Sign-in methods** → Email/Password and/or Google
- **Firestore Database** → Create database (production mode)
- **Storage** → Set up default bucket

Then deploy the security rules and indexes:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # select your project
firebase deploy --only firestore:rules,firestore:indexes
```

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Deployment to GitHub Pages

The repository ships with a ready-to-use GitHub Actions workflow at `.github/workflows/pages.yml` that builds and deploys automatically on every push to `main`.

### Step 1 — Enable GitHub Pages

1. Open your repository on GitHub
2. Go to **Settings → Pages**
3. Under **Source**, select **GitHub Actions**

### Step 2 — Add repository secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add each of the following:

| Secret | Where to find the value |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase console → Project Settings → SDK config |
| `VITE_FIREBASE_AUTH_DOMAIN` | same |
| `VITE_FIREBASE_PROJECT_ID` | same |
| `VITE_FIREBASE_STORAGE_BUCKET` | same |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | same |
| `VITE_FIREBASE_APP_ID` | same |
| `VITE_ADMIN_UIDS` | comma-separated Firebase UIDs (can be left empty) |

### Step 3 — Add your GitHub Pages domain to Firebase Auth

Firebase Authentication blocks sign-in from unknown domains.

1. Firebase console → **Authentication → Settings → Authorised domains**
2. Click **Add domain** and enter your Pages URL: `<your-username>.github.io`

### Step 4 — Push and deploy

```bash
git add .
git commit -m "initial deploy"
git push origin main
```

The workflow triggers automatically. Monitor progress under the **Actions** tab. Once complete, the app is live at:

```
https://<your-username>.github.io/<your-repo>/
```

You can also trigger a deploy manually: **Actions → Deploy GitHub Pages → Run workflow**.

---

## Admin Privileges

Users whose Firebase UID is listed in `VITE_ADMIN_UIDS` get extra capabilities:

- Resolve any bet
- View all private bets
- Reopen resolved bets

To find a user's UID: Firebase console → **Authentication → Users** → copy from the table.

---

## Project Structure

```
src/
  components/     Shared UI (BetCard, ChanceChart, RankBadge, …)
  contexts/       AuthContext — global auth state
  lib/            Firebase initialisation
  pages/          Route-level page components
  services/       Firestore operations (betService, userService)
  utils/          Pure helpers (coins, rating, probability, ranks, sportsBonus)
firestore.rules           Firestore security rules
firestore.indexes.json    Composite indexes for queries
.github/workflows/pages.yml   GitHub Actions CI/CD
```

## Available Scripts

```bash
pnpm dev        # Start development server
pnpm build      # Production build (output → dist/)
pnpm preview    # Preview production build locally
pnpm lint       # Run ESLint
```

---

## Troubleshooting

**Build fails in GitHub Actions**
- Check that all six Firebase secrets are present under **Settings → Secrets**
- Ensure the `VITE_FIREBASE_STORAGE_BUCKET` secret is set (commonly missed)

**Sign-in fails on the deployed site**
- Add `<your-username>.github.io` to **Firebase → Authentication → Authorised domains**

**Firestore permission denied errors**
- Deploy the security rules: `firebase deploy --only firestore:rules`
- Make sure you're signed in to the app (all reads require authentication)
