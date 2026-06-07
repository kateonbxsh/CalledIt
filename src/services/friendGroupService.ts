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
import type { FriendGroup, UserProfile } from '../types';

async function resolveUids(usernames: string[]): Promise<string[]> {
  const results = await Promise.all(
    usernames.map(async (u) => {
      const snap = await getDoc(doc(db, 'usernames', u));
      return snap.exists() ? (snap.data() as { uid: string }).uid : null;
    }),
  );
  return results.filter((uid): uid is string => uid !== null);
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
  creatorUsername: string,
) {
  const filtered = memberUsernames
    .map((u) => u.trim().toLowerCase())
    .filter((u) => u && u !== creatorUsername);
  const memberUids = await resolveUids(filtered);

  await updateDoc(doc(db, 'friendGroups', groupId), {
    name: name.trim(),
    memberUsernames: filtered,
    memberUids,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteFriendGroup(groupId: string) {
  await deleteDoc(doc(db, 'friendGroups', groupId));
}
