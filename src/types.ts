import type { Timestamp } from 'firebase/firestore';

export type BetType = 'binary' | 'multi' | 'sports' | 'overUnder' | 'date';
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
}

export interface BetOption {
  id: string;
  label: string;
  teamSide?: 'home' | 'away' | 'draw';
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BetResolution {
  winningOptionId: string;
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
  stake: number;
  userBalanceAtBetTime: number;
  displayedChanceAtBetTime: number;
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
  createdAt: Timestamp;
}

export interface ChanceSnapshot {
  id: string;
  betId: string;
  summary: ChanceOptionSummary[];
  createdAt: Timestamp;
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
}

export interface PredictionInput {
  bet: Bet;
  user: UserProfile;
  optionId: string;
  stake: number;
  scorePrediction?: {
    home: number;
    away: number;
  };
}
