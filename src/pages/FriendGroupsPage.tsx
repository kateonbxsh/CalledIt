import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageCircle, Pencil, Plus, Send, Trash2, Users, X } from 'lucide-react';
import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { UsernamePicker } from '../components/UsernamePicker';
import { useAuth } from '../contexts/AuthContext';
import {
  createFriendGroup,
  deleteFriendGroup,
  groupHasUnread,
  listGroupMessages,
  listGroupReadStates,
  listMyFriendGroups,
  markGroupRead,
  sendGroupMessage,
  setGroupPhoto,
  updateFriendGroup,
} from '../services/friendGroupService';
import type { FriendGroup, GroupMessage, GroupReadState } from '../types';
import { relativeTime } from '../utils/format';
import { downscaleProfileImage } from '../utils/image';

type EditingState = { groupId: string | null; name: string; members: string[]; photoURL?: string | null };

const EMPTY_EDITING: EditingState = { groupId: null, name: '', members: [], photoURL: null };

export function FriendGroupsPage() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [readStates, setReadStates] = useState<Map<string, GroupReadState>>(new Map());
  const [chatGroup, setChatGroup] = useState<FriendGroup | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [messagesHaveMore, setMessagesHaveMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollModeRef = useRef<'bottom' | 'preserve'>('bottom');
  const previousChatViewportRef = useRef({ scrollHeight: 0, scrollTop: 0 });
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function onGroupPhotoChange(file?: File) {
    const groupId = editing?.groupId;
    if (!file || !groupId) return;
    setPhotoBusy(true);
    setError('');
    try {
      const dataUrl = await downscaleProfileImage(file);
      await setGroupPhoto(groupId, dataUrl);
      setEditing((current) => (current ? { ...current, photoURL: dataUrl } : current));
      setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, photoURL: dataUrl } : group)));
      setChatGroup((current) => (current && current.id === groupId ? { ...current, photoURL: dataUrl } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update group photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removeGroupPhoto() {
    const groupId = editing?.groupId;
    if (!groupId) return;
    setPhotoBusy(true);
    setError('');
    try {
      await setGroupPhoto(groupId, null);
      setEditing((current) => (current ? { ...current, photoURL: null } : current));
      setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, photoURL: null } : group)));
      setChatGroup((current) => (current && current.id === groupId ? { ...current, photoURL: null } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove group photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  useLayoutEffect(() => {
    const panel = chatScrollRef.current;
    if (!panel || !chatGroup) return;

    if (chatScrollModeRef.current === 'preserve') {
      const previous = previousChatViewportRef.current;
      panel.scrollTop = panel.scrollHeight - previous.scrollHeight + previous.scrollTop;
      chatScrollModeRef.current = 'bottom';
      return;
    }

    panel.scrollTop = panel.scrollHeight;
  }, [chatGroup, messages]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [nextGroups, nextReads] = await Promise.all([
        listMyFriendGroups(profile),
        listGroupReadStates(profile.uid),
      ]);
      setGroups(nextGroups);
      setReadStates(nextReads);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not load groups.');
      setLoading(false);
    });
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
      photoURL: group.photoURL ?? null,
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
        // Only the owner can change name/members; members can still edit the photo
        // (applied immediately when picked), so just close for them.
        const editGroup = groups.find((group) => group.id === editing.groupId);
        if (editGroup && editGroup.creatorId === profile.uid) {
          await updateFriendGroup(editing.groupId, name, members, profile);
        }
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

  async function openChat(group: FriendGroup) {
    if (!profile) return;
    chatScrollModeRef.current = 'bottom';
    setChatGroup(group);
    setMessages([]);
    setMessageCursor(null);
    setMessagesHaveMore(false);
    setMessagesLoading(true);
    try {
      const page = await listGroupMessages(group.id);
      setMessages(page.messages);
      setMessageCursor(page.cursor);
      setMessagesHaveMore(page.hasMore);
      await markGroupRead(group.id, profile.uid);
      setReadStates((current) => new Map(current).set(group.id, {
        groupId: group.id,
        lastReadAt: group.lastMessageAt ?? page.messages.at(-1)?.createdAt ?? Timestamp.now(),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load chat.');
    } finally {
      setMessagesLoading(false);
    }
  }

  async function loadOlderMessages() {
    if (!chatGroup || !messageCursor || messagesLoading) return;
    const panel = chatScrollRef.current;
    if (panel) {
      previousChatViewportRef.current = {
        scrollHeight: panel.scrollHeight,
        scrollTop: panel.scrollTop,
      };
      chatScrollModeRef.current = 'preserve';
    }
    setMessagesLoading(true);
    try {
      const page = await listGroupMessages(chatGroup.id, messageCursor);
      setMessages((current) => [...page.messages, ...current]);
      setMessageCursor(page.cursor);
      setMessagesHaveMore(page.hasMore);
    } finally {
      setMessagesLoading(false);
    }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!profile || !chatGroup || !messageBody.trim()) return;
    chatScrollModeRef.current = 'bottom';
    setBusy(true);
    try {
      await sendGroupMessage(chatGroup, profile, messageBody);
      setMessageBody('');
      const page = await listGroupMessages(chatGroup.id);
      setMessages(page.messages);
      setMessageCursor(page.cursor);
      setMessagesHaveMore(page.hasMore);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setBusy(false);
    }
  }

  const editGroup = editing?.groupId ? groups.find((group) => group.id === editing.groupId) : null;
  const editIsOwner = !editing?.groupId || editGroup?.creatorId === profile?.uid;

  return (
    <>
      <PageHeader
        title="Friend Groups"
        action={
          <button
            onClick={openCreate}
            className="btn-special inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold"
          >
            <Plus size={17} /> New Group
          </button>
        }
      />

      {error ? <p className="mb-4 rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}

      {/* Create / Edit modal */}
      {editing !== null ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/55 sm:grid sm:place-items-center sm:px-4 sm:backdrop-blur-sm">
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-white p-5 shadow-lift animate-soft-enter sm:max-w-lg sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-black">{editing.groupId ? 'Edit group' : 'New group'}</h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="grid h-9 w-9 place-items-center rounded-full bg-field transition hover:bg-line active:scale-95"
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>
            <form onSubmit={onSave} className="space-y-4">
              {editing.groupId ? (
                <div className="flex items-center gap-3">
                  {editing.photoURL ? (
                    <img src={editing.photoURL} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-mint/12 text-xl font-black text-mint">
                      {editing.name.slice(0, 1).toUpperCase() || <Users size={22} />}
                    </span>
                  )}
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoBusy}
                      className="rounded-md border border-line bg-white px-3 py-2 text-sm font-bold text-ink/70 transition hover:bg-field disabled:opacity-50"
                    >
                      {photoBusy ? 'Updating…' : editing.photoURL ? 'Change photo' : 'Add group photo'}
                    </button>
                    {editing.photoURL ? (
                      <button
                        type="button"
                        onClick={() => void removeGroupPhoto()}
                        className="ml-2 text-xs font-semibold text-coral/70"
                      >
                        Remove
                      </button>
                    ) : null}
                    <p className="mt-1 text-xs text-ink/45">Any member can change the group photo.</p>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => { void onGroupPhotoChange(event.target.files?.[0]); event.target.value = ''; }}
                  />
                </div>
              ) : null}

              <label className="block text-sm font-medium">
                Group name
                <input
                  className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2 disabled:opacity-60"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Weekend crew, Footy group…"
                  disabled={!editIsOwner}
                  required
                />
              </label>
              <div className="block text-sm font-medium">
                Members
                <div className="mt-1">
                  <UsernamePicker
                    value={editIsOwner
                      ? editing.members
                      : (editGroup ? [editGroup.creatorUsername, ...editGroup.memberUsernames] : editing.members)
                          .filter((username) => username !== profile?.username)}
                    onChange={(members) => setEditing({ ...editing, members })}
                    exclude={profile?.username ? [profile.username] : []}
                    placeholder="Search usernames"
                    disabled={!editIsOwner}
                  />
                </div>
                <span className="mt-1 block text-xs text-ink/50">
                  {editIsOwner
                    ? 'Your own username is always included automatically'
                    : 'Only the group owner can change the name and members.'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 rounded-md border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink/70"
                >
                  {editIsOwner ? 'Cancel' : 'Done'}
                </button>
                {editIsOwner ? (
                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-special flex-1 rounded-md px-4 py-2.5 text-sm font-bold disabled:opacity-60"
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
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
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
          {groups.map((group) => {
            const isCreator = group.creatorId === profile?.uid;
            const unread = profile ? groupHasUnread(group, readStates, profile.uid) : false;
            const members = [group.creatorUsername, ...group.memberUsernames];
            return (
              <div key={group.id} className="flex items-center gap-3 px-3 py-3 transition hover:bg-field/60">
                <button
                  type="button"
                  onClick={() => void openChat(group)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="relative shrink-0">
                    {group.photoURL ? (
                      <img src={group.photoURL} alt="" className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-mint/12 text-base font-black text-mint">
                        {group.name.slice(0, 1).toUpperCase() || <Users size={20} />}
                      </span>
                    )}
                    {unread ? (
                      <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full border-2 border-white bg-coral px-0.5 text-[9px] font-black text-white">!</span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-black">{group.name}</span>
                      <span className="shrink-0 text-[11px] font-semibold text-ink/35">
                        {group.lastMessageAt ? relativeTime(group.lastMessageAt) : ''}
                      </span>
                    </span>
                    <span className={`mt-0.5 flex items-center gap-1 truncate text-sm ${unread ? 'font-semibold text-ink/75' : 'text-ink/45'}`}>
                      <MessageCircle size={13} className="shrink-0 text-ink/30" />
                      <span className="truncate">{group.lastMessagePreview || 'No messages yet — say hi 👋'}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink/40">
                      {members.length} members
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => openEdit(group)}
                    className="grid h-9 w-9 place-items-center rounded-full text-ink/55 transition hover:bg-white hover:text-ink"
                    title={isCreator ? 'Edit group' : 'Group photo'}
                    aria-label={isCreator ? 'Edit group' : 'Group photo'}
                  >
                    <Pencil size={16} />
                  </button>
                  {isCreator ? (
                    <button
                      onClick={() => setConfirmDelete(group.id)}
                      className="grid h-9 w-9 place-items-center rounded-full text-coral/70 transition hover:bg-coral/10 hover:text-coral"
                      title="Delete group"
                      aria-label="Delete group"
                    >
                      <Trash2 size={16} />
                    </button>
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

      {chatGroup ? (
        <div className="fixed inset-0 z-[70] flex animate-fade-in items-end justify-center bg-ink/55 sm:grid sm:place-items-center sm:px-4 sm:backdrop-blur-sm">
          <div className="flex h-[min(92dvh,760px)] w-full animate-soft-enter flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-lift sm:h-[min(82dvh,760px)] sm:w-[min(94vw,1100px)] sm:max-w-none sm:rounded-2xl">
            <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
              {chatGroup.photoURL ? (
                <img src={chatGroup.photoURL} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mint/12 text-base font-black text-mint">
                  {chatGroup.name.slice(0, 1).toUpperCase() || <Users size={18} />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-black">{chatGroup.name}</h2>
                <p className="text-xs font-semibold text-ink/40">{chatGroup.memberUsernames.length + 1} members</p>
              </div>
              <button type="button" onClick={() => setChatGroup(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-field transition hover:bg-line active:scale-95" aria-label="Close chat">
                <X size={17} />
              </button>
            </div>
            <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-field/60 p-4">
              <div className="flex min-h-full flex-col justify-end gap-3">
                {messagesHaveMore ? (
                  <button onClick={loadOlderMessages} disabled={messagesLoading} className="mx-auto block rounded-md bg-white px-3 py-2 text-xs font-bold text-ink/55 shadow-soft">
                    {messagesLoading ? 'Loading...' : 'Load older messages'}
                  </button>
                ) : null}
                {!messagesLoading && messages.length === 0 ? (
                  <div className="grid flex-1 place-items-center text-center">
                    <div>
                      <MessageCircle size={28} className="mx-auto text-ink/20" />
                      <p className="mt-2 text-sm font-bold text-ink/40">Start the group chat.</p>
                    </div>
                  </div>
                ) : messages.map((message, messageIndex) => {
                  const mine = message.authorId === profile?.uid;
                  return (
                    <div
                      key={message.id}
                      className={`animate-comment-enter flex ${mine ? 'justify-end' : 'justify-start'}`}
                      style={{ animationDelay: `${Math.min(messageIndex, 10) * 25}ms` }}
                    >
                      <div className={`max-w-[82%] rounded-2xl px-3 py-2 sm:max-w-[70%] ${mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-white text-ink shadow-soft'}`}>
                        {!mine ? <p className="text-xs font-black opacity-55">{message.authorDisplayName || message.authorUsername}</p> : null}
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-white/45' : 'text-ink/35'}`}>
                          {message.createdAt ? relativeTime(message.createdAt) : 'just now'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <form onSubmit={submitMessage} className="flex shrink-0 gap-2 border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <input
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                maxLength={1000}
                placeholder={`Message ${chatGroup.name}…`}
                className="min-w-0 flex-1 rounded-md border border-line bg-field px-3 py-2.5 text-sm"
              />
              <button type="submit" disabled={!messageBody.trim() || busy} className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40" aria-label="Send message">
                <Send size={17} />
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
