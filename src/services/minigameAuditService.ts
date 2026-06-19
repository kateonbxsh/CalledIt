import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserProfile } from '../types';

export type MinigameKind = 'mines' | 'plane' | 'guessing' | 'plinko';

export type MinigameAuditInput = {
  game: MinigameKind;
  action: string;
  sessionId: string;
  choice?: string;
  result?: string;
  stake?: number;
  payout?: number;
  multiplier?: number;
  ratingDelta?: number;
};

export type MinigameAuditEvent = MinigameAuditInput & {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  createdAt: Timestamp;
};

export type MinigameAuditPage = {
  events: MinigameAuditEvent[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

const PAGE_SIZE = 60;

export function createMinigameSessionId(game: MinigameKind) {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${game}:${random}`;
}

function finite(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export async function logMinigameEvent(user: UserProfile, input: MinigameAuditInput) {
  const stake = finite(input.stake);
  const payout = finite(input.payout);
  const multiplier = finite(input.multiplier);
  const ratingDelta = finite(input.ratingDelta);

  await addDoc(collection(db, 'minigameEvents'), {
    userId: user.uid,
    username: user.username,
    displayName: user.displayName,
    game: input.game,
    action: input.action.slice(0, 60),
    sessionId: input.sessionId.slice(0, 160),
    ...(input.choice ? { choice: input.choice.slice(0, 240) } : {}),
    ...(input.result ? { result: input.result.slice(0, 40) } : {}),
    ...(stake !== undefined ? { stake } : {}),
    ...(payout !== undefined ? { payout } : {}),
    ...(multiplier !== undefined ? { multiplier } : {}),
    ...(ratingDelta !== undefined ? { ratingDelta } : {}),
    createdAt: serverTimestamp(),
  });
}

export async function listMinigameEvents(
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = PAGE_SIZE,
): Promise<MinigameAuditPage> {
  const eventsRef = collection(db, 'minigameEvents');
  const eventsQuery = cursor
    ? query(eventsRef, orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize))
    : query(eventsRef, orderBy('createdAt', 'desc'), limit(pageSize));
  const snapshot = await getDocs(eventsQuery);
  return {
    events: snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as MinigameAuditEvent),
    cursor: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.docs.length === pageSize,
  };
}
