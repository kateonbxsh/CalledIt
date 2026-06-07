# Called It

A private prediction and betting app for friend groups. Users make predictions on various outcomes using fictional coins, compete on accuracy through an ELO rating system, and resolve bets cooperatively.

**Features:**
- 🎲 **5 Bet Types**: Binary, Multiple Choice, Sports, Over/Under, Date-based
- 💰 **Fictional Coin Economy**: 1000 starting coins with daily refills
- 📈 **Skill Rating System**: ELO-like rating that rewards accurate, confident predictions
- 🏆 **Leaderboard**: Track top players by rating
- 🔒 **Public & Private Bets**: Share specific bets with invited friends
- 📊 **Chance Visualization**: See how odds evolve as predictions come in
- 🎯 **Sports Bonuses**: Extra rewards for exact score predictions
- 👥 **User Profiles**: Stats tracking (accuracy, wins/losses, coins won/lost)

## Quick Start

### Prerequisites
- Node.js 16+ and pnpm (or Bun)
- Firebase account (free tier works)

### Local Development

1. **Clone and install:**
   ```bash
   git clone https://github.com/yourusername/called-it.git
   cd called-it
   pnpm install
   ```

2. **Set up Firebase:**
   - Create a [Firebase project](https://console.firebase.google.com)
   - Enable **Authentication** (Email/Password + Google OAuth)
   - Enable **Firestore Database** (start in test mode for development)
   - Copy your web app config

3. **Create `.env.local`:**
   ```bash
   cp .env.example .env.local
   ```
   Then fill in your Firebase values:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_ADMIN_UIDS=optional_comma_separated_uids
   ```

4. **Run the dev server:**
   ```bash
   pnpm dev
   ```
   Visit `http://localhost:5173`

### Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## GitHub Pages Deployment

This app can be deployed to GitHub Pages with Firebase hosting the backend.

### Step 1: Prepare Repository

- Fork or create a repository on GitHub
- Set repository name to `called-it` (or configure custom domain)

### Step 2: Create GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - run: pnpm install
      
      - run: pnpm build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_ADMIN_UIDS: ${{ secrets.VITE_ADMIN_UIDS }}
      
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### Step 3: Add Repository Secrets

Go to **Settings → Secrets and variables → Actions** and add:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_ADMIN_UIDS` (optional)

### Step 4: Enable GitHub Pages

1. Go to **Settings → Pages**
2. Select `Deploy from a branch`
3. Branch: `gh-pages`, Folder: `/(root)`

Your app will be live at `https://yourusername.github.io/called-it` (or your custom domain) once the workflow completes.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Routing** | React Router v6 |
| **Styling** | Tailwind CSS + PostCSS |
| **Charts** | Recharts |
| **Backend** | Firebase (Auth + Firestore) |
| **Fonts** | @fontsource-variable |

## Architecture

### Pages
- **Feed** (`/`): Public bets
- **Private** (`/private`): Invite-only bets
- **Bet Detail** (`/bets/:betId`): View, predict, resolve
- **Create Bet** (`/create`): Multi-type bet creation
- **My Bets** (`/mine`): Your created bets
- **History** (`/history`): Your predictions
- **Leaderboard** (`/leaderboard`): Top 50 by rating
- **Profile** (`/profile/:uid`): User stats
- **Settings** (`/me`): Edit profile
- **How to Play** (`/how-to-play`): Rules

### Bet Types
1. **Binary**: Yes/No question
2. **Multi**: Multiple text options
3. **Sports**: Team 1 vs Team 2 (with optional draws and score predictions)
4. **Over/Under**: Numerical threshold
5. **Date**: Before/After a date

### Data Model

**Firestore Collections:**
```
users/{uid}
├── uid, email, username, displayName, photoURL
├── coinBalance, rating, rank
├── stats: { totalBets, wins, losses, accuracy, ... }
├── createdAt, updatedAt

bets/{betId}
├── title, description (optional), category
├── type, visibility, status
├── creatorId, creatorUsername
├── options: [{ id, label, teamSide? }]
├── deadline (optional), resolution
├── chanceSummary: [{ optionId, users, coins, chance }]
├── homeTeam?, awayTeam?, allowDraw?, allowExactScore?
├── createdAt, updatedAt

predictions/{betId_uid}
├── betId, userId, optionId, stake
├── displayedChanceAtBetTime (immutable snapshot)
├── status: 'pending' | 'won' | 'lost'
├── coinDelta, ratingDelta (set on resolution)
├── scorePrediction?: { home, away }
├── createdAt

chanceSnapshots/{snapshotId}
├── betId, summary, createdAt
```

## Key Features Explained

### Bet Creation
- **Required**: Title, bet type, at least 2 options
- **Optional**: Description, deadline, image, visibility
- For sports bets, use actual team names (not "Home/Away")
- Private bets require invited usernames

### Predictions
- **Minimum stake**: 10 coins
- **Maximum stake**: 250 coins or 25% of balance
- **Chance calculation**: 45% by user count, 55% by staked coins (with smoothing)
- **Coins at stake**: Deducted immediately, refunded as payout if you win

### Resolution
- **Who can resolve**: Bet creator or admins only
- **Payout model**: Winners split losing pool proportionally
- **Rating changes**: Based on bet confidence and outcome
  - Accurate confident predictions: +points
  - Inaccurate underconfident predictions: -points
  - Upsets (winning low-chance bets): big points
- **Sports bonuses**: 10-15% extra to exact/close score predictors

### Rating System
- **Starting rating**: 1000
- **Minimum**: 300 (soft floor)
- **Ranks**: Bronze → Silver → Gold → Platinum → Diamond → Master → Legend
- **Calculation**: ELO-inspired with stake and upset weighting
- **Protection**: Low-rating players get -50% loss penalty

## Customization

### Admin Setup
Add admin UIDs to `.env`:
```
VITE_ADMIN_UIDS=uid1,uid2,uid3
```

Admins can:
- Resolve any bet
- See all private bets
- Reopen resolved bets

### Styling
- Edit `tailwind.config.js` for colors and spacing
- Default colors: ink (text), mint (positive), coral (negative), sky, plum, aqua
- Modify `src/styles.css` for global styles

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Deploy Firestore rules
firebase deploy --only firestore
```

## Security Notes

- **Transactions**: All coin/rating changes use atomic Firestore transactions
- **Permissions**: Firestore rules enforce creator-only resolution (except admins)
- **Immutable predictions**: Can't change stake after placing prediction
- **Username uniqueness**: Reserved documents prevent duplicate usernames

## Troubleshooting

### Firebase Connection Issues
- Check `.env.local` has correct Firebase config
- Verify Firestore Database is enabled in Firebase Console
- Check Firestore rules allow public read access

### GitHub Pages Deployment Failed
- Check **Actions** tab for workflow errors
- Ensure all secrets are set in Settings → Secrets
- Verify `dist/` folder is generated in build

### Styling Issues
- Clear browser cache (Ctrl+Shift+Delete)
- Ensure Tailwind CSS is compiled: `pnpm build`
- Check for CSS import errors in browser DevTools

## Performance Tips

- Bet image uploads are auto-downscaled to save bandwidth
- Chance snapshots are limited to 80 most recent per bet
- Predictions use composite Firestore keys to prevent duplicates
- Uses React Query caching for user profiles

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `pnpm dev`
5. Build and test production with `pnpm build && pnpm preview`
6. Push and create a Pull Request

## License

This project is open source. Feel free to fork and customize for your friend group!
