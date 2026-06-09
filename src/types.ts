import type { Timestamp } from 'firebase/firestore';

export type BetType =
  | 'binary'
  | 'multi'
  | 'sports'
  | 'overUnder'
  | 'date'
  | 'closestNumber'
  | 'closestDate'
  | 'openChoice';
export type BetVisibility = 'public' | 'private';
export type BetStatus = 'open' | 'locked' | 'resolved';
export type Rank =
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Master'
  | 'Legend';

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  coinBalance: number;
  rating: number;
  rank: Rank;
  stats: UserStats;
  isAdmin?: boolean;
  lastRefillAt?: Timestamp | null;
  lastDailyForecastAt?: Timestamp | null;
  pendingSpicyForecast?: {
    bonus: number;
    claimedAt: Timestamp;
  } | null;
  lastWheelSpinAt?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserStats {
  totalBets: number;
  wins: number;
  losses: number;
  accuracy: number;
  bestUpsetWin: number;
  coinsWon: number;
  coinsLost: number;
  chestsOpened?: number;
  challengesCompleted?: number;
}

export interface BetOption {
  id: string;
  label: string;
  teamSide?: 'home' | 'away' | 'draw';
  createdBy?: string;
}

export interface ChanceOptionSummary {
  optionId: string;
  users: number;
  coins: number;
  chance: number;
}

export interface Bet {
  id: string;
  type: BetType;
  title: string;
  description?: string;
  category: string;
  creatorId: string;
  creatorUsername: string;
  visibility: BetVisibility;
  invitedUsernames: string[];
  options: BetOption[];
  allowDraw?: boolean;
  allowExactScore?: boolean;
  homeTeam?: string;
  awayTeam?: string;
  imageUrl?: string;
  deadline?: Timestamp;
  status: BetStatus;
  predictionCount: number;
  totalCoinsStaked: number;
  chanceSummary: ChanceOptionSummary[];
  resolution?: BetResolution | null;
  resolvedBy?: string;
  resolvedAt?: Timestamp | null;
  groupId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BetResolution {
  winningOptionId?: string;
  winningOptionIds?: string[];
  winnerPredictionIds?: string[];
  actualValue?: number;
  actualDateValue?: string;
  actualHomeScore?: number;
  actualAwayScore?: number;
  note?: string;
}

export interface Prediction {
  id: string;
  betId: string;
  userId: string;
  username: string;
  optionId: string;
  optionIds?: string[];
  stake: number;
  userBalanceAtBetTime: number;
  displayedChanceAtBetTime: number;
  userRating?: number;
  originalOptionId?: string;
  originalStake?: number;
  originalChanceAtBetTime?: number;
  lastChangedAt?: Timestamp | null;
  revisionCount?: number;
  changeFeesPaid?: number;
  lastChangeFee?: number;
  timingMultiplier?: number;
  mintedCoinReward?: number;
  poolCoinProfit?: number;
  spicyForecastBonus?: number;
  status?: 'pending' | 'won' | 'lost';
  correct?: boolean;
  coinDelta?: number;
  ratingDelta?: number;
  resolvedAt?: Timestamp | null;
  winningOptionId?: string;
  scorePrediction?: {
    home: number;
    away: number;
  };
  numericGuess?: number;
  dateGuess?: string;
  customOptionLabel?: string;
  createdAt: Timestamp;
}

export interface PredictionEvent {
  id: string;
  betId: string;
  userId: string;
  username: string;
  fromOptionId?: string | null;
  toOptionId: string;
  fromStake?: number | null;
  toStake: number;
  chanceBefore: number;
  chanceAfter: number;
  fee: number;
  createdAt: Timestamp;
}

export interface ChanceSnapshot {
  id: string;
  betId: string;
  summary: ChanceOptionSummary[];
  createdAt: Timestamp;
}

export interface BetComment {
  id: string;
  betId: string;
  userId: string;
  username: string;
  displayName: string;
  photoURL?: string;
  body: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface CreateBetInput {
  type: BetType;
  title: string;
  description?: string;
  category: string;
  deadline?: Date;
  visibility: BetVisibility;
  invitedUsernames: string[];
  options: BetOption[];
  allowDraw?: boolean;
  allowExactScore?: boolean;
  homeTeam?: string;
  awayTeam?: string;
  imageUrl?: string;
  groupId?: string;
}

export interface UpdateBetMetadataInput {
  title: string;
  description?: string;
  category: string;
  deadline?: Date | null;
  imageUrl?: string;
}

export interface PredictionInput {
  bet: Bet;
  user: UserProfile;
  optionId: string;
  optionIds?: string[];
  stake: number;
  scorePrediction?: {
    home: number;
    away: number;
  };
  numericGuess?: number;
  dateGuess?: string;
  customOptionLabel?: string;
}

export interface FriendGroup {
  id: string;
  name: string;
  creatorId: string;
  creatorUsername: string;
  memberUsernames: string[];
  memberUids: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DailyForecastMode = 'safe' | 'random' | 'chaos' | 'spicy';
export type RewardClaimType = 'dailyForecast' | 'chest' | 'wheel' | 'weeklyChallenge';

export interface RewardClaim {
  id: string;
  userId: string;
  username: string;
  type: RewardClaimType;
  label: string;
  amount: number;
  createdAt: Timestamp;
}

export interface ChestDefinition {
  id: string;
  title: string;
  description: string;
  reward: number;
  unlocked: boolean;
  claimed: boolean;
}

export type ChallengeActivityType = 'completion' | 'wager';
export type ChallengeStatus = 'open' | 'completed' | 'failed';

export interface ChallengeActivity {
  id: string;
  type: ChallengeActivityType;
  status: ChallengeStatus;
  visibility: BetVisibility;
  title: string;
  body?: string;
  comment?: string | null;
  creatorId: string;
  creatorUsername: string;
  creatorDisplayName?: string | null;
  invitedUsernames?: string[];
  groupId?: string | null;
  completerId?: string | null;
  completerUsername?: string | null;
  completerDisplayName?: string | null;
  targetUsername?: string | null;
  proofImageUrl?: string | null;
  stake?: number;
  bonus?: number;
  reward?: number;
  chestReward?: number;
  creatorRefund?: number;
  systemChallengeId?: string | null;
  weekKey?: string | null;
  deadline?: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp | null;
  failedAt?: Timestamp | null;
}

export type NotificationEventType =
  | 'bet_created'
  | 'bet_joined'
  | 'prediction_updated'
  | 'bet_commented'
  | 'bet_resolved'
  | 'challenge_posted'
  | 'wager_created'
  | 'wager_completed'
  | 'wager_failed'
  | 'group_updated'
  | 'reward_available';

export interface AppNotification {
  id: string;
  type: NotificationEventType;
  actorUid: string;
  actorUsername: string;
  targetUids: string[];
  title: string;
  body: string;
  url: string;
  readBy?: string[];
  sentAt?: Timestamp | null;
  createdAt: Timestamp;
}
