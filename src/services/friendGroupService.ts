import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Bet, ChallengeActivity, FriendGroup, UserProfile } from '../types';
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
      const invitedUsernames = allGroupUsernames.filter((username) => username !== bet.creatorUsername);
      return updateDoc(doc(db, 'bets', item.id), {
        invitedUsernames,
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
