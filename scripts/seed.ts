import { initializeApp } from 'firebase/app';
import {
  Timestamp,
  collection,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { calculateChanceSummary } from '../src/utils/probability';
import { rankForRating } from '../src/utils/ranks';
import type { BetOption } from '../src/types';

const emptyStats = {
  totalBets: 0,
  wins: 0,
  losses: 0,
  accuracy: 0,
  bestUpsetWin: 0,
  coinsWon: 0,
  coinsLost: 0,
};

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const users = [
  { uid: 'dev-alex', email: 'alex@example.com', username: 'alex', displayName: 'Alex' },
  { uid: 'dev-sam', email: 'sam@example.com', username: 'sam', displayName: 'Sam' },
  { uid: 'dev-taylor', email: 'taylor@example.com', username: 'taylor', displayName: 'Taylor' },
];

const options: BetOption[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

async function seed() {
  for (const user of users) {
    await setDoc(doc(db, 'users', user.uid), {
      ...user,
      bio: 'Seed profile',
      photoURL: '',
      coinBalance: 1000,
      rating: 1000,
      rank: rankForRating(1000),
      stats: emptyStats,
      isAdmin: false,
      lastRefillAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'usernames', user.username), {
      uid: user.uid,
      createdAt: serverTimestamp(),
    });
  }

  await setDoc(doc(collection(db, 'bets'), 'seed-weekend-rain'), {
    type: 'binary',
    title: 'Will it rain during the next group hang?',
    description: 'Forecast the weather mood for the weekend plan.',
    category: 'Friends',
    creatorId: users[0].uid,
    creatorUsername: users[0].username,
    visibility: 'public',
    invitedUsernames: [],
    options,
    deadline: Timestamp.fromDate(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)),
    status: 'open',
    predictionCount: 0,
    totalCoinsStaked: 0,
    chanceSummary: calculateChanceSummary(options, []),
    resolution: null,
    resolvedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

seed()
  .then(() => {
    console.log('Seed data written.');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
