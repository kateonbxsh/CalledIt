import type { Timestamp } from 'firebase/firestore';

export type BetType =
  | 'binary'
  | 'multi'
  | 'sports'
  | 'overUnder'
  | 'date'
  | 'closestNumber'
  | 'closestDate'
  | 'closestHour'
  | 'openChoice';
export type BetVisibility = 'public' | 'private';
export type BetStatus = 'open' | 'locked' | 'resolved';
export type Rank =
  | 'Iron'
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
  pendingSpicyForecasts?: Array<{
    bonus: number;
    claimedAt: Timestamp;
  }>;
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
  maxBalance?: number;
  // Lifetime ELO *won* (sum of positive rating gains only — losses never subtract).
  // This is the currency that unlocks challenge chests.
  eloWon?: number;
  // Best single-round multiplier reached across the arcade minigames.
  bestMinigameMult?: number;
  arcade?: ArcadeStats;
}

export interface ArcadeStats {
  plane?: {
    rounds: number;
    landings: number;
    totalDistanceKm: number;
    bestDistanceKm: number;
    stars: number;
    specialStars: number;
    redLandings: number;
    blueLandings: number;
    greenLandings: number;
    edgeLandings: number;
    fastGreenFullStripLandings: number;
  };
  mines?: {
    rounds: number;
    wins: number;
    safeTiles: number;
    bestMultiplier: number;
    clears3x3ThreeBombs: number;
    clears5x5OneBomb: number;
    clears5x5TwoBombs: number;
    clears5x5ThreeBombs: number;
  };
}

export interface BalanceSnapshot {
  id: string;
  userId: string;
  balance: number;
  delta: number;
  reason: string;
  createdAt: Timestamp;
}

export interface CoinGift {
  id: string;
  senderUid: string;
  senderUsername: string;
  senderDisplayName: string;
  recipientUid: string;
  recipientUsername: string;
  amount: number;
  note?: string | null;
  status: 'pending' | 'claimed' | 'cancelled';
  createdAt: Timestamp;
  claimedAt?: Timestamp | null;
}

export interface BetOption {
  id: string;
  label: string;
  teamSide?: 'home' | 'away' | 'draw';
  createdBy?: string;
}

export interface FootballTeamLink {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
}

export interface FootballMatchLink {
  provider: 'football-data.org';
  matchId: number;
  kickoff: string;
  status: string;
  matchday: number | null;
  competitionId: number;
  competitionName: string;
  competitionCode: string | null;
  competitionEmblem: string | null;
  homeTeam: FootballTeamLink;
  awayTeam: FootballTeamLink;
  estimatedChances?: {
    home: number;
    draw: number;
    away: number;
  } | null;
  chanceSource?: 'competition_standings' | null;
}

export interface FootballLiveMatch extends FootballMatchLink {
  minute: number | null;
  score: {
    home: number | null;
    away: number | null;
    halfTimeHome: number | null;
    halfTimeAway: number | null;
  };
  lastUpdated: string | null;
  endedAt: string | null;
  expectedEnd: string;
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
  maskedUsernames?: string[];
  options: BetOption[];
  allowMultipleChoices?: boolean;
  allowMultipleOutcomes?: boolean;
  allowDraw?: boolean;
  allowExactScore?: boolean;
  homeTeam?: string;
  awayTeam?: string;
  footballMatch?: FootballMatchLink | null;
  imageUrl?: string;
  deadline?: Timestamp;
  // Before/After bets use this as their target; closest-hour bets use it as
  // the single calendar day on which guesses are allowed.
  targetDate?: Timestamp | null;
  // Before/After ('date') bets: if true the event may never happen, so resolution
  // offers an "event did not happen" outcome that refunds everyone.
  eventMightNotHappen?: boolean;
  status: BetStatus;
  predictionCount: number;
  totalCoinsStaked: number;
  chanceSummary: ChanceOptionSummary[];
  initialChanceSummary?: ChanceOptionSummary[];
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
  // Before/After bets flagged "event might not happen": refunds every prediction.
  eventDidNotHappen?: boolean;
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
  status?: 'pending' | 'won' | 'lost' | 'refunded';
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
  manual?: boolean;
}

export interface BetComment {
  id: string;
  betId: string;
  userId: string;
  username: string;
  displayName: string;
  photoURL?: string;
  body: string;
  replyTo?: CommentReplyPreview | null;
  parentCommentId?: string | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface CommentReplyPreview {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  body: string;
}

export interface CreateBetInput {
  type: BetType;
  title: string;
  description?: string;
  category: string;
  deadline?: Date;
  targetDate?: Date;
  eventMightNotHappen?: boolean;
  visibility: BetVisibility;
  invitedUsernames: string[];
  maskedUsernames?: string[];
  options: BetOption[];
  initialChances?: Record<string, number>;
  allowMultipleChoices?: boolean;
  allowMultipleOutcomes?: boolean;
  allowDraw?: boolean;
  allowExactScore?: boolean;
  homeTeam?: string;
  awayTeam?: string;
  footballMatch?: FootballMatchLink | null;
  imageUrl?: string;
  groupId?: string;
}

export interface UpdateBetMetadataInput {
  title: string;
  description?: string;
  category: string;
  deadline?: Date | null;
  imageUrl?: string;
  visibility?: BetVisibility;
  groupId?: string | null;
  invitedUsernames?: string[];
  maskedUsernames?: string[];
  allowMultipleChoices?: boolean;
  allowMultipleOutcomes?: boolean;
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
  // Open-choice with multiple choices enabled: several new answers to add and
  // bet on at once (alongside any selected existing options in optionIds).
  customOptionLabels?: string[];
}

export interface FriendGroup {
  id: string;
  name: string;
  photoURL?: string | null;
  creatorId: string;
  creatorUsername: string;
  memberUsernames: string[];
  memberUids: string[];
  lastMessageAt?: Timestamp | null;
  lastMessagePreview?: string | null;
  lastMessageSenderId?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorPhotoURL?: string | null;
  body: string;
  replyTo?: GroupMessageReplyPreview | null;
  createdAt: Timestamp;
}

export interface GroupMessageReplyPreview {
  id: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  body: string;
}

export interface GroupReadState {
  groupId: string;
  lastReadAt: Timestamp;
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
  // Cumulative ELO won needed before the chest's challenge can be attempted.
  eloRequired: number;
  eloWon: number;
  // The challenge condition itself.
  goal: string;
  current: number;
  target: number;
  unlocked: boolean; // eloWon >= eloRequired (attempt is available)
  completed: boolean; // current >= target (challenge done)
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

export interface ChallengeComment {
  id: string;
  challengeId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  body: string;
  replyTo?: CommentReplyPreview | null;
  parentCommentId?: string | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type NotificationEventType =
  | 'bet_created'
  | 'bet_joined'
  | 'prediction_updated'
  | 'bet_commented'
  | 'bet_resolved'
  | 'bet_deadline_soon'
  | 'bet_deadline_passed'
  | 'challenge_posted'
  | 'wager_created'
  | 'wager_completed'
  | 'wager_failed'
  | 'wager_deadline_soon'
  | 'wager_deadline_passed'
  | 'group_updated'
  | 'group_message'
  | 'challenge_commented'
  | 'reward_available'
  | 'leaderboard_moved'
  | 'coins_received'
  | 'test_push';

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

export interface DailyBonus {
  type: 'bet' | 'challenge' | 'prediction' | 'comment';
  amount: number;
  claimedAt: Timestamp;
}

export interface DailyBonusTracker {
  // /users/{uid}/dailyBonuses/{dateKey}
  dateKey: string; // YYYY-MM-DD UTC
  bonuses: DailyBonus[];
  totalClaimed: number;
  updatedAt: Timestamp;
}
