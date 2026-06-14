import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3, ImagePlus, MessageCircle, Pencil, Send, Target, Trash2, Trophy, Users, X, XCircle } from 'lucide-react';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { CoinAmount } from '../components/CoinAmount';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { RewardChest } from '../components/RewardChest';
import { ZoomableImage } from '../components/Lightbox';
import { StakeInput } from '../components/StakeInput';
import { useAuth } from '../contexts/AuthContext';
import { listMyFriendGroups } from '../services/friendGroupService';
import {
  completeWagerChallenge,
  addChallengeComment,
  currentWeekKey,
  deleteChallengeComment,
  failWagerChallenge,
  listChallengeActivities,
  listChallengeComments,
  postCompletedChallenge,
  updateChallengeCompletion,
  updateChallengeComment,
  updateWagerChallenge,
  weeklyChallengesForUser,
} from '../services/rewardService';
import { getUsersByIds } from '../services/userService';
import type { BetVisibility, ChallengeActivity, ChallengeComment, FriendGroup } from '../types';
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
  const [activities, setActivities] = useState<ChallengeActivity[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [topTab, setTopTab] = useState<'wagers' | 'activity'>('wagers');
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
  const [editChallenge, setEditChallenge] = useState<ChallengeActivity | null>(null);
  const [editComment, setEditComment] = useState('');
  const [editVisibility, setEditVisibility] = useState<BetVisibility>('public');
  const [editGroupId, setEditGroupId] = useState('');
  const [stakeEditChallenge, setStakeEditChallenge] = useState<ChallengeActivity | null>(null);
  const [editWagerTitle, setEditWagerTitle] = useState('');
  const [editWagerBody, setEditWagerBody] = useState('');
  const [editWagerDeadline, setEditWagerDeadline] = useState('');
  const [editStake, setEditStake] = useState(10);
  const [commentChallenge, setCommentChallenge] = useState<ChallengeActivity | null>(null);
  const [challengeComments, setChallengeComments] = useState<ChallengeComment[]>([]);
  const [commentCursor, setCommentCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [commentsHaveMore, setCommentsHaveMore] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [editingThreadCommentId, setEditingThreadCommentId] = useState('');
  const [editingThreadCommentBody, setEditingThreadCommentBody] = useState('');
  const [recentCommentsByChallenge, setRecentCommentsByChallenge] = useState<Record<string, ChallengeComment[]>>({});
  const [completingWagerId, setCompletingWagerId] = useState('');

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

  const visibleActivities = activities.filter((activity) => {
    const matchesTopTab = topTab === 'wagers' ? activity.type === 'wager' : activity.type !== 'wager';
    if (!matchesTopTab) return false;
    if (activeTab === 'all') return true;
    if (activeTab === 'private') return activity.visibility === 'private';
    return activity.groupId === activeTab;
  });
  const visibleActivityIds = visibleActivities.map((activity) => activity.id).join('|');

  useEffect(() => {
    const missingIds = visibleActivities
      .map((activity) => activity.id)
      .filter((id) => recentCommentsByChallenge[id] === undefined);
    if (missingIds.length === 0) return;
    let cancelled = false;
    void Promise.all(missingIds.map(async (id) => {
      const page = await listChallengeComments(id, null, 2);
      return [id, page.comments] as const;
    })).then((entries) => {
      if (cancelled) return;
      setRecentCommentsByChallenge((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load recent comments.');
    });
    return () => {
      cancelled = true;
    };
  // The joined id list is the stable identity of the currently visible cards.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleActivityIds]);

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

  function openEdit(challenge: ChallengeActivity) {
    setEditChallenge(challenge);
    setEditComment(challenge.comment ?? '');
    setEditVisibility(challenge.visibility);
    setEditGroupId(challenge.groupId ?? '');
  }

  async function saveEdit() {
    if (!profile || !editChallenge) return;
    setBusy(`edit-${editChallenge.id}`);
    setError('');
    try {
      await updateChallengeCompletion({
        user: profile,
        challenge: editChallenge,
        comment: editComment || undefined,
        visibility: editGroupId ? 'private' : editVisibility,
        groupId: editGroupId || undefined,
        groups,
      });
      setEditChallenge(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update completion.');
    } finally {
      setBusy('');
    }
  }

  function openWagerEdit(challenge: ChallengeActivity) {
    setStakeEditChallenge(challenge);
    setEditWagerTitle(challenge.title);
    setEditWagerBody(challenge.body ?? '');
    setEditWagerDeadline(datetimeLocalValue(challenge.deadline?.toDate() ?? null));
    setEditStake(challenge.stake ?? 10);
  }

  async function saveWagerEdit() {
    if (!profile || !stakeEditChallenge) return;
    setBusy(`stake-${stakeEditChallenge.id}`);
    setError('');
    try {
      await updateWagerChallenge({
        challenge: stakeEditChallenge,
        user: profile,
        title: editWagerTitle,
        body: editWagerBody || undefined,
        stake: editStake,
        deadline: new Date(editWagerDeadline),
      });
      setStakeEditChallenge(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update wager stake.');
    } finally {
      setBusy('');
    }
  }

  async function openComments(challenge: ChallengeActivity) {
    setCommentChallenge(challenge);
    setEditingThreadCommentId('');
    setEditingThreadCommentBody('');
    setChallengeComments([]);
    setCommentCursor(null);
    setCommentsHaveMore(false);
    setCommentsLoading(true);
    try {
      const page = await listChallengeComments(challenge.id);
      setChallengeComments(page.comments);
      setCommentCursor(page.cursor);
      setCommentsHaveMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load comments.');
    } finally {
      setCommentsLoading(false);
    }
  }

  async function refreshComments(challenge: ChallengeActivity) {
    const [thread, recent] = await Promise.all([
      listChallengeComments(challenge.id),
      listChallengeComments(challenge.id, null, 2),
    ]);
    setChallengeComments(thread.comments);
    setCommentCursor(thread.cursor);
    setCommentsHaveMore(thread.hasMore);
    setRecentCommentsByChallenge((current) => ({ ...current, [challenge.id]: recent.comments }));
  }

  async function loadOlderComments() {
    if (!commentChallenge || !commentCursor || commentsLoading) return;
    setCommentsLoading(true);
    try {
      const page = await listChallengeComments(commentChallenge.id, commentCursor);
      setChallengeComments((current) => [...page.comments, ...current]);
      setCommentCursor(page.cursor);
      setCommentsHaveMore(page.hasMore);
    } finally {
      setCommentsLoading(false);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!profile || !commentChallenge || !newComment.trim()) return;
    setBusy(`comment-${commentChallenge.id}`);
    try {
      await addChallengeComment(commentChallenge, profile, newComment);
      setNewComment('');
      await refreshComments(commentChallenge);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post comment.');
    } finally {
      setBusy('');
    }
  }

  async function saveThreadComment(comment: ChallengeComment) {
    if (!commentChallenge || !editingThreadCommentBody.trim()) return;
    setBusy(`edit-comment-${comment.id}`);
    setError('');
    try {
      await updateChallengeComment(commentChallenge.id, comment.id, editingThreadCommentBody);
      setEditingThreadCommentId('');
      setEditingThreadCommentBody('');
      await refreshComments(commentChallenge);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update comment.');
    } finally {
      setBusy('');
    }
  }

  async function removeThreadComment(comment: ChallengeComment) {
    if (!commentChallenge) return;
    setBusy(`delete-comment-${comment.id}`);
    setError('');
    try {
      await deleteChallengeComment(commentChallenge.id, comment.id);
      await refreshComments(commentChallenge);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete comment.');
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

      {/* Weekly challenges — always pinned on top, above the tabs. */}
      <section className="mb-4 rounded-md border border-line bg-white p-4">
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

      <div className="mb-3 flex gap-2">
        {([
          { id: 'wagers', label: 'Wagers' },
          { id: 'activity', label: 'Activity' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTopTab(tab.id)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-black transition ${
              topTab === tab.id ? 'bg-ink text-white' : 'bg-white text-ink/65 border border-line'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
          <section className="space-y-3">
            {loading ? (
              <div className="h-48 animate-pulse rounded-md bg-white" />
            ) : visibleActivities.length === 0 ? (
              <EmptyState
                title={topTab === 'wagers' ? 'No wagers yet' : 'No activity yet'}
                body={topTab === 'wagers' ? 'Create a coin-backed wager to get started.' : 'Complete a weekly challenge to see it here.'}
              />
            ) : (
              visibleActivities.map((activity, activityIndex) => {
                const canComplete = activity.type === 'wager'
                  && activity.status === 'open'
                  && activity.creatorId !== profile?.uid
                  && (!activity.targetUsername || activity.targetUsername === profile?.username);
                const canFail = activity.type === 'wager' && activity.status === 'open' && activity.creatorId === profile?.uid;
                const canEditCompletion = activity.type === 'completion'
                  && (activity.completerId === profile?.uid || activity.creatorId === profile?.uid);
                const canEditWager = activity.type === 'wager'
                  && activity.status === 'open'
                  && activity.creatorId === profile?.uid;
                const actorId = activity.type === 'completion' ? (activity.completerId || activity.creatorId) : activity.creatorId;
                const actorUsername = activity.type === 'completion'
                  ? (activity.completerUsername || activity.creatorUsername)
                  : activity.creatorUsername;
                const actorDisplayName = activity.type === 'completion'
                  ? (activity.completerDisplayName || activity.completerUsername || activity.creatorDisplayName || activity.creatorUsername)
                  : (activity.creatorDisplayName || activity.creatorUsername);
                const recentComments = recentCommentsByChallenge[activity.id] ?? [];
                if (activity.type === 'wager') {
                  const group = activity.groupId ? groups.find((item) => item.id === activity.groupId) : null;
                  const completionReward = (activity.stake ?? 0) + (activity.bonus ?? 0);
                  const completionOpen = completingWagerId === activity.id;
                  return (
                    <article
                      key={activity.id}
                      className="challenge-feed-card group min-w-0 max-w-full overflow-hidden rounded-md border border-line bg-white shadow-soft"
                      style={{ animationDelay: `${Math.min(activityIndex, 8) * 45}ms` }}
                    >
                      <div className="min-w-0 border-b border-line px-4 py-4 sm:px-5">
                        <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
                          <div className="challenge-card-icon grid h-10 w-10 shrink-0 place-items-center rounded-md bg-citrus/12 text-citrus">
                            <Target size={19} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                              <Link to={`/profile/${activity.creatorId}`} className="font-black text-ink/70 hover:underline">
                                {activity.creatorDisplayName || activity.creatorUsername}
                              </Link>
                              <span className="font-semibold text-ink/35">@{activity.creatorUsername}</span>
                              <span className="font-semibold text-ink/35">{activity.createdAt ? relativeTime(activity.createdAt) : 'just now'}</span>
                              {group ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-field px-2 py-0.5 font-bold text-ink/50">
                                  <Users size={11} /> {group.name}
                                </span>
                              ) : null}
                            </div>
                            <h2 className="mt-1.5 break-words text-lg font-black leading-snug [overflow-wrap:anywhere]">{activity.title}</h2>
                            {activity.body ? (
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-ink/60 [overflow-wrap:anywhere]">{activity.body}</p>
                            ) : null}
                          </div>
                          <div className="col-start-2 row-start-2 mt-2 flex min-w-0 items-center gap-1 sm:col-start-3 sm:row-start-1 sm:mt-0">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusStyle(activity.status)}`}>
                              {activity.status}
                            </span>
                            {canEditWager ? (
                              <button
                                type="button"
                                onClick={() => openWagerEdit(activity)}
                                className="grid h-8 w-8 place-items-center rounded-md text-ink/40 transition hover:bg-field hover:text-ink"
                                aria-label="Edit wager"
                              >
                                <Pencil size={15} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-px bg-line sm:grid-cols-3">
                        <div className="bg-field/65 px-4 py-3">
                          <p className="text-xs font-bold text-ink/40">Target</p>
                          <p className="mt-1 text-sm font-black">@{activity.targetUsername || 'anyone invited'}</p>
                        </div>
                        <div className="bg-field/65 px-4 py-3">
                          <p className="text-xs font-bold text-ink/40">Reward if completed</p>
                          <CoinAmount amount={completionReward} className="mt-1 text-sm" />
                        </div>
                        <div className="bg-field/65 px-4 py-3">
                          <p className="text-xs font-bold text-ink/40">Deadline</p>
                          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-black">
                            <Clock3 size={14} className="text-ink/40" />
                            {activity.deadline ? relativeTime(activity.deadline) : 'No deadline'}
                          </p>
                        </div>
                      </div>

                      {activity.proofImageUrl ? (
                        <div className="border-t border-line p-4">
                          <ZoomableImage src={activity.proofImageUrl} alt="Wager proof" className="h-40 w-full rounded-md border border-line object-cover sm:h-48" loading="lazy" />
                        </div>
                      ) : null}

                      {recentComments.length > 0 ? (
                        <div className="space-y-2 border-t border-line px-4 py-3">
                          {recentComments.map((comment) => (
                            <button
                              key={comment.id}
                              type="button"
                              onClick={() => void openComments(activity)}
                              className="challenge-comment-preview block w-full rounded-md bg-field px-3 py-2 text-left"
                            >
                              <span className="text-xs font-black text-ink/65">{comment.authorDisplayName || comment.authorUsername}</span>
                              <span className="ml-2 break-words text-sm text-ink/60 [overflow-wrap:anywhere]">{comment.body}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {completionOpen && canComplete ? (
                        <div className="animate-action-reveal border-t border-line bg-field/55 p-4">
                          <div className="flex items-center gap-2 text-sm font-black">
                            <ImagePlus size={17} className="text-mint" /> Add proof to complete
                          </div>
                          <input
                            className="mt-3 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) processImage(file, (value) => setProofByChallenge((current) => ({ ...current, [activity.id]: value })));
                            }}
                          />
                          {proofByChallenge[activity.id] ? (
                            <ZoomableImage src={proofByChallenge[activity.id]} alt="Selected proof" className="mt-3 h-36 w-full rounded-md object-cover" />
                          ) : null}
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setCompletingWagerId('')}
                              className="flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm font-bold text-ink/60"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => complete(activity)}
                              disabled={!!busy || !proofByChallenge[activity.id]}
                              className="flex-1 rounded-md bg-mint px-3 py-2 text-sm font-black text-white disabled:opacity-40"
                            >
                              Complete for <CoinAmount amount={completionReward} className="text-sm text-white" />
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid min-w-0 gap-2 border-t border-line px-4 py-3 sm:flex sm:flex-wrap sm:items-center">
                        {canComplete && !completionOpen ? (
                          <button
                            type="button"
                            onClick={() => setCompletingWagerId(activity.id)}
                            className="inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-black text-white"
                          >
                            <CheckCircle2 size={16} /> Complete wager
                          </button>
                        ) : null}
                        {canFail ? (
                          <button
                            type="button"
                            onClick={() => fail(activity)}
                            disabled={!!busy}
                            className="inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-md border border-coral/25 px-4 py-2 text-sm font-black text-coral disabled:opacity-40"
                          >
                            <XCircle size={16} /> Claim <CoinAmount amount={Math.round((activity.stake ?? 0) * 1.5)} className="text-sm text-coral" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void openComments(activity)}
                          className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-ink/55 transition hover:bg-field hover:text-ink sm:ml-auto"
                        >
                          <MessageCircle size={16} /> Comments
                        </button>
                      </div>
                    </article>
                  );
                }
                const completionGroup = activity.groupId ? groups.find((item) => item.id === activity.groupId) : null;
                return (
                  <article
                    key={activity.id}
                    className="challenge-feed-card group overflow-hidden rounded-md border border-line bg-white shadow-soft"
                    style={{ animationDelay: `${Math.min(activityIndex, 8) * 45}ms` }}
                  >
                    <div className="border-b border-line px-4 py-4 sm:px-5">
                      <div className="flex items-start gap-3">
                        <div className="challenge-card-icon grid h-10 w-10 shrink-0 place-items-center rounded-md bg-mint/12 text-mint">
                          <Trophy size={19} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <Link to={`/profile/${actorId}`} className="font-black text-ink/70 hover:underline">
                              {actorDisplayName}
                            </Link>
                            <span className="font-semibold text-ink/35">@{actorUsername}</span>
                            <span className="font-semibold text-ink/35">{activity.createdAt ? relativeTime(activity.createdAt) : 'just now'}</span>
                            {completionGroup ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-field px-2 py-0.5 font-bold text-ink/50">
                                <Users size={11} /> {completionGroup.name}
                              </span>
                            ) : null}
                          </div>
                          <h2 className="mt-1.5 text-lg font-black leading-snug">{activity.title}</h2>
                          {activity.body ? (
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-ink/60 [overflow-wrap:anywhere]">{activity.body}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusStyle(activity.status)}`}>
                            {activity.status}
                          </span>
                          {canEditCompletion ? (
                            <button
                              type="button"
                              onClick={() => openEdit(activity)}
                              disabled={!!busy}
                              className="grid h-8 w-8 place-items-center rounded-md text-ink/40 transition hover:bg-field hover:text-ink disabled:opacity-40"
                              aria-label="Edit completion"
                            >
                              <Pencil size={15} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-px bg-line sm:grid-cols-3">
                      <div className="bg-field/65 px-4 py-3">
                        <p className="text-xs font-bold text-ink/40">Completed by</p>
                        <p className="mt-1 text-sm font-black">{actorDisplayName}</p>
                      </div>
                      <div className="bg-field/65 px-4 py-3">
                        <p className="text-xs font-bold text-ink/40">Coins earned</p>
                        <CoinAmount amount={(activity.reward ?? 0) + (activity.chestReward ?? 0)} className="mt-1 text-sm" />
                      </div>
                      <div className="bg-field/65 px-4 py-3">
                        <p className="text-xs font-bold text-ink/40">Completed</p>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-black">
                          <Clock3 size={14} className="text-ink/40" />
                          {activity.completedAt ? relativeTime(activity.completedAt) : relativeTime(activity.createdAt)}
                        </p>
                      </div>
                    </div>

                    {(activity.proofImageUrl || activity.comment) ? (
                      <div className={`grid gap-4 border-t border-line p-4 ${activity.proofImageUrl && activity.comment ? 'sm:grid-cols-[180px_1fr]' : ''}`}>
                        {activity.proofImageUrl ? (
                          <ZoomableImage src={activity.proofImageUrl} alt="Challenge proof" className="h-44 w-full rounded-md border border-line object-cover" loading="lazy" />
                        ) : null}
                        {activity.comment ? (
                          <div className="self-center rounded-md bg-field px-4 py-3">
                            <p className="text-xs font-black uppercase text-ink/35">Completion note</p>
                            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink/70 [overflow-wrap:anywhere]">{activity.comment}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {recentComments.length > 0 ? (
                      <div className="space-y-2 border-t border-line px-4 py-3">
                        {recentComments.map((comment) => (
                          <button
                            key={comment.id}
                            type="button"
                            onClick={() => void openComments(activity)}
                            className="challenge-comment-preview block w-full rounded-md bg-field px-3 py-2 text-left"
                          >
                            <span className="text-xs font-black text-ink/65">{comment.authorDisplayName || comment.authorUsername}</span>
                            <span className="ml-2 break-words text-sm text-ink/60 [overflow-wrap:anywhere]">{comment.body}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex items-center border-t border-line px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void openComments(activity)}
                        className="ml-auto inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-ink/55 transition hover:bg-field hover:text-ink active:scale-95"
                      >
                        <MessageCircle size={16} /> Comments
                      </button>
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
              <ZoomableImage src={proofByChallenge[weeklyModalChallenge.id]} alt="" className="mt-3 h-44 w-full rounded-md object-cover" />
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

      {editChallenge ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg animate-soft-enter rounded-md border border-line bg-white p-5 shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Edit completion</h2>
                <p className="mt-1 text-sm text-ink/55">{editChallenge.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditChallenge(null)}
                className="rounded-md border border-line px-3 py-1.5 text-sm font-bold"
              >
                Close
              </button>
            </div>
            <label className="mt-4 block text-sm font-medium">
              Visibility
              <select
                className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                value={editGroupId || editVisibility}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'public') {
                    setEditVisibility('public');
                    setEditGroupId('');
                  } else {
                    setEditVisibility('private');
                    setEditGroupId(value);
                  }
                }}
              >
                <option value="public">Public</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium">
              Comment
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-line bg-field px-3 py-2 text-sm"
                value={editComment}
                onChange={(event) => setEditComment(event.target.value)}
                placeholder="Add a caption, rating, or what happened"
                maxLength={280}
              />
            </label>
            <button
              onClick={saveEdit}
              disabled={!!busy}
              className="btn-special mt-4 w-full rounded-md px-4 py-3 text-sm font-bold disabled:opacity-45"
            >
              {busy === `edit-${editChallenge.id}` ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : null}

      {stakeEditChallenge ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/55 sm:grid sm:place-items-center sm:px-4 sm:backdrop-blur-sm">
          <div className="flex max-h-[92dvh] w-full max-w-lg animate-soft-enter flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-lift sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-lg font-black">Edit wager</h2>
                <p className="mt-1 text-sm text-ink/55">Update the challenge and its terms.</p>
              </div>
              <button type="button" onClick={() => setStakeEditChallenge(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-field transition hover:bg-line active:scale-95">
                <X size={17} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              <label className="block text-sm font-medium">
                Title
                <input
                  value={editWagerTitle}
                  onChange={(event) => setEditWagerTitle(event.target.value)}
                  maxLength={160}
                  className="mt-1 w-full min-w-0 rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
                  required
                />
              </label>
              <label className="block text-sm font-medium">
                Proof rules
                <textarea
                  value={editWagerBody}
                  onChange={(event) => setEditWagerBody(event.target.value)}
                  maxLength={1000}
                  className="mt-1 min-h-24 w-full min-w-0 resize-y rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
                  placeholder="What counts as proof?"
                />
              </label>
              <div className="min-w-0">
                <StakeInput label="Stake" value={editStake} min={10} step={10} onChange={(value) => setEditStake(Math.max(10, Math.round(value)))} />
              </div>
              <label className="block min-w-0 text-sm font-medium">
                Deadline
                <input
                  type="datetime-local"
                  value={editWagerDeadline}
                  onChange={(event) => setEditWagerDeadline(event.target.value)}
                  className="mt-1 block w-full min-w-0 max-w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
                  required
                />
                <p className="mt-1 text-xs text-ink/45">A changed deadline must be at least one week away.</p>
              </label>
              <p className="rounded-md bg-field px-3 py-2 text-sm text-ink/55">
                Completion bonus: <CoinAmount amount={Math.max(5, Math.round(editStake * 0.2)) * 2} className="ml-1 text-sm" />
              </p>
            </div>
            <div className="shrink-0 border-t border-line bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
              <button
                onClick={saveWagerEdit}
                disabled={!!busy || !editWagerTitle.trim() || !editWagerDeadline}
                className="btn-special w-full rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-45"
              >
                {busy === `stake-${stakeEditChallenge.id}` ? 'Saving...' : 'Save wager'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {commentChallenge ? (
        <div className="fixed inset-0 z-[70] flex animate-fade-in items-end justify-center bg-ink/55 sm:grid sm:place-items-center sm:px-4 sm:backdrop-blur-sm">
          <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-lift animate-soft-enter sm:h-[72dvh] sm:max-h-[760px] sm:max-w-5xl sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg font-black">Comments</h2>
                <p className="truncate text-sm text-ink/50">{commentChallenge.title}</p>
              </div>
              <button type="button" onClick={() => setCommentChallenge(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-field transition hover:bg-line active:scale-95">
                <X size={17} />
              </button>
            </div>
            <div className="min-h-48 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:px-6 sm:py-5">
              {commentsHaveMore ? (
                <button onClick={loadOlderComments} disabled={commentsLoading} className="mx-auto block rounded-md bg-field px-3 py-2 text-xs font-bold text-ink/60">
                  {commentsLoading ? 'Loading...' : 'Load older comments'}
                </button>
              ) : null}
              {!commentsLoading && challengeComments.length === 0 ? (
                <p className="py-10 text-center text-sm font-semibold text-ink/40">No comments yet.</p>
              ) : challengeComments.map((comment, commentIndex) => {
                const canEdit = comment.authorId === profile?.uid;
                const canDelete = canEdit || profile?.isAdmin;
                const isEditing = editingThreadCommentId === comment.id;
                return (
                  <div
                    key={comment.id}
                    className="animate-comment-enter rounded-md bg-field px-3 py-2.5 sm:px-4 sm:py-3"
                    style={{ animationDelay: `${Math.min(commentIndex, 10) * 35}ms` }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <p className="text-sm font-black">{comment.authorDisplayName || comment.authorUsername}</p>
                          <span className="text-xs text-ink/35">{comment.createdAt ? relativeTime(comment.createdAt) : 'just now'}</span>
                          {comment.updatedAt && comment.createdAt && comment.updatedAt.toMillis() > comment.createdAt.toMillis() + 1000 ? (
                            <span className="text-xs font-semibold text-ink/35">edited</span>
                          ) : null}
                        </div>
                        {isEditing ? (
                          <div className="animate-action-reveal mt-2">
                            <textarea
                              value={editingThreadCommentBody}
                              onChange={(event) => setEditingThreadCommentBody(event.target.value)}
                              maxLength={500}
                              className="min-h-20 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm"
                            />
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingThreadCommentId('');
                                  setEditingThreadCommentBody('');
                                }}
                                className="rounded-md px-3 py-1.5 text-xs font-bold text-ink/55"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveThreadComment(comment)}
                                disabled={!editingThreadCommentBody.trim() || !!busy}
                                className="rounded-md bg-ink px-3 py-1.5 text-xs font-black text-white disabled:opacity-40"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-ink/70">{comment.body}</p>
                        )}
                      </div>
                      {!isEditing && (canEdit || canDelete) ? (
                        <div className="flex shrink-0">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingThreadCommentId(comment.id);
                                setEditingThreadCommentBody(comment.body);
                              }}
                              className="grid h-8 w-8 place-items-center rounded-md text-ink/35 hover:bg-white hover:text-ink"
                              aria-label="Edit comment"
                            >
                              <Pencil size={14} />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => void removeThreadComment(comment)}
                              disabled={busy === `delete-comment-${comment.id}`}
                              className="grid h-8 w-8 place-items-center rounded-md text-ink/35 hover:bg-white hover:text-coral disabled:opacity-40"
                              aria-label="Delete comment"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <form onSubmit={submitComment} className="flex shrink-0 gap-2 border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
              <input
                value={newComment}
                onChange={(event) => setNewComment(event.target.value)}
                maxLength={500}
                placeholder="Write a comment"
                className="min-w-0 flex-1 rounded-md border border-line bg-field px-3 py-2.5 text-sm"
              />
              <button type="submit" disabled={!newComment.trim() || !!busy} className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40" aria-label="Post comment">
                <Send size={17} />
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
