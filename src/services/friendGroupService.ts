import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Bet, ChallengeActivity, FriendGroup, GroupMessage, GroupReadState, UserProfile } from '../types';
import { createNotification } from './notificationService';

async function resolveUids(usernames: string[]): Promise<string[]> {
  const results = await Promise.all(
    usernames.map(async (u) => {
      const snap = await getDoc(doc(db, 'usernames', u));
      return snap.exists() ? (snap.data() as { uid: string }).uid : null;
    }),
  );
  return results.filter((uid): uid is string => uid !== null);
}

function sameUsernames(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((username, index) => username === sortedB[index]);
}

export async function listMyFriendGroups(user: UserProfile): Promise<FriendGroup[]> {
  const groupsRef = collection(db, 'friendGroups');
  const [createdSnap, memberSnap] = await Promise.all([
    getDocs(query(groupsRef, where('creatorId', '==', user.uid), limit(50))),
    getDocs(query(groupsRef, where('memberUids', 'array-contains', user.uid), limit(50))),
  ]);

  const map = new Map<string, FriendGroup>();
  for (const snap of [createdSnap, memberSnap]) {
    for (const d of snap.docs) {
      map.set(d.id, { id: d.id, ...d.data() } as FriendGroup);
    }
  }
  return [...map.values()].sort(
    (a, b) => a.createdAt.toMillis() - b.createdAt.toMillis(),
  );
}

export async function createFriendGroup(
  name: string,
  memberUsernames: string[],
  creator: UserProfile,
): Promise<string> {
  const filtered = memberUsernames
    .map((u) => u.trim().toLowerCase())
    .filter((u) => u && u !== creator.username);
  const memberUids = await resolveUids(filtered);

  const ref = await addDoc(collection(db, 'friendGroups'), {
    name: name.trim(),
    creatorId: creator.uid,
    creatorUsername: creator.username,
    memberUsernames: filtered,
    memberUids,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateFriendGroup(
  groupId: string,
  name: string,
  memberUsernames: string[],
  creator: UserProfile,
) {
  const groupRef = doc(db, 'friendGroups', groupId);
  const previousSnap = await getDoc(groupRef);
  const previousGroup = previousSnap.exists() ? ({ id: previousSnap.id, ...previousSnap.data() } as FriendGroup) : null;
  const filtered = memberUsernames
    .map((u) => u.trim().toLowerCase())
    .filter((u) => u && u !== creator.username);
  const memberUids = await resolveUids(filtered);

  await updateDoc(groupRef, {
    name: name.trim(),
    memberUsernames: filtered,
    memberUids,
    updatedAt: serverTimestamp(),
  });

  if (previousGroup && sameUsernames(previousGroup.memberUsernames, filtered)) {
    return;
  }

  const allGroupUsernames = [creator.username, ...filtered];
  const betsSnap = await getDocs(query(collection(db, 'bets'), where('groupId', '==', groupId), limit(100)));
  const challengesSnap = await getDocs(query(collection(db, 'challenges'), where('groupId', '==', groupId), limit(100)));
  await Promise.all([
    ...betsSnap.docs.map((item) => {
      const bet = { id: item.id, ...item.data() } as Bet;
      const masked = new Set((bet.maskedUsernames ?? []).map((username) => username.trim().toLowerCase()));
      const invitedUsernames = allGroupUsernames.filter((username) => username !== bet.creatorUsername && !masked.has(username));
      return updateDoc(doc(db, 'bets', item.id), {
        invitedUsernames,
        maskedUsernames: [...masked],
        updatedAt: serverTimestamp(),
      });
    }),
    ...challengesSnap.docs.map((item) => {
      const challenge = { id: item.id, ...item.data() } as ChallengeActivity;
      const invitedUsernames = allGroupUsernames.filter((username) => username !== challenge.creatorUsername);
      return updateDoc(doc(db, 'challenges', item.id), {
        invitedUsernames,
        updatedAt: serverTimestamp(),
      });
    }),
  ]);
  await createNotification({
    type: 'group_updated',
    actor: creator,
    targetUids: previousGroup?.memberUids ?? memberUids,
    title: 'Friend group updated',
    body: `${creator.displayName || creator.username} updated ${name.trim()}.`,
    url: '/#/groups',
  });
}

export async function deleteFriendGroup(groupId: string) {
  await deleteDoc(doc(db, 'friendGroups', groupId));
}

export type GroupMessagePage = {
  messages: GroupMessage[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export async function listGroupMessages(
  groupId: string,
  cursor?: QueryDocumentSnapshot<DocumentData> | null,
  pageSize = 30,
): Promise<GroupMessagePage> {
  const messagesRef = collection(db, 'friendGroups', groupId, 'messages');
  const pageQuery = cursor
    ? query(messagesRef, orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize))
    : query(messagesRef, orderBy('createdAt', 'desc'), limit(pageSize));
  const snap = await getDocs(pageQuery);
  return {
    messages: snap.docs
      .map((item) => ({ id: item.id, groupId, ...item.data() }) as GroupMessage)
      .reverse(),
    cursor: snap.docs.at(-1) ?? null,
    hasMore: snap.docs.length === pageSize,
  };
}

export async function sendGroupMessage(group: FriendGroup, user: UserProfile, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Write a message first.');
  if (trimmed.length > 1000) throw new Error('Messages can be at most 1000 characters.');
  const groupRef = doc(db, 'friendGroups', group.id);
  const messageRef = doc(collection(db, 'friendGroups', group.id, 'messages'));
  await runTransaction(db, async (transaction) => {
    transaction.set(messageRef, {
      groupId: group.id,
      authorId: user.uid,
      authorUsername: user.username,
      authorDisplayName: user.displayName,
      body: trimmed,
      createdAt: serverTimestamp(),
    });
    transaction.update(groupRef, {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: trimmed.slice(0, 160),
      lastMessageSenderId: user.uid,
      updatedAt: serverTimestamp(),
    });
  });
  await markGroupRead(group.id, user.uid);
  await createNotification({
    type: 'group_message',
    actor: user,
    targetUids: [group.creatorId, ...group.memberUids],
    title: group.name,
    body: `${user.displayName || user.username}: ${trimmed.slice(0, 140)}`,
    url: '/#/groups',
  });
}

export async function markGroupRead(groupId: string, userId: string) {
  await setDoc(doc(db, 'users', userId, 'groupReads', groupId), {
    groupId,
    lastReadAt: serverTimestamp(),
  }, { merge: true });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('called-it:group-read'));
}

export async function listGroupReadStates(userId: string) {
  const snap = await getDocs(query(collection(db, 'users', userId, 'groupReads'), limit(100)));
  return new Map(
    snap.docs.map((item) => [
      item.id,
      { groupId: item.id, ...item.data() } as GroupReadState,
    ]),
  );
}

export function groupHasUnread(group: FriendGroup, reads: Map<string, GroupReadState>, userId: string) {
  if (!group.lastMessageAt || group.lastMessageSenderId === userId) return false;
  const readAt = reads.get(group.id)?.lastReadAt;
  return !readAt || readAt.toMillis() < group.lastMessageAt.toMillis();
}
