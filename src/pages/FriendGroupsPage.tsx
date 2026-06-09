import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { UsernamePicker } from '../components/UsernamePicker';
import { useAuth } from '../contexts/AuthContext';
import {
  createFriendGroup,
  deleteFriendGroup,
  listMyFriendGroups,
  updateFriendGroup,
} from '../services/friendGroupService';
import type { FriendGroup } from '../types';

type EditingState = { groupId: string | null; name: string; members: string[] };

const EMPTY_EDITING: EditingState = { groupId: null, name: '', members: [] };

export function FriendGroupsPage() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      setGroups(await listMyFriendGroups(profile));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(EMPTY_EDITING);
    setError('');
  }

  function openEdit(group: FriendGroup) {
    setEditing({
      groupId: group.id,
      name: group.name,
      members: group.memberUsernames,
    });
    setError('');
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!editing || !profile) return;
    const name = editing.name.trim();
    if (!name) { setError('Group name is required.'); return; }
    const members = editing.members;
    setBusy(true);
    setError('');
    try {
      if (editing.groupId) {
        await updateFriendGroup(editing.groupId, name, members, profile);
      } else {
        await createFriendGroup(name, members, profile);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save group.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(groupId: string) {
    setBusy(true);
    setError('');
    try {
      await deleteFriendGroup(groupId);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete group.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Friend Groups"
        action={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus size={17} /> New Group
          </button>
        }
      />

      {error ? <p className="mb-4 rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}

      {/* Create / Edit form */}
      {editing !== null ? (
        <div className="mb-5 rounded-md border border-line bg-white p-4 animate-soft-enter">
          <h2 className="mb-4 font-bold">{editing.groupId ? 'Edit group' : 'New group'}</h2>
          <form onSubmit={onSave} className="space-y-3">
            <label className="block text-sm font-medium">
              Group name
              <input
                className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Weekend crew, Footy group…"
                required
              />
            </label>
            <div className="block text-sm font-medium">
              Members
              <div className="mt-1">
                <UsernamePicker
                  value={editing.members}
                  onChange={(members) => setEditing({ ...editing, members })}
                  exclude={profile?.username ? [profile.username] : []}
                  placeholder="Search usernames"
                />
              </div>
              <span className="mt-1 block text-xs text-ink/50">
                Your own username is always included automatically
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/70"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-md bg-white" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="grid place-items-center rounded-md border border-line bg-white py-16 text-center">
          <Users size={32} className="mb-3 text-ink/30" />
          <p className="font-bold text-ink/60">No groups yet</p>
          <p className="mt-1 text-sm text-ink/45">Create one to quickly invite everyone when making a private bet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const isCreator = group.creatorId === profile?.uid;
            return (
              <div key={group.id} className="rounded-md border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-black">{group.name}</p>
                    <p className="mt-0.5 text-xs text-ink/50">
                      {isCreator ? 'You' : group.creatorUsername} · {group.memberUsernames.length + 1} members
                    </p>
                  </div>
                  {isCreator ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => openEdit(group)}
                        className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink/60 hover:bg-field"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(group.id)}
                        className="grid h-8 w-8 place-items-center rounded-md border border-line text-coral/70 hover:bg-coral/10"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <span className="rounded-full bg-mint/10 px-2 py-0.5 text-xs font-semibold text-mint">
                    {group.creatorUsername}
                  </span>
                  {group.memberUsernames.slice(0, 8).map((u) => (
                    <span key={u} className="rounded-full bg-field px-2 py-0.5 text-xs font-medium text-ink/65">
                      {u}
                    </span>
                  ))}
                  {group.memberUsernames.length > 8 ? (
                    <span className="rounded-full bg-field px-2 py-0.5 text-xs text-ink/45">
                      +{group.memberUsernames.length - 8} more
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-ink/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-md border border-line bg-white p-5 shadow-lift animate-soft-enter">
            <h2 className="font-black">Delete this group?</h2>
            <p className="mt-2 text-sm text-ink/65">
              The group will be removed. Editing group members updates linked bets, but deleting the group leaves existing bets as they are.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={busy}
                className="flex-1 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-ink/70"
              >
                Cancel
              </button>
              <button
                onClick={() => onDelete(confirmDelete)}
                disabled={busy}
                className="flex-1 rounded-md bg-coral px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
