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
  startAfter,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  BetVisibility,
  ChallengeActivity,
  ChallengeComment,
  ChestDefinition,
  DailyForecastMode,
  FriendGroup,
  RewardClaim,
  UserProfile,
} from '../types';
import { ALL_ENABLED_TARGET_UID, createNotification, uidsForUsernames } from './notificationService';
import { awardDailyBonus } from './bonusService';
import { canClaimDailyReward, canClaimSixHourReward } from '../utils/coins';
import { rankForRating } from '../utils/ranks';
import { setBalanceInTransaction } from './balanceService';

// Global buff applied to coin rewards across forecasts, chests, weekly
// challenges and wager bonuses so the whole economy pays out more generously.
export const REWARD_MULTIPLIER = 2;

const SAFE_FORECAST_REWARD = 60 * REWARD_MULTIPLIER;
const SPICY_FORECAST_NOW = 20 * REWARD_MULTIPLIER;
const SPICY_FORECAST_BONUS = 120 * REWARD_MULTIPLIER;
function forecastReward(mode: DailyForecastMode) {
  const rewards: Record<DailyForecastMode, { amount: number; label: string; spicyBonus?: number }> = {
    safe: { amount: SAFE_FORECAST_REWARD, label: 'Safe daily forecast' },
    random: { amount: (10 + Math.floor(Math.random() * 91)) * REWARD_MULTIPLIER, label: 'Random refill' },
    chaos: { amount: [-20, 5, 130][Math.floor(Math.random() * 3)] * REWARD_MULTIPLIER, label: 'Chaos refill' },
    spicy: { amount: SPICY_FORECAST_NOW, label: 'Spicy daily forecast', spicyBonus: SPICY_FORECAST_BONUS },
  };
  return rewards[mode];
}

export interface WeeklyChallengeDefinition {
  id: string;
  title: string;
  body: string;
  reward: number;
  chestReward: number;
  tag?: WeeklyChallengeTag;
}

type WeeklyChallengeTag =
  | 'going-out'
  | 'gym'
  | 'style'
  | 'drink-food'
  | 'social'
  | 'weird'
  | 'glow-up'
  | 'bubble';

const weeklyChallengeCatalog: WeeklyChallengeDefinition[] = [
  { id: 'new-cafe-drink', title: 'New cafe drink', body: 'Order a non-alcoholic drink you have never tried. Upload the cup, receipt, or table proof.', reward: 65, chestReward: 35, tag: 'drink-food' },
  { id: 'boba-wildcard', title: 'Boba wildcard', body: 'Try a boba, smoothie, juice, matcha, coffee, or tea flavor chosen mostly by vibes.', reward: 70, chestReward: 35, tag: 'drink-food' },
  { id: 'barista-pick', title: 'Let them pick', body: 'Ask a barista or cashier for a non-alcoholic recommendation and actually try it.', reward: 90, chestReward: 50, tag: 'bubble' },
  { id: 'drink-aesthetic', title: 'Drink aesthetic', body: 'Make or buy a drink and take a photo that looks like it belongs in a tiny ad.', reward: 60, chestReward: 30, tag: 'drink-food' },
  { id: 'snack-rating', title: 'Snack critic', body: 'Try a snack and rate it out of 10 in the caption or proof note.', reward: 50, chestReward: 25, tag: 'drink-food' },
  { id: 'weird-menu-safe', title: 'Weird menu pick', body: 'Order the strangest safe non-alcoholic menu item you can find.', reward: 85, chestReward: 45, tag: 'drink-food' },
  { id: 'dessert-hunt', title: 'Dessert hunt', body: 'Find the best-looking dessert near you and upload proof.', reward: 70, chestReward: 35, tag: 'drink-food' },
  { id: 'spicy-food-mini', title: 'Spicy bite', body: 'Try something spicier than your usual comfort level. Keep it reasonable.', reward: 75, chestReward: 40, tag: 'drink-food' },
  { id: 'fancy-home-drink', title: 'Fancy home drink', body: 'Make a non-alcoholic drink with ice, garnish, a weird glass, or dramatic presentation.', reward: 55, chestReward: 30, tag: 'drink-food' },
  { id: 'green-meal', title: 'Eat something green', body: 'Make or buy a meal that includes an actual vegetable. Upload the plate.', reward: 45, chestReward: 25, tag: 'drink-food' },
  { id: 'questionable-sandwich', title: 'Questionable sandwich', body: 'Invent a sandwich with at least one unusual ingredient. It must still be edible.', reward: 90, chestReward: 50, tag: 'weird' },
  { id: 'floor-picnic-v2', title: 'Tiny picnic', body: 'Have a snack or drink picnic-style outside or somewhere harmlessly unusual.', reward: 75, chestReward: 40, tag: 'going-out' },

  { id: 'fit-pic-public', title: 'Public fit pic', body: 'Take an outfit photo somewhere outside your home.', reward: 75, chestReward: 40, tag: 'style' },
  { id: 'one-bold-accessory', title: 'Bold accessory', body: 'Wear one accessory or item that is louder than your usual style.', reward: 70, chestReward: 35, tag: 'style' },
  { id: 'color-theme-fit', title: 'Color theme fit', body: 'Wear an outfit built around one main color and upload proof.', reward: 65, chestReward: 35, tag: 'style' },
  { id: 'friend-picks-fit', title: 'Friend picks one item', body: 'Let a friend pick one part of your outfit and wear it out or for a fit check.', reward: 85, chestReward: 45, tag: 'social' },
  { id: 'coffee-run-fit', title: 'Coffee run fit', body: 'Dress like the drink run is the event. Upload a fit or mirror pic.', reward: 65, chestReward: 35, tag: 'style' },
  { id: 'gym-fit-check', title: 'Gym fit check', body: 'Take a gym fit or post-workout fit photo.', reward: 60, chestReward: 30, tag: 'style' },
  { id: 'style-unused-item', title: 'Style the forgotten item', body: 'Wear an item you almost never use and make it work.', reward: 80, chestReward: 40, tag: 'style' },
  { id: 'fake-movie-fit', title: 'Movie genre fit', body: 'Dress like you are in a fake movie genre: spy, romcom, sports movie, cyber, anything.', reward: 85, chestReward: 45, tag: 'style' },
  { id: 'ridiculous-works', title: 'Ridiculous but works', body: 'Put together the weirdest outfit that still somehow works. Upload proof.', reward: 95, chestReward: 50, tag: 'weird' },
  { id: 'public-mirror', title: 'Public mirror check', body: 'Find a mirror outside your home and take a clean mirror pic.', reward: 70, chestReward: 35, tag: 'going-out' },

  { id: 'gym-proof-v2', title: 'Gym proof', body: 'Go to the gym or do a real workout. Upload setup, mirror, shoes, or sweaty proof.', reward: 75, chestReward: 40, tag: 'gym' },
  { id: 'leg-day-survive', title: 'Survive leg day', body: 'Do a leg-focused workout or lower-body session and upload proof.', reward: 85, chestReward: 45, tag: 'gym' },
  { id: 'machine-avoid', title: 'Avoided machine', body: 'Try one gym machine, lift, or movement you usually skip.', reward: 80, chestReward: 40, tag: 'gym' },
  { id: 'incline-ten', title: 'Incline ten', body: 'Do 10 minutes of incline walk, stairs, hill walk, or equivalent.', reward: 60, chestReward: 30, tag: 'gym' },
  { id: 'pushup-fifty', title: '50 pushups total', body: 'Complete 50 pushups across the day. Knees or incline count if needed.', reward: 70, chestReward: 35, tag: 'gym' },
  { id: 'core-regret', title: 'Core regret', body: 'Do a core session long enough to regret your choices a little.', reward: 75, chestReward: 40, tag: 'gym' },
  { id: 'stretch-session', title: 'Stretch session', body: 'Stretch for 10 minutes. Upload mat, timer, or post-stretch proof.', reward: 45, chestReward: 25, tag: 'gym' },
  { id: 'walk-5k', title: '5k steps outside', body: 'Get at least 5,000 steps outside or take a long walk with proof.', reward: 70, chestReward: 35, tag: 'gym' },
  { id: 'try-sport', title: 'Try a sport', body: 'Play, practice, or try a sport/activity you do not usually do.', reward: 95, chestReward: 50, tag: 'gym' },
  { id: 'no-headphones-walk', title: 'No-headphones walk', body: 'Walk outside for 15 minutes without headphones. Upload route or outside proof.', reward: 65, chestReward: 35, tag: 'bubble' },
  { id: 'stairs-day', title: 'Stairs day', body: 'Take stairs instead of an elevator/escalator at least once and document it.', reward: 45, chestReward: 25, tag: 'gym' },
  { id: 'one-minute-plank-v2', title: 'One minute hold', body: 'Hold a plank, wall sit, or dead hang for one minute.', reward: 80, chestReward: 45, tag: 'gym' },

  { id: 'main-character-walk', title: 'Main character walk', body: 'Go outside for a 20 minute walk like the soundtrack is playing.', reward: 70, chestReward: 35, tag: 'going-out' },
  { id: 'new-street', title: 'New street', body: 'Walk down a street, route, or area you have never properly explored.', reward: 80, chestReward: 40, tag: 'going-out' },
  { id: 'city-lights', title: 'City lights', body: 'Take a photo with evening lights, neon, a cool sign, or a nice storefront.', reward: 70, chestReward: 35, tag: 'going-out' },
  { id: 'sunset-proof', title: 'Sunset proof', body: 'Catch sunset or golden hour from outside.', reward: 60, chestReward: 30, tag: 'going-out' },
  { id: 'friend-chooses-place', title: 'Friend chooses place', body: 'Let a friend choose a place to go, then go there or pass by.', reward: 90, chestReward: 50, tag: 'social' },
  { id: 'aesthetic-corner', title: 'Aesthetic corner', body: 'Find the most aesthetic corner of your day and upload it.', reward: 55, chestReward: 30, tag: 'going-out' },
  { id: 'mall-arcade-cafe', title: 'Public spot proof', body: 'Go to a mall, arcade, bookstore, gym, cafe, park, or similar public spot.', reward: 65, chestReward: 35, tag: 'going-out' },
  { id: 'photo-walk-v2', title: 'Three-photo walk', body: 'Take three interesting photos during a walk and upload the best one.', reward: 65, chestReward: 35, tag: 'going-out' },
  { id: 'go-alone-20', title: 'Solo 20', body: 'Go somewhere alone for 20 minutes: cafe, walk, shop, gym, library, or park.', reward: 90, chestReward: 50, tag: 'bubble' },
  { id: 'public-selfie', title: 'Public selfie', body: 'Take a selfie outside your home without hiding like you committed a crime.', reward: 85, chestReward: 45, tag: 'bubble' },
  { id: 'ask-recommendation', title: 'Ask for a recommendation', body: 'Ask someone working at a cafe/shop/food place for a recommendation.', reward: 100, chestReward: 55, tag: 'bubble' },
  { id: 'tiny-conversation', title: 'Tiny conversation', body: 'Start a tiny harmless conversation: ask a question, compliment, or comment on something.', reward: 110, chestReward: 60, tag: 'bubble' },

  { id: 'friend-photo-outside', title: 'Friend photo outside', body: 'Take a photo with a friend outside or at a public place.', reward: 75, chestReward: 40, tag: 'social' },
  { id: 'friend-drink-pick', title: 'Friend picks your drink', body: 'Let a friend pick your non-alcoholic drink or flavor.', reward: 80, chestReward: 40, tag: 'social' },
  { id: 'mini-photoshoot', title: 'Mini photoshoot', body: 'Do a tiny photo shoot with a friend. One decent photo is enough.', reward: 85, chestReward: 45, tag: 'social' },
  { id: 'song-recommend', title: 'Song recommendation', body: 'Send someone a song recommendation and screenshot safe proof.', reward: 45, chestReward: 25, tag: 'social' },
  { id: 'walk-with-someone', title: 'Walk with someone', body: 'Go on a walk with a friend, sibling, classmate, or gym buddy.', reward: 70, chestReward: 35, tag: 'social' },
  { id: 'shared-playlist', title: 'Shared playlist', body: 'Make a tiny playlist for a mood, friend, outing, or workout.', reward: 50, chestReward: 25, tag: 'social' },
  { id: 'meme-recreate', title: 'Recreate a meme pose', body: 'Recreate a harmless meme pose or dramatic photo with a friend.', reward: 85, chestReward: 45, tag: 'weird' },
  { id: 'fit-battle', title: 'Fit battle', body: 'Do a friendly fit check or gym fit comparison with someone.', reward: 75, chestReward: 40, tag: 'social' },
  { id: 'bring-snack', title: 'Bring a snack', body: 'Bring someone a snack or drink, or get one together.', reward: 65, chestReward: 35, tag: 'social' },
  { id: 'group-mirror', title: 'Group mirror pic', body: 'Take a group mirror pic or group outing proof.', reward: 80, chestReward: 40, tag: 'social' },

  { id: 'album-cover', title: 'Fake album cover', body: 'Take a photo that looks like an album cover. Dramatic points encouraged.', reward: 80, chestReward: 40, tag: 'weird' },
  { id: 'music-video-shot', title: 'Music video shot', body: 'Take a photo that looks like a frame from a music video.', reward: 80, chestReward: 40, tag: 'weird' },
  { id: 'ugly-cool-find', title: 'Ugly-cool find', body: 'Find the ugliest-cool item in a store, closet, street, or room.', reward: 65, chestReward: 35, tag: 'weird' },
  { id: 'fake-ad', title: 'Fake ad', body: 'Make a fake ad photo for a drink, snack, shoe, bag, or random object.', reward: 85, chestReward: 45, tag: 'weird' },
  { id: 'point-at-nothing', title: 'Point at nothing', body: 'Take a photo pointing at something deeply unimportant like it is breaking news.', reward: 55, chestReward: 30, tag: 'weird' },
  { id: 'match-outfit-object', title: 'Match the world', body: 'Find something outside that matches your outfit or drink.', reward: 65, chestReward: 35, tag: 'weird' },
  { id: 'npc-walk-proof', title: 'NPC walk', body: 'Do a tiny staged NPC walk or pose somewhere safe and upload proof.', reward: 90, chestReward: 50, tag: 'weird' },
  { id: 'blurry-action', title: 'Blurry action shot', body: 'Take a deliberately blurry action shot: jump, run, spin, or dramatic walk.', reward: 65, chestReward: 35, tag: 'weird' },
  { id: 'harmless-object', title: 'Weird object hunt', body: 'Photograph the weirdest harmless object you see this week.', reward: 60, chestReward: 30, tag: 'weird' },
  { id: 'dramatic-normal-place', title: 'Dramatic normal place', body: 'Pose dramatically somewhere incredibly normal.', reward: 80, chestReward: 40, tag: 'weird' },

  { id: 'shoe-clean', title: 'Shoe reset', body: 'Clean your shoes or make them photo-ready.', reward: 45, chestReward: 25, tag: 'glow-up' },
  { id: 'gym-bag-reset', title: 'Gym bag reset', body: 'Reset your gym bag, backpack, purse, or daily carry.', reward: 50, chestReward: 25, tag: 'glow-up' },
  { id: 'camera-roll-clear', title: 'Camera roll clear', body: 'Delete or organize at least 20 photos/videos from your camera roll.', reward: 45, chestReward: 25, tag: 'glow-up' },
  { id: 'tomorrow-fit', title: 'Tomorrow fit', body: 'Plan tomorrow outfit or gym fit and upload the setup.', reward: 45, chestReward: 25, tag: 'glow-up' },
  { id: 'room-photo-safe', title: 'Photo-safe corner', body: 'Make one corner of your room clean enough for a photo.', reward: 60, chestReward: 30, tag: 'glow-up' },
  { id: 'skincare-haircare', title: 'Glow-up proof', body: 'Do skincare, haircare, shave/trim, nails, or another clean-up ritual.', reward: 55, chestReward: 30, tag: 'glow-up' },
  { id: 'water-bottle-reset', title: 'Bottle reset', body: 'Wash and refill your water bottle. Hydration counts as a side quest.', reward: 35, chestReward: 20, tag: 'glow-up' },
  { id: 'desk-reset-v2', title: 'Desk reset', body: 'Reset your desk, vanity, bag shelf, or main drop zone.', reward: 55, chestReward: 30, tag: 'glow-up' },
  { id: 'snack-prep', title: 'Snack prep', body: 'Prep one useful snack for gym, school, work, or going out.', reward: 50, chestReward: 25, tag: 'glow-up' },
  { id: 'playlist-refresh', title: 'Playlist refresh', body: 'Add 10 songs to a playlist for gym, night walk, study, or going out.', reward: 45, chestReward: 25, tag: 'glow-up' },

  { id: 'compliment-stranger-safe', title: 'Compliment mission', body: 'Give a genuine, non-weird compliment to someone. Proof can be a note after the fact.', reward: 115, chestReward: 60, tag: 'bubble' },
  { id: 'ask-photo', title: 'Ask for a photo', body: 'Ask someone you are with to take a photo of you instead of hiding behind selfies.', reward: 95, chestReward: 50, tag: 'bubble' },
  { id: 'new-class-activity', title: 'Try a class/activity', body: 'Try a new gym class, sport session, event, club, study spot, or social activity.', reward: 125, chestReward: 65, tag: 'bubble' },
  { id: 'phone-down-outing', title: 'Phone-down outing', body: 'Spend 20 minutes out with your phone away except for proof at the start/end.', reward: 100, chestReward: 55, tag: 'bubble' },
  { id: 'solo-order', title: 'Solo order', body: 'Go somewhere and order a drink/snack alone without overthinking it.', reward: 95, chestReward: 50, tag: 'bubble' },
];

export function currentWeekKey(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return `${date.getUTCFullYear()}-W${Math.floor(day / 7) + 1}`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function weeklyChallengesForUser(user: UserProfile, weekKey = currentWeekKey()) {
  const picked = new Map<string, WeeklyChallengeDefinition>();
  const pickFromTag = (tag: WeeklyChallengeTag, seed: string) => {
    const pool = weeklyChallengeCatalog.filter((challenge) => challenge.tag === tag);
    if (pool.length === 0) return;
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidate = pool[(hashString(seed) + offset * 7) % pool.length];
      if (!picked.has(candidate.id)) {
        picked.set(candidate.id, candidate);
        return;
      }
    }
  };

  // Two weekly commons give friend groups some overlap; the rest is user-specific.
  pickFromTag('going-out', `common:${weekKey}:going-out`);
  pickFromTag('drink-food', `common:${weekKey}:drink-food`);

  const personalizedTags: WeeklyChallengeTag[] = [
    'going-out',
    'gym',
    'style',
    'drink-food',
    'social',
    'weird',
    'glow-up',
    'gym',
  ];
  personalizedTags.forEach((tag, index) => pickFromTag(tag, `${user.uid}:${weekKey}:${tag}:${index}`));

  // About every other week per user, replace one slot with a bigger get-out-of-your-bubble quest.
  if (hashString(`bubble:${user.uid}:${weekKey}`) % 2 === 0) {
    const keys = [...picked.keys()];
    if (keys.length > 8) picked.delete(keys[keys.length - 1]);
    pickFromTag('bubble', `${user.uid}:${weekKey}:bubble-breaker`);
  }

  const allTags: WeeklyChallengeTag[] = ['going-out', 'gym', 'style', 'drink-food', 'social', 'weird', 'glow-up', 'bubble'];
  let filler = 0;
  while (picked.size < 10) {
    const tag = allTags[(hashString(`${user.uid}:${weekKey}:fill:${filler}`) + filler) % allTags.length];
    pickFromTag(tag, `${user.uid}:${weekKey}:fill:${tag}:${filler}`);
    filler += 1;
    if (filler > 80) break;
  }

  return [...picked.values()].slice(0, 10).map((challenge) => ({
    ...challenge,
    reward: challenge.reward * REWARD_MULTIPLIER,
    chestReward: challenge.chestReward * REWARD_MULTIPLIER,
  }));
}

export const chestCatalog = [
  {
    id: 'getting-warm',
    title: 'Getting Warm',
    description: 'Resolve 3 predictions.',
    reward: 100,
    unlocked: (user: UserProfile) => user.stats.totalBets >= 3,
  },
  {
    id: 'upset-artist',
    title: 'Upset Artist',
    description: 'Win an upset worth at least 60%.',
    reward: 160,
    unlocked: (user: UserProfile) => user.stats.bestUpsetWin >= 60,
  },
  {
    id: 'steady-caller',
    title: 'Steady Caller',
    description: 'Win 5 predictions with at least 50% accuracy.',
    reward: 220,
    unlocked: (user: UserProfile) => user.stats.wins >= 5 && user.stats.accuracy >= 50,
  },
  {
    id: 'challenge-sampler',
    title: 'Challenge Sampler',
    description: 'Complete 3 real-life challenges.',
    reward: 180,
    unlocked: (user: UserProfile) => (user.stats.challengesCompleted ?? 0) >= 3,
  },
  {
    id: 'challenge-menace',
    title: 'Challenge Menace',
    description: 'Complete 10 real-life challenges.',
    reward: 350,
    unlocked: (user: UserProfile) => (user.stats.challengesCompleted ?? 0) >= 10,
  },
] as const;

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function sixHourKey(date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10);
  const hour = date.getUTCHours();
  const sixHourBlock = Math.floor(hour / 6);
  return `${dateStr}_${sixHourBlock * 6}`;
}

function rewardClaimRef(userId: string, id: string) {
  return doc(db, 'rewardClaims', `${userId}_${id}`);
}

function challengeAudience(params: {
  visibility: BetVisibility;
  groupId?: string;
  groups?: FriendGroup[];
  user: UserProfile;
  invitedUsernames?: string[];
}) {
  const group = params.groupId ? params.groups?.find((item) => item.id === params.groupId) : null;
  if (params.groupId && !group) throw new Error('Choose a valid friend group.');
  if (!group) {
    const invitedUsernames = params.visibility === 'private'
      ? (params.invitedUsernames ?? [])
          .map((username) => username.trim().toLowerCase())
          .filter((username) => username && username !== params.user.username)
      : [];
    return {
      visibility: params.visibility,
      groupId: null,
      invitedUsernames,
    };
  }
  return {
    visibility: 'private' as BetVisibility,
    groupId: group.id,
    invitedUsernames: [group.creatorUsername, ...group.memberUsernames]
      .map((username) => username.trim().toLowerCase())
      .filter((username) => username && username !== params.user.username),
  };
}

function uniqueById(items: ChallengeActivity[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((left, right) => (right.createdAt?.toMillis?.() ?? 0) - (left.createdAt?.toMillis?.() ?? 0));
}

export async function claimDailyForecast(user: UserProfile, mode: DailyForecastMode) {
  const userRef = doc(db, 'users', user.uid);
  const claimRef = rewardClaimRef(user.uid, `forecast_${sixHourKey()}`);
  const reward = forecastReward(mode);
  await runTransaction(db, async (transaction) => {
    const [userSnap, claimSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(claimRef),
    ]);
    const current = userSnap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    if (claimSnap.exists() || !canClaimSixHourReward(current.lastDailyForecastAt?.toDate?.() ?? null)) {
      throw new Error('Forecast is on cooldown. Available again in 6 hours.');
    }

    transaction.set(claimRef, {
      userId: user.uid,
      username: user.username,
      type: 'dailyForecast',
      label: reward.label,
      amount: reward.amount,
      createdAt: serverTimestamp(),
    });
    const nextPendingForecasts = current.pendingSpicyForecasts ?? [];
    if (reward.spicyBonus) {
      nextPendingForecasts.push({ bonus: reward.spicyBonus, claimedAt: Timestamp.now() });
    }

    setBalanceInTransaction(transaction, userRef, current, current.coinBalance + reward.amount, reward.label, {
      lastDailyForecastAt: serverTimestamp(),
      pendingSpicyForecasts: nextPendingForecasts,
    });
  });
  return reward;
}

export async function getChestDefinitions(user: UserProfile): Promise<ChestDefinition[]> {
  const snap = await getDocs(query(collection(db, 'rewardClaims'), where('userId', '==', user.uid), limit(100)));
  const claimed = new Set(
    snap.docs
      .map((item) => ({ id: item.id, ...item.data() }) as RewardClaim)
      .filter((claim) => claim.type === 'chest')
      .map((claim) => claim.id.replace(`${user.uid}_chest_`, '')),
  );

  return chestCatalog.map((chest) => ({
    id: chest.id,
    title: chest.title,
    description: chest.description,
    reward: chest.reward * REWARD_MULTIPLIER,
    unlocked: chest.unlocked(user),
    claimed: claimed.has(chest.id),
  }));
}

export async function claimChest(user: UserProfile, chestId: string) {
  const chest = chestCatalog.find((item) => item.id === chestId);
  if (!chest) throw new Error('Chest not found.');
  if (!chest.unlocked(user)) throw new Error('Chest is still locked.');

  const amount = chest.reward * REWARD_MULTIPLIER;
  const userRef = doc(db, 'users', user.uid);
  const claimRef = rewardClaimRef(user.uid, `chest_${chest.id}`);
  await runTransaction(db, async (transaction) => {
    const [claimSnap, userSnap] = await Promise.all([
      transaction.get(claimRef),
      transaction.get(userRef),
    ]);
    if (claimSnap.exists()) throw new Error('Chest already opened.');
    const current = userSnap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    transaction.set(claimRef, {
      userId: user.uid,
      username: user.username,
      type: 'chest',
      label: chest.title,
      amount,
      createdAt: serverTimestamp(),
    });
    setBalanceInTransaction(transaction, userRef, current, current.coinBalance + amount, `Chest: ${chest.title}`, {
      stats: {
        ...current.stats,
        chestsOpened: (current.stats.chestsOpened ?? 0) + 1,
      },
    });
  });
  return { amount, label: chest.title };
}

export const wheelRewards = [
  { amount: 300, label: '+300' },
  { amount: -80, label: '-80' },
  { amount: 180, label: '+180' },
  { amount: 0, label: '0' },
  { amount: 120, label: '+120' },
  { amount: -40, label: '-40' },
  { amount: 50, label: '+50' },
  { amount: 400, label: '+400' },
];

export async function spinWheel(user: UserProfile) {
  const reward = wheelRewards[Math.floor(Math.random() * wheelRewards.length)];
  const userRef = doc(db, 'users', user.uid);
  const claimRef = rewardClaimRef(user.uid, `wheel_${sixHourKey()}`);

  await runTransaction(db, async (transaction) => {
    const [userSnap, claimSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(claimRef),
    ]);
    const current = userSnap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    if (claimSnap.exists() || !canClaimSixHourReward(current.lastWheelSpinAt?.toDate?.() ?? null)) {
      throw new Error('The wheel is cooling down. Available again in 6 hours.');
    }
    transaction.set(claimRef, {
      userId: user.uid,
      username: user.username,
      type: 'wheel',
      label: 'Spin the wheel',
      amount: reward.amount,
      createdAt: serverTimestamp(),
    });
    setBalanceInTransaction(transaction, userRef, current, current.coinBalance + reward.amount, 'Spin the wheel', {
      lastWheelSpinAt: serverTimestamp(),
    });
  });

  return reward.amount;
}

export interface MinigameWinResult {
  payout: number;
  ratingDelta: number;
}

// Arcade games share one settlement path so their balance and rare ELO rewards
// behave consistently.
export async function chargeMinigameStake(user: UserProfile, stake: number) {
  if (stake <= 0) throw new Error('Invalid stake.');
  const userRef = doc(db, 'users', user.uid);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(userRef);
    const current = snap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    if (current.coinBalance < stake) throw new Error('Not enough coins for that stake.');
    setBalanceInTransaction(transaction, userRef, current, current.coinBalance - stake, 'Minigame stake');
  });
}

export async function awardMinigameWin(user: UserProfile, amount: number): Promise<MinigameWinResult> {
  const payout = Math.max(0, Math.round(amount));
  if (payout === 0) return { payout: 0, ratingDelta: 0 };
  const ratingDelta = Math.random() < 0.1 ? 1 + Math.floor(Math.random() * 2) : 0;
  const userRef = doc(db, 'users', user.uid);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(userRef);
    const current = snap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    const nextRating = current.rating + ratingDelta;
    setBalanceInTransaction(transaction, userRef, current, current.coinBalance + payout, 'Minigame payout', {
      ...(ratingDelta > 0 ? { rating: nextRating, rank: rankForRating(nextRating) } : {}),
    });
  });
  return { payout, ratingDelta };
}

export async function chargePlaneStake(user: UserProfile, stake: number) {
  return chargeMinigameStake(user, stake);
}

export async function awardPlaneWin(user: UserProfile, amount: number) {
  return awardMinigameWin(user, amount);
}

export async function listChallengeActivities(user: UserProfile, groups: FriendGroup[] = []) {
  const challengesRef = collection(db, 'challenges');
  const snaps = await Promise.all([
    getDocs(query(challengesRef, where('visibility', '==', 'public'), limit(80))),
    getDocs(query(challengesRef, where('creatorId', '==', user.uid), limit(80))),
    getDocs(query(challengesRef, where('invitedUsernames', 'array-contains', user.username), limit(80))),
  ]);
  return uniqueById(
    snaps.flatMap((snap) => snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ChallengeActivity)),
  );
}

export type ChallengeCommentPage = {
  comments: ChallengeComment[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export async function listChallengeComments(
  challengeId: string,
  cursor?: QueryDocumentSnapshot<DocumentData> | null,
  pageSize = 20,
): Promise<ChallengeCommentPage> {
  const commentsRef = collection(db, 'challenges', challengeId, 'comments');
  const pageQuery = cursor
    ? query(commentsRef, orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize))
    : query(commentsRef, orderBy('createdAt', 'desc'), limit(pageSize));
  const snap = await getDocs(pageQuery);
  return {
    comments: snap.docs
      .map((item) => ({ id: item.id, challengeId, ...item.data() }) as ChallengeComment)
      .reverse(),
    cursor: snap.docs.at(-1) ?? null,
    hasMore: snap.docs.length === pageSize,
  };
}

export async function addChallengeComment(
  challenge: ChallengeActivity,
  user: UserProfile,
  body: string,
) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Write a comment first.');
  if (trimmed.length > 500) throw new Error('Comments can be at most 500 characters.');
  await addDoc(collection(db, 'challenges', challenge.id, 'comments'), {
    challengeId: challenge.id,
    authorId: user.uid,
    authorUsername: user.username,
    authorDisplayName: user.displayName,
    body: trimmed,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const targetUids = new Set<string>([
    challenge.creatorId,
    ...(challenge.completerId ? [challenge.completerId] : []),
    ...await uidsForUsernames(challenge.invitedUsernames ?? []),
  ]);
  await createNotification({
    type: 'challenge_commented',
    actor: user,
    targetUids: [...targetUids],
    title: `New comment on ${challenge.title}`,
    body: `${user.displayName || user.username}: ${trimmed.slice(0, 120)}`,
    url: '/#/challenges',
  });
}

export async function updateChallengeComment(challengeId: string, commentId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('A comment cannot be empty.');
  if (trimmed.length > 500) throw new Error('Comments can be at most 500 characters.');
  await updateDoc(doc(db, 'challenges', challengeId, 'comments', commentId), {
    body: trimmed,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteChallengeComment(challengeId: string, commentId: string) {
  await deleteDoc(doc(db, 'challenges', challengeId, 'comments', commentId));
}

export async function postCompletedChallenge(params: {
  user: UserProfile;
  challenge: WeeklyChallengeDefinition;
  weekKey?: string;
  proofImageUrl: string;
  comment?: string;
  visibility: BetVisibility;
  groupId?: string;
  groups?: FriendGroup[];
  invitedUsernames?: string[];
}) {
  const weekKey = params.weekKey ?? currentWeekKey();
  const valid = weeklyChallengesForUser(params.user, weekKey).some((challenge) => challenge.id === params.challenge.id);
  if (!valid) throw new Error('This is not one of your weekly challenges.');
  const claimRef = rewardClaimRef(params.user.uid, `weekly_${weekKey}_${params.challenge.id}`);
  const audience = challengeAudience(params);
  const totalReward = params.challenge.reward + params.challenge.chestReward;

  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', params.user.uid);
    const [claimSnap, userSnap] = await Promise.all([
      transaction.get(claimRef),
      transaction.get(userRef),
    ]);
    if (claimSnap.exists()) throw new Error('Weekly challenge already completed.');
    const current = userSnap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    transaction.set(claimRef, {
      userId: params.user.uid,
      username: params.user.username,
      type: 'weeklyChallenge',
      label: params.challenge.title,
      amount: totalReward,
      createdAt: serverTimestamp(),
    });
    transaction.set(doc(collection(db, 'challenges')), {
      type: 'completion',
      status: 'completed',
      visibility: audience.visibility,
      title: params.challenge.title,
      body: params.challenge.body,
      comment: params.comment?.trim() || null,
      creatorId: params.user.uid,
      creatorUsername: params.user.username,
      creatorDisplayName: params.user.displayName,
      invitedUsernames: audience.invitedUsernames,
      groupId: audience.groupId,
      completerId: params.user.uid,
      completerUsername: params.user.username,
      completerDisplayName: params.user.displayName,
      systemChallengeId: params.challenge.id,
      weekKey,
      proofImageUrl: params.proofImageUrl,
      reward: params.challenge.reward,
      chestReward: params.challenge.chestReward,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    });
    setBalanceInTransaction(transaction, userRef, current, current.coinBalance + totalReward, `Challenge: ${params.challenge.title}`, {
      stats: {
        ...current.stats,
        challengesCompleted: (current.stats.challengesCompleted ?? 0) + 1,
      },
    });
  });
  await createNotification({
    type: 'challenge_posted',
    actor: params.user,
    targetUids: audience.visibility === 'public'
      ? [ALL_ENABLED_TARGET_UID]
      : [
        params.user.uid,
        ...(await uidsForUsernames(audience.invitedUsernames)),
      ],
    includeActor: true,
    title: `✅ ${params.challenge.title} - Completed!`,
    body: `${params.user.displayName || params.user.username} completed the challenge and earned ${totalReward} coins!`,
    url: '/#/challenges',
  });
}

// Lets the author of a completed challenge edit its caption and who can see it
// after the fact. Reward/claim state is untouched — only the comment and the
// audience (visibility + invited usernames + group) change.
export async function updateChallengeCompletion(params: {
  user: UserProfile;
  challenge: ChallengeActivity;
  comment?: string;
  visibility: BetVisibility;
  groupId?: string;
  groups?: FriendGroup[];
  invitedUsernames?: string[];
}) {
  if (params.challenge.completerId !== params.user.uid && params.challenge.creatorId !== params.user.uid) {
    throw new Error('You can only edit your own completion.');
  }
  const audience = challengeAudience(params);
  await updateDoc(doc(db, 'challenges', params.challenge.id), {
    comment: params.comment?.trim() || null,
    visibility: audience.visibility,
    invitedUsernames: audience.invitedUsernames,
    groupId: audience.groupId,
    updatedAt: serverTimestamp(),
  });
}

export async function legacyPostCompletedChallenge(params: {
  user: UserProfile;
  title: string;
  body?: string;
  proofImageUrl: string;
}) {
  await addDoc(collection(db, 'challenges'), {
    type: 'completion',
    status: 'completed',
    title: params.title.trim(),
    body: params.body?.trim() || null,
    creatorId: params.user.uid,
    creatorUsername: params.user.username,
    creatorDisplayName: params.user.displayName,
    completerId: params.user.uid,
    completerUsername: params.user.username,
    completerDisplayName: params.user.displayName,
    proofImageUrl: params.proofImageUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: serverTimestamp(),
  });

  const userRef = doc(db, 'users', params.user.uid);
  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const current = userSnap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    setBalanceInTransaction(transaction, userRef, current, current.coinBalance + 35, `Challenge: ${params.title}`, {
      stats: {
        ...current.stats,
        challengesCompleted: (current.stats.challengesCompleted ?? 0) + 1,
      },
    });
  });
}

export async function createWagerChallenge(params: {
  user: UserProfile;
  title: string;
  body?: string;
  targetUsername?: string;
  stake: number;
  deadline: Date;
  visibility: BetVisibility;
  groupId?: string;
  groups?: FriendGroup[];
  invitedUsernames?: string[];
}) {
  if (params.stake < 10) throw new Error('Minimum challenge stake is 10 coins.');
  if (params.stake > params.user.coinBalance) throw new Error('Insufficient coins.');
  const normalizedTarget = params.targetUsername?.trim().toLowerCase() || null;
  if (normalizedTarget === params.user.username) throw new Error('You cannot do your own dare.');
  if (params.deadline.getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000) {
    throw new Error('Wager deadline must be at least one week away.');
  }
  const audience = challengeAudience(params);
  if (audience.visibility === 'private' && !audience.groupId && audience.invitedUsernames.length === 0) {
    throw new Error('Invite at least one user for a private wager.');
  }
  const bonus = Math.max(5, Math.round(params.stake * 0.2)) * REWARD_MULTIPLIER;
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', params.user.uid);
    const userSnap = await transaction.get(userRef);
    const current = userSnap.data() as UserProfile | undefined;
    if (!current || current.coinBalance < params.stake) throw new Error('Insufficient coins.');
    setBalanceInTransaction(transaction, userRef, current, current.coinBalance - params.stake, `Wager stake: ${params.title}`);
    transaction.set(doc(collection(db, 'challenges')), {
      type: 'wager',
      status: 'open',
      visibility: audience.visibility,
      title: params.title.trim(),
      body: params.body?.trim() || null,
      creatorId: params.user.uid,
      creatorUsername: params.user.username,
      creatorDisplayName: params.user.displayName,
      invitedUsernames: audience.invitedUsernames,
      groupId: audience.groupId,
      targetUsername: normalizedTarget,
      stake: params.stake,
      bonus,
      deadline: Timestamp.fromDate(params.deadline),
      proofImageUrl: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  const targetUids = audience.visibility === 'public'
    ? [ALL_ENABLED_TARGET_UID]
    : await (async () => {
      const privateTargets = [
        ...await uidsForUsernames([
          ...(normalizedTarget ? [normalizedTarget] : []),
          ...audience.invitedUsernames,
        ]),
      ];

      if (audience.groupId) {
        const groupId = audience.groupId;
        const groupSnap = await getDoc(doc(db, 'friendGroups', groupId));
        if (groupSnap.exists()) {
          const groupData = groupSnap.data() as any;
          if (groupData.memberUids && Array.isArray(groupData.memberUids)) {
            privateTargets.push(...groupData.memberUids);
          }
        }
      }

      return privateTargets;
    })();

  // Remove duplicates
  const uniqueTargetUids = [...new Set(targetUids)].filter(Boolean);

  await createNotification({
    type: 'wager_created',
    actor: params.user,
    targetUids: uniqueTargetUids,
    title: normalizedTarget
      ? `🎯 ${params.title.trim()} - You've been challenged!`
      : `🎮 ${params.title.trim()} - New wager posted!`,
    body: `${params.user.displayName || params.user.username} posted a wager for ${params.stake} coins.${normalizedTarget ? ' You were targeted!' : ''}`,
    url: '/#/challenges',
  });

  // Award daily bonus for creating a challenge
  await awardDailyBonus(params.user, 'challenge');
}

export async function updateWagerChallenge(params: {
  challenge: ChallengeActivity;
  user: UserProfile;
  title: string;
  body?: string;
  stake: number;
  deadline: Date;
}) {
  const { challenge, user, title, body, stake: nextStake, deadline } = params;
  if (challenge.type !== 'wager' || challenge.status !== 'open') throw new Error('Only open wagers can be edited.');
  if (challenge.creatorId !== user.uid) throw new Error('Only the creator can edit this wager.');
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error('Wager title is required.');
  if (trimmedTitle.length > 160) throw new Error('Keep the wager title under 160 characters.');
  if ((body?.trim().length ?? 0) > 1000) throw new Error('Keep proof rules under 1000 characters.');
  if (nextStake < 10) throw new Error('Minimum challenge stake is 10 coins.');
  if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
    throw new Error('Choose a future deadline.');
  }
  const currentDeadline = challenge.deadline?.toDate();
  const deadlineChanged = !currentDeadline || Math.abs(currentDeadline.getTime() - deadline.getTime()) > 60 * 1000;
  if (deadlineChanged && deadline.getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000) {
    throw new Error('A new wager deadline must be at least one week away.');
  }

  const bonus = Math.max(5, Math.round(nextStake * 0.2)) * REWARD_MULTIPLIER;
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', user.uid);
    const challengeRef = doc(db, 'challenges', challenge.id);
    const [userSnap, challengeSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(challengeRef),
    ]);
    const currentUser = userSnap.data() as UserProfile | undefined;
    const currentChallenge = challengeSnap.data() as ChallengeActivity | undefined;
    if (!currentUser || !currentChallenge) throw new Error('Wager not found.');
    if (currentChallenge.status !== 'open' || currentChallenge.creatorId !== user.uid) {
      throw new Error('This wager can no longer be edited.');
    }
    const balanceChange = (currentChallenge.stake ?? 0) - nextStake;
    if (currentUser.coinBalance + balanceChange < 0) throw new Error('Insufficient coins.');
    setBalanceInTransaction(
      transaction,
      userRef,
      currentUser,
      currentUser.coinBalance + balanceChange,
      `Wager stake changed: ${trimmedTitle}`,
    );
    transaction.update(challengeRef, {
      title: trimmedTitle,
      body: body?.trim() || null,
      stake: nextStake,
      bonus,
      deadline: Timestamp.fromDate(deadline),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function completeWagerChallenge(challenge: ChallengeActivity, user: UserProfile, proofImageUrl: string) {
  if (challenge.status !== 'open') throw new Error('Challenge is not open.');
  if (challenge.creatorId === user.uid) throw new Error('You cannot complete your own dare.');
  if (challenge.targetUsername && challenge.targetUsername !== user.username) {
    throw new Error('This challenge is aimed at someone else.');
  }
  const reward = (challenge.stake ?? 0) + (challenge.bonus ?? 0);
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await transaction.get(userRef);
    const current = userSnap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    transaction.update(doc(db, 'challenges', challenge.id), {
      status: 'completed',
      completerId: user.uid,
      completerUsername: user.username,
      completerDisplayName: user.displayName,
      proofImageUrl,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setBalanceInTransaction(transaction, userRef, current, current.coinBalance + reward, `Wager completed: ${challenge.title}`, {
      stats: {
        ...current.stats,
        challengesCompleted: (current.stats.challengesCompleted ?? 0) + 1,
      },
    });
  });
  await createNotification({
    type: 'wager_completed',
    actor: user,
    targetUids: [challenge.creatorId],
    title: `🏆 ${challenge.title} - Completed!`,
    body: `${user.displayName || user.username} completed your wager and earned ${reward} coins!`,
    url: '/#/challenges',
  });
}

export async function failWagerChallenge(challenge: ChallengeActivity, user: UserProfile) {
  if (challenge.status !== 'open') throw new Error('Challenge is not open.');
  if (challenge.creatorId !== user.uid) throw new Error('Only the creator can fail this challenge.');
  const refund = (challenge.stake ?? 0) + Math.max(5, Math.floor((challenge.stake ?? 0) * 0.5));
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await transaction.get(userRef);
    const current = userSnap.data() as UserProfile | undefined;
    if (!current) throw new Error('Profile not found.');
    transaction.update(doc(db, 'challenges', challenge.id), {
      status: 'failed',
      creatorRefund: refund,
      failedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setBalanceInTransaction(transaction, userRef, current, current.coinBalance + refund, `Wager refund: ${challenge.title}`);
  });
  await createNotification({
    type: 'wager_failed',
    actor: user,
    targetUids: challenge.visibility === 'public'
      ? [ALL_ENABLED_TARGET_UID]
      : await uidsForUsernames([
        ...(challenge.targetUsername ? [challenge.targetUsername] : []),
        ...(challenge.invitedUsernames ?? []),
      ]),
    title: `⏳ ${challenge.title} - Wager ended`,
    body: `The wager was closed by ${user.displayName || user.username}. Better luck next time!`,
    url: '/#/challenges',
  });
}
