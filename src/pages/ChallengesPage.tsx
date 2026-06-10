import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Target, Trophy, XCircle } from 'lucide-react';
import { CoinAmount } from '../components/CoinAmount';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { RewardChest } from '../components/RewardChest';
import { StakeInput } from '../components/StakeInput';
import { UsernamePicker } from '../components/UsernamePicker';
import { useAuth } from '../contexts/AuthContext';
import { listMyFriendGroups } from '../services/friendGroupService';
import {
  completeWagerChallenge,
  createWagerChallenge,
  currentWeekKey,
  failWagerChallenge,
  listChallengeActivities,
  postCompletedChallenge,
  weeklyChallengesForUser,
} from '../services/rewardService';
import { getUsersByIds } from '../services/userService';
import type { BetVisibility, ChallengeActivity, FriendGroup } from '../types';
import type { WeeklyChallengeDefinition } from '../services/rewardService';
import { relativeTime } from '../utils/format';
import { downscaleBetImage } from '../utils/image';

function datetimeLocalValue(date?: Date | null) {
  if (!date) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function statusStyle(status: ChallengeActivity['status']) {
  if (status === 'completed') return 'bg-mint/12 text-mint';
  if (status === 'failed') return 'bg-coral/12 text-coral';
  return 'bg-ink/8 text-ink/60';
}

export function ChallengesPage() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ChallengeActivity[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [postVisibility, setPostVisibility] = useState<BetVisibility>('public');
  const [postGroupId, setPostGroupId] = useState('');
  const [activeWeeklyId, setActiveWeeklyId] = useState('');
  const [weeklyModalOpen, setWeeklyModalOpen] = useState(false);
  const [weeklyModalChallenge, setWeeklyModalChallenge] = useState<WeeklyChallengeDefinition | null>(null);
  const [proofByChallenge, setProofByChallenge] = useState<Record<string, string>>({});
  const [commentByChallenge, setCommentByChallenge] = useState<Record<string, string>>({});
  const [weeklyReward, setWeeklyReward] = useState<{ coins: number; chest: number } | null>(null);

  const weekKey = currentWeekKey();
  const weekly = useMemo(
    () => (profile ? weeklyChallengesForUser(profile, weekKey) : []),
    [profile, weekKey],
  );
  const activeWeekly = weekly.find((challenge) => challenge.id === activeWeeklyId) ?? weekly[0];
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'private', label: 'Private' },
    ...groups.map((group) => ({ id: group.id, label: group.name })),
  ];
  const completedWeeklyIds = useMemo(
    () => new Set(
      activities
        .filter((activity) => activity.type === 'completion' && activity.weekKey === weekKey && activity.completerId === profile?.uid)
        .map((activity) => activity.systemChallengeId)
        .filter(Boolean),
    ),
    [activities, profile?.uid, weekKey],
  );
  const completedWeeklyCount = weekly.filter((challenge) => completedWeeklyIds.has(challenge.id)).length;

  async function load() {
    setLoading(true);
    try {
      if (!profile) return;
      const nextGroups = await listMyFriendGroups(profile);
      const nextActivities = await listChallengeActivities(profile, nextGroups);
      const usersById = await getUsersByIds(
        nextActivities.flatMap((activity) => [activity.creatorId, activity.completerId ?? '']),
      );
      const hydratedActivities = nextActivities.map((activity) => {
        const creator = usersById.get(activity.creatorId);
        const completer = activity.completerId ? usersById.get(activity.completerId) : null;
        return {
          ...activity,
          creatorDisplayName: activity.creatorDisplayName ?? creator?.displayName ?? null,
          completerDisplayName: activity.completerDisplayName ?? completer?.displayName ?? null,
        };
      });
      setGroups(nextGroups);
      setActivities(hydratedActivities);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not load challenges.');
      setLoading(false);
    });
  }, [profile]);

  useEffect(() => {
    if (!activeWeeklyId && weekly[0]) setActiveWeeklyId(weekly[0].id);
  }, [activeWeeklyId, weekly]);


  async function processImage(file: File, setter: (value: string) => void) {
    setBusy('image');
    setError('');
    try {
      setter(await downscaleBetImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process image.');
    } finally {
      setBusy('');
    }
  }

  async function completeWeekly(challenge: WeeklyChallengeDefinition) {
    if (!profile) return;
    const proof = proofByChallenge[challenge.id];
    if (!proof) { setError('Add a proof photo for this weekly challenge.'); return; }
    setBusy(`weekly-${challenge.id}`);
    setError('');
    try {
      await postCompletedChallenge({
        user: profile,
        challenge,
        weekKey,
        proofImageUrl: proof,
        comment: commentByChallenge[challenge.id] || undefined,
        visibility: postGroupId ? 'private' : postVisibility,
        groupId: postGroupId || undefined,
        groups,
      });
      setWeeklyReward({ coins: challenge.reward, chest: challenge.chestReward });
      setWeeklyModalChallenge(null);
      setWeeklyModalOpen(false);
      setProofByChallenge((current) => ({ ...current, [challenge.id]: '' }));
      setCommentByChallenge((current) => ({ ...current, [challenge.id]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete weekly challenge.');
    } finally {
      setBusy('');
    }
  }


  async function complete(challenge: ChallengeActivity) {
    if (!profile) return;
    const proof = proofByChallenge[challenge.id];
    if (!proof) { setError('Add a proof photo for this wager.'); return; }
    setBusy(`complete-${challenge.id}`);
    setError('');
    try {
      await completeWagerChallenge(challenge, profile, proof);
      setProofByChallenge((current) => ({ ...current, [challenge.id]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete wager.');
    } finally {
      setBusy('');
    }
  }

  async function fail(challenge: ChallengeActivity) {
    if (!profile) return;
    setBusy(`fail-${challenge.id}`);
    setError('');
    try {
      await failWagerChallenge(challenge, profile);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close wager.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHeader
        title="Challenges"
        description="Weekly proof challenges and coin-backed wagers."
        action={
          <Link
            to="/create-wager"
            className="btn-special inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold"
          >
            <Target size={17} /> Create wager
          </Link>
        }
      />
      {error ? <p className="mb-4 rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              activeTab === tab.id ? 'bg-ink text-white' : 'bg-white text-ink/70 border border-line'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        <section className="space-y-4">
          <section className="rounded-md border border-line bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-citrus/10 text-citrus">
                  <Trophy size={19} />
                </div>
                <div>
                  <h2 className="font-black">Your weekly challenges</h2>
                  <p className="mt-1 text-sm text-ink/55">
                    {completedWeeklyCount}/{weekly.length} completed this week · {weekKey}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWeeklyModalOpen(true)}
                className="btn-special rounded-md px-4 py-3 text-sm font-bold"
              >
                Open weekly challenges
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="px-1 text-sm font-black text-ink/55">Activity</h2>
            {loading ? (
              <div className="h-48 animate-pulse rounded-md bg-white" />
            ) : activities.filter((activity) => {
              if (activeTab === 'all') return true;
              if (activeTab === 'private') return activity.visibility === 'private';
              return activity.groupId === activeTab;
            }).length === 0 ? (
              <EmptyState title="No challenge activity yet" body="Complete a weekly challenge or create a wager." />
            ) : (
              activities.filter((activity) => {
                if (activeTab === 'all') return true;
                if (activeTab === 'private') return activity.visibility === 'private';
                return activity.groupId === activeTab;
              }).map((activity) => {
                const canComplete = activity.type === 'wager'
                  && activity.status === 'open'
                  && activity.creatorId !== profile?.uid
                  && (!activity.targetUsername || activity.targetUsername === profile?.username);
                const canFail = activity.type === 'wager' && activity.status === 'open' && activity.creatorId === profile?.uid;
                const actorId = activity.type === 'completion' ? (activity.completerId || activity.creatorId) : activity.creatorId;
                const actorUsername = activity.type === 'completion'
                  ? (activity.completerUsername || activity.creatorUsername)
                  : activity.creatorUsername;
                const actorDisplayName = activity.type === 'completion'
                  ? (activity.completerDisplayName || activity.completerUsername || activity.creatorDisplayName || activity.creatorUsername)
                  : (activity.creatorDisplayName || activity.creatorUsername);
                return (
                  <article key={activity.id} className="rounded-md border border-line bg-white p-4 shadow-soft">
                    <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                      <div className="min-w-0">
                      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link to={`/profile/${actorId}`} className="text-xs font-semibold text-ink/45 hover:text-ink hover:underline">
                            @{actorUsername}
                          </Link>
                          {activity.type === 'wager' ? (
                            <span className="rounded-full bg-citrus/10 px-2 py-0.5 text-xs font-black text-citrus">wager</span>
                          ) : (
                            <span className="rounded-full bg-mint/10 px-2 py-0.5 text-xs font-black text-mint">weekly</span>
                          )}
                          {activity.groupId && groups.find(g => g.id === activity.groupId) && (
                            <span className="rounded-full bg-field px-2 py-0.5 text-xs font-semibold text-ink/60">
                              {groups.find(g => g.id === activity.groupId)?.name}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-ink/35">
                            {activity.createdAt ? relativeTime(activity.createdAt) : 'just now'}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-black ${statusStyle(activity.status)}`}>
                            {activity.status}
                          </span>
                        </div>
                        {activity.type === 'completion' && activity.reward ? (
                          <div className="inline-flex shrink-0 self-start rounded-md bg-citrus/10 px-2.5 py-1">
                            <CoinAmount amount={activity.reward} className="text-sm" />
                          </div>
                        ) : null}
                      </div>
                      {activity.type === 'completion' ? (
                        <h2 className="text-base leading-snug">
                          <span className="font-black">{actorDisplayName}</span>
                          <span className="font-normal"> completed </span>
                          <span className="font-black">{activity.title}</span>
                        </h2>
                      ) : (
                        <h2 className="text-lg font-black leading-snug">{activity.title}</h2>
                      )}
                      {activity.body ? <p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-ink/65">{activity.body}</p> : null}
                      {activity.comment ? (
                        <p className="mt-2.5 rounded-md bg-field px-3 py-2 text-sm font-semibold leading-5 text-ink/75">
                          {activity.comment}
                        </p>
                      ) : null}
                      {activity.type === 'wager' ? (
                        <div className="mt-3 grid gap-2 rounded-md bg-field p-3 text-sm sm:grid-cols-4">
                          <div>
                            <p className="text-xs font-bold text-ink/40">Stake</p>
                            <CoinAmount amount={activity.stake ?? 0} className="mt-1 text-sm" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-ink/40">Completion bonus</p>
                            <CoinAmount amount={activity.bonus ?? 0} className="mt-1 text-sm" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-ink/40">Target</p>
                            <p className="mt-1 font-bold">@{activity.targetUsername || 'anyone'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-ink/40">Deadline</p>
                            <p className="mt-1 font-bold">{activity.deadline ? relativeTime(activity.deadline) : 'No deadline'}</p>
                          </div>
                        </div>
                      ) : null}
                      </div>
                      {activity.proofImageUrl ? (
                        <img src={activity.proofImageUrl} alt="" className="h-40 w-full rounded-md border border-line object-cover sm:h-36" loading="lazy" />
                      ) : null}
                    </div>
                    <div>
                      {canComplete ? (
                        <div className="mt-3 rounded-md border border-line p-3">
                          <label className="block text-sm font-medium">
                            Proof photo
                            <input
                              className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                              type="file"
                              accept="image/*"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) processImage(file, (value) => setProofByChallenge((current) => ({ ...current, [activity.id]: value })));
                              }}
                            />
                          </label>
                          {proofByChallenge[activity.id] ? <img src={proofByChallenge[activity.id]} alt="" className="mt-2 max-h-40 w-full rounded-md object-cover" /> : null}
                          <button
                            onClick={() => complete(activity)}
                            disabled={!!busy}
                            className="mt-2 inline-flex items-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            <CheckCircle2 size={16} /> Complete wager
                          </button>
                        </div>
                      ) : null}
                      {canFail ? (
                        <button
                          onClick={() => fail(activity)}
                          disabled={!!busy}
                          className="mt-3 inline-flex items-center gap-2 rounded-md border border-coral/30 px-4 py-2 text-sm font-bold text-coral disabled:opacity-50"
                        >
                          <XCircle size={16} /> Claim stake + 50%
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </section>

      </div>

      {weeklyModalChallenge ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg animate-soft-enter rounded-md border border-line bg-white p-5 shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">{weeklyModalChallenge.title}</h2>
                <p className="mt-1 text-sm leading-6 text-ink/60">{weeklyModalChallenge.body}</p>
              </div>
              <button
                type="button"
                onClick={() => setWeeklyModalChallenge(null)}
                className="rounded-md border border-line px-3 py-1.5 text-sm font-bold"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-field p-3">
                <p className="text-xs font-bold text-ink/40">Coins</p>
                <CoinAmount amount={weeklyModalChallenge.reward} className="mt-1 text-sm" />
              </div>
              <div className="rounded-md bg-field p-3">
                <p className="text-xs font-bold text-ink/40">Bonus chest coins</p>
                <CoinAmount amount={weeklyModalChallenge.chestReward} className="mt-1 text-sm" />
              </div>
            </div>
            <label className="mt-4 block text-sm font-medium">
              Post to
              <select
                className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                value={postGroupId || postVisibility}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'public') {
                    setPostVisibility('public');
                    setPostGroupId('');
                  } else {
                    setPostVisibility('private');
                    setPostGroupId(value);
                  }
                }}
              >
                <option value="public">Public</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium">
              Proof photo
              <input
                className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2 text-sm"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) processImage(file, (value) => setProofByChallenge((current) => ({ ...current, [weeklyModalChallenge.id]: value })));
                }}
              />
            </label>
            {proofByChallenge[weeklyModalChallenge.id] ? (
              <img src={proofByChallenge[weeklyModalChallenge.id]} alt="" className="mt-3 h-44 w-full rounded-md object-cover" />
            ) : null}
            <label className="mt-3 block text-sm font-medium">
              Comment
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-line bg-field px-3 py-2 text-sm"
                value={commentByChallenge[weeklyModalChallenge.id] ?? ''}
                onChange={(event) => setCommentByChallenge((current) => ({ ...current, [weeklyModalChallenge.id]: event.target.value }))}
                placeholder="Add a caption, rating, or what happened"
                maxLength={280}
              />
            </label>
            <button
              onClick={() => completeWeekly(weeklyModalChallenge)}
              disabled={!!busy}
              className="btn-special mt-4 w-full rounded-md px-4 py-3 text-sm font-bold disabled:opacity-45"
            >
              {busy === `weekly-${weeklyModalChallenge.id}` ? 'Completing...' : 'Complete challenge'}
            </button>
          </div>
        </div>
      ) : null}

      {weeklyModalOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/55 px-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl animate-soft-enter overflow-y-auto rounded-md border border-line bg-white shadow-lift">
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-white px-5 py-4">
              <Trophy size={19} className="text-citrus" />
              <div>
                <h2 className="text-lg font-black">Weekly challenges</h2>
                <p className="text-xs font-semibold text-ink/45">
                  {completedWeeklyCount}/{weekly.length} complete · {weekKey}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWeeklyModalOpen(false)}
                className="ml-auto rounded-md border border-line px-3 py-1.5 text-sm font-bold"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-[280px_1fr]">
              <div className="grid max-h-[62vh] gap-2 overflow-y-auto pr-1">
                {weekly.map((challenge, index) => {
                  const completed = completedWeeklyIds.has(challenge.id);
                  const active = activeWeekly?.id === challenge.id;
                  return (
                    <button
                      key={challenge.id}
                      type="button"
                      onClick={() => setActiveWeeklyId(challenge.id)}
                      className={`rounded-md border px-3 py-3 text-left transition ${
                        active ? 'border-ink bg-ink text-white' : 'border-line bg-field text-ink hover:bg-white'
                      }`}
                    >
                      <span className="block text-xs font-black opacity-70">#{index + 1} {completed ? 'done' : 'open'}</span>
                      <span className="mt-1 block text-sm font-black leading-tight">{challenge.title}</span>
                    </button>
                  );
                })}
              </div>
              {activeWeekly ? (
                <article className="rounded-md bg-field p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-2xl font-black">{activeWeekly.title}</p>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">{activeWeekly.body}</p>
                    </div>
                    <div className="grid min-w-40 grid-cols-2 gap-2 sm:grid-cols-1">
                      <div className="rounded-md bg-white p-3">
                        <p className="text-xs font-bold text-ink/40">Coins</p>
                        <CoinAmount amount={activeWeekly.reward} className="mt-1 text-sm" />
                      </div>
                      <div className="rounded-md bg-white p-3">
                        <p className="text-xs font-bold text-ink/40">Bonus chest coins</p>
                        <CoinAmount amount={activeWeekly.chestReward} className="mt-1 text-sm" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 rounded-md border border-line bg-white p-4">
                    <p className="text-sm font-bold text-ink/70">
                      Bonus chest coins are extra coins awarded with the challenge. They show in the completion popup as a chest reward.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ink/50">
                      You will choose public or friend-group visibility when you upload proof.
                    </p>
                    <button
                      onClick={() => setWeeklyModalChallenge(activeWeekly)}
                      disabled={completedWeeklyIds.has(activeWeekly.id) || !!busy}
                      className="btn-special mt-4 w-full rounded-md px-4 py-3 text-sm font-bold disabled:opacity-45"
                    >
                      {completedWeeklyIds.has(activeWeekly.id) ? 'Completed' : 'Complete this challenge'}
                    </button>
                  </div>
                </article>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

{weeklyReward ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-reward-pop rounded-md border border-line bg-white p-6 text-center shadow-lift">
            <RewardChest open className="mx-auto mb-4 h-28 w-32" />
            <h2 className="text-xl font-black">Challenge complete</h2>
            <p className="mt-2 text-sm text-ink/60">Coins plus chest bonus unlocked.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-field p-3">
                <p className="text-xs font-bold text-ink/40">Coins</p>
                <CoinAmount amount={weeklyReward.coins} className="mt-1 justify-center text-sm" />
              </div>
              <div className="rounded-md bg-field p-3">
                <p className="text-xs font-bold text-ink/40">Chest</p>
                <CoinAmount amount={weeklyReward.chest} className="mt-1 justify-center text-sm" />
              </div>
            </div>
            <button
              onClick={() => setWeeklyReward(null)}
              className="mt-5 w-full rounded-md border border-line bg-white px-4 py-3 text-sm font-bold text-ink hover:bg-field transition"
            >
              Nice
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
