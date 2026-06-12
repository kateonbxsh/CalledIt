import {
  collection,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { createNotification } from './notificationService';
import type { DailyBonus, UserProfile } from '../types';

// Bonus amounts for each action type
const BONUS_AMOUNTS = {
  bet: 50,        // Create a bet
  challenge: 50,  // Create a challenge/wager
  prediction: 25, // Make a prediction
  comment: 10,    // Comment on a bet
};

function getTodayUTC(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function awardDailyBonus(
  user: UserProfile,
  bonusType: 'bet' | 'challenge' | 'prediction' | 'comment',
): Promise<{ awarded: boolean; amount: number; reason?: string }> {
  const bonusAmount = BONUS_AMOUNTS[bonusType];
  const dateKey = getTodayUTC();
  const userRef = doc(db, 'users', user.uid);
  const dailyBonusRef = doc(db, 'users', user.uid, 'dailyBonuses', dateKey);

  try {
    let awarded = false;
    let actualAmount = bonusAmount;

    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const bonusSnap = await transaction.get(dailyBonusRef);

      if (!userSnap.exists()) throw new Error('User not found');

      const currentUser = userSnap.data() as UserProfile;
      const dailyBonuses = bonusSnap.exists()
        ? (bonusSnap.data() as any).bonuses || []
        : [];

      // Check if this bonus type was already claimed today
      const alreadyClaimed = dailyBonuses.some((b: DailyBonus) => b.type === bonusType);

      if (alreadyClaimed) {
        awarded = false;
        actualAmount = 0;
        return;
      }

      // Award the bonus
      const newBonus: DailyBonus = {
        type: bonusType,
        amount: bonusAmount,
        claimedAt: Timestamp.now(),
      };

      const updatedBonuses = [...dailyBonuses, newBonus];
      const totalClaimed = updatedBonuses.reduce((sum: number, b: DailyBonus) => sum + b.amount, 0);

      // Update user coins
      transaction.update(userRef, {
        coinBalance: increment(bonusAmount),
        updatedAt: serverTimestamp(),
      });

      // Update daily bonus tracker
      transaction.set(
        dailyBonusRef,
        {
          dateKey,
          bonuses: updatedBonuses,
          totalClaimed,
          updatedAt: serverTimestamp(),
        },
        { merge: false },
      );

      awarded = true;
    });

    if (awarded) {
      // Send notification
      await createNotification({
        type: 'reward_available',
        actor: user,
        targetUids: [user.uid],
        includeActor: true,
        title: `💰 Daily bonus earned! +${bonusAmount} coins`,
        body: `You earned a bonus for ${bonusType}ing today. Keep up the activity!`,
        url: '/#/me',
      });
    }

    return {
      awarded,
      amount: awarded ? bonusAmount : 0,
      reason: awarded ? undefined : `${bonusType} bonus already claimed today`,
    };
  } catch (error) {
    console.error('Error awarding bonus:', error);
    return { awarded: false, amount: 0, reason: 'Error processing bonus' };
  }
}

export async function getDailyBonusProgress(uid: string) {
  const dateKey = getTodayUTC();
  const dailyBonusRef = doc(db, 'users', uid, 'dailyBonuses', dateKey);

  try {
    const snap = await getDoc(dailyBonusRef);
    if (!snap.exists()) {
      return {
        totalClaimed: 0,
        bonuses: [],
        potential: Object.values(BONUS_AMOUNTS).reduce((a, b) => a + b, 0),
        bonusAmounts: BONUS_AMOUNTS,
      };
    }

    const data = snap.data() as any;
    const totalPotential = Object.values(BONUS_AMOUNTS).reduce((a, b) => a + b, 0);

    return {
      totalClaimed: data.totalClaimed || 0,
      bonuses: data.bonuses || [],
      potential: totalPotential - (data.totalClaimed || 0),
      bonusAmounts: BONUS_AMOUNTS,
      claimedTypes: (data.bonuses || []).map((b: DailyBonus) => b.type),
    };
  } catch (error) {
    console.error('Error getting bonus progress:', error);
    return {
      totalClaimed: 0,
      bonuses: [],
      potential: Object.values(BONUS_AMOUNTS).reduce((a, b) => a + b, 0),
      bonusAmounts: BONUS_AMOUNTS,
    };
  }
}
