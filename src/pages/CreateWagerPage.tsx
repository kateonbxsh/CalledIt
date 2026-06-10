import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { Target } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StakeInput } from '../components/StakeInput';
import { UsernamePicker } from '../components/UsernamePicker';
import { useAuth } from '../contexts/AuthContext';
import { createWagerChallenge } from '../services/rewardService';
import { listMyFriendGroups } from '../services/friendGroupService';
import type { BetVisibility, FriendGroup } from '../types';

function datetimeLocalValue(date?: Date | null) {
  if (!date) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function CreateWagerPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetUsername, setTargetUsername] = useState('');
  const [stake, setStake] = useState(50);
  const [deadline, setDeadline] = useState(datetimeLocalValue(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)));
  const [visibility, setVisibility] = useState<BetVisibility>('public');
  const [groupId, setGroupId] = useState('');
  const [invited, setInvited] = useState<string[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      listMyFriendGroups(profile).then(setGroups).catch(() => {});
    }
  }, [profile]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (!title.trim()) {
      setError('Challenge description is required');
      return;
    }
    const deadlineDate = new Date(deadline);
    const oneWeekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (deadlineDate <= oneWeekFromNow) {
      setError('Deadline must be at least one week away');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await createWagerChallenge({
        user: profile,
        title: title.trim(),
        body: body.trim() || undefined,
        targetUsername: targetUsername.trim() || undefined,
        stake,
        deadline: deadlineDate,
        visibility: groupId ? 'private' : visibility,
        groupId: groupId || undefined,
        groups,
        invitedUsernames: invited,
      });
      navigate('/challenges');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create wager');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Create Wager"
        description="Challenge a friend or the community to complete a task"
      />

      <form onSubmit={submit} className="space-y-4 sm:space-y-4" style={{ minHeight: 'auto' }}>
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Target size={20} className="text-citrus" />
            <h2 className="font-black">Challenge details</h2>
          </div>

          <label className="block text-sm font-medium">
            What's the challenge?
            <input
              className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Run 5k before Friday"
              required
            />
            <p className="mt-1 text-xs text-ink/45">Be specific about what counts as success</p>
          </label>

          <label className="mt-4 block text-sm font-medium">
            Proof rules
            <textarea
              className="mt-1 min-h-24 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What counts as proof? (optional)"
            />
            <p className="mt-1 text-xs text-ink/45">Describe what kind of proof you'll accept</p>
          </label>

          <label className="mt-4 block text-sm font-medium">
            Target (optional)
            <div className="mt-1">
              <UsernamePicker
                value={targetUsername ? [targetUsername] : []}
                onChange={(next) => setTargetUsername(next[0] ?? '')}
                exclude={profile?.username ? [profile.username] : []}
                placeholder="Leave blank to challenge anyone"
                maxSelections={1}
              />
            </div>
            <p className="mt-1 text-xs text-ink/45">Leave empty to let anyone take the challenge</p>
          </label>
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-4 font-black">Terms</h2>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 w-full">
            <div className="min-w-0">
              <StakeInput value={stake} onChange={setStake} />
            </div>
            <label className="block text-sm font-medium min-w-0">
              Deadline
              <input
                className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-ink/45">Min. one week away</p>
            </label>
          </div>

          <label className="mt-4 block text-sm font-medium">
            Post to
            <select
              className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
              value={groupId || visibility}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'public' || value === 'private') {
                  setVisibility(value as BetVisibility);
                  setGroupId('');
                } else {
                  setVisibility('private');
                  setGroupId(value);
                }
              }}
            >
              <option value="public">Public (anyone can see)</option>
              <option value="private">Private (invite users)</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          {visibility === 'private' && !groupId ? (
            <label className="mt-4 block text-sm font-medium">
              Invite users
              <div className="mt-1">
                <UsernamePicker
                  value={invited}
                  onChange={setInvited}
                  exclude={profile?.username ? [profile.username] : []}
                  placeholder="Search usernames"
                />
              </div>
            </label>
          ) : null}
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs leading-6 text-ink/60">
            <strong className="text-ink">Rules:</strong> You cannot complete your own wager. If nobody completes it before the deadline, you can close it to reclaim your stake plus 50% bonus. If you fail, you lose your stake.
          </p>
        </section>

        {error ? (
          <p className="rounded-xl bg-coral/10 p-3 text-sm text-coral">{error}</p>
        ) : null}

        <button
          disabled={busy}
          className="w-full rounded-xl bg-citrus px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Creating wager...' : 'Create wager'}
        </button>
      </form>
    </>
  );
}
