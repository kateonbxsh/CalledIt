import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Pencil, Plus, Reply, Send, Trash2, Users, X } from 'lucide-react';
import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { UsernamePicker } from '../components/UsernamePicker';
import { useAuth } from '../contexts/AuthContext';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
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
  sortFriendGroupsByLatestMessage,
  subscribeToGroupMessages,
  updateFriendGroup,
} from '../services/friendGroupService';
import { getUsersByIds } from '../services/userService';
import type { FriendGroup, GroupMessage, GroupMessageReplyPreview, GroupReadState, UserProfile } from '../types';
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
  const [liveMessages, setLiveMessages] = useState<GroupMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<GroupMessage[]>([]);
  const [messageCursor, setMessageCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [messagesHaveMore, setMessagesHaveMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<GroupMessageReplyPreview | null>(null);
  const [chatProfiles, setChatProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [replySwipe, setReplySwipe] = useState<{ id: string; offset: number; dragging: boolean } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatScrollModeRef = useRef<'bottom' | 'preserve'>('bottom');
  const previousChatViewportRef = useRef({ scrollHeight: 0, scrollTop: 0 });
  const shouldStickToBottomRef = useRef(true);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const replySwipeStartRef = useRef<{ id: string; x: number; y: number; horizontal: boolean } | null>(null);
  const replySwipeOffsetRef = useRef(0);
  const lastMarkedMessageRef = useRef('');
  const olderMessagesRef = useRef<GroupMessage[]>([]);

  const messages = useMemo(() => {
    const unique = new Map<string, GroupMessage>();
    [...olderMessages, ...liveMessages].forEach((message) => unique.set(message.id, message));
    return [...unique.values()].sort(
      (left, right) => (left.createdAt?.toMillis?.() ?? 0) - (right.createdAt?.toMillis?.() ?? 0),
    );
  }, [liveMessages, olderMessages]);

  function closeChat() {
    setChatGroup(null);
    setReplyingTo(null);
  }

  const chatSheet = useSwipeToDismiss(closeChat, Boolean(chatGroup));
  const editSheet = useSwipeToDismiss(() => setEditing(null), Boolean(editing));

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

    if (shouldStickToBottomRef.current) panel.scrollTop = panel.scrollHeight;
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
    shouldStickToBottomRef.current = true;
    setChatGroup(group);
    setLiveMessages([]);
    setOlderMessages([]);
    olderMessagesRef.current = [];
    setMessageCursor(null);
    setMessagesHaveMore(false);
    setMessagesLoading(true);
    setReplyingTo(null);
    lastMarkedMessageRef.current = '';
  }

  useEffect(() => {
    if (!chatGroup || !profile) return;
    return subscribeToGroupMessages(
      chatGroup.id,
      (page) => {
        setLiveMessages(page.messages);
        setMessagesLoading(false);
        if (olderMessagesRef.current.length === 0) {
          setMessageCursor(page.cursor);
          setMessagesHaveMore(page.hasMore);
        }
        const latest = page.messages.at(-1);
        if (latest) {
          setGroups((current) => sortFriendGroupsByLatestMessage(current.map((group) => (
            group.id === chatGroup.id
              ? {
                  ...group,
                  lastMessageAt: latest.createdAt,
                  lastMessagePreview: latest.body.slice(0, 160),
                  lastMessageSenderId: latest.authorId,
                }
              : group
          ))));
        }
        if (latest && latest.authorId !== profile.uid && latest.id !== lastMarkedMessageRef.current) {
          lastMarkedMessageRef.current = latest.id;
          void markGroupRead(chatGroup.id, profile.uid).catch(() => {});
          setReadStates((current) => new Map(current).set(chatGroup.id, {
            groupId: chatGroup.id,
            lastReadAt: latest.createdAt ?? Timestamp.now(),
          }));
        }
      },
      (err) => {
        setError(err.message || 'Could not load chat.');
        setMessagesLoading(false);
      },
    );
  }, [chatGroup, profile]);

  useEffect(() => {
    if (!chatGroup) {
      setChatProfiles(new Map());
      return;
    }
    let cancelled = false;
    void getUsersByIds([chatGroup.creatorId, ...chatGroup.memberUids])
      .then((profiles) => {
        if (!cancelled) setChatProfiles(profiles);
      })
      .catch(() => {
        if (!cancelled) setChatProfiles(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [chatGroup]);

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
      setOlderMessages((current) => {
        const next = [...page.messages, ...current];
        olderMessagesRef.current = next;
        return next;
      });
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
    shouldStickToBottomRef.current = true;
    setBusy(true);
    try {
      await sendGroupMessage(chatGroup, profile, messageBody, replyingTo);
      setMessageBody('');
      setReplyingTo(null);
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
          <div
            {...editSheet.sheetProps}
            data-sheet-scroll
            className="max-h-[92dvh] w-full touch-pan-y overflow-y-auto rounded-t-2xl border border-line bg-white p-5 shadow-lift animate-soft-enter sm:max-w-lg sm:rounded-2xl"
          >
            {editSheet.dragHandle}
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
                {editIsOwner && editing.groupId ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(editing.groupId)}
                    className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-md border border-coral/20 bg-coral/5 text-coral transition hover:bg-coral/10"
                    aria-label="Delete group"
                    title="Delete group"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-ink/35 px-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-group-title"
        >
          <div className="w-full max-w-sm rounded-md border border-line bg-white p-5 shadow-lift animate-soft-enter">
            <h2 id="delete-group-title" className="font-black">Delete friend group?</h2>
            <p className="mt-2 text-sm text-ink/65">
              This permanently removes <strong>{groups.find((group) => group.id === confirmDelete)?.name ?? 'this group'}</strong> and
              its chat for every member. Existing linked bets remain.
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
          <div
            {...chatSheet.sheetProps}
            className="flex h-[min(92dvh,760px)] w-full animate-soft-enter touch-pan-y flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-lift sm:h-[min(82dvh,760px)] sm:w-[min(94vw,1100px)] sm:max-w-none sm:rounded-2xl"
          >
            <div className="shrink-0 pt-2 sm:hidden">{chatSheet.dragHandle}</div>
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
              <button type="button" onClick={closeChat} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-field transition hover:bg-line active:scale-95" aria-label="Close chat">
                <X size={17} />
              </button>
            </div>
            <div
              ref={chatScrollRef}
              data-sheet-scroll
              onScroll={(event) => {
                const panel = event.currentTarget;
                shouldStickToBottomRef.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 72;
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-field/60 px-3 py-4 sm:px-6"
            >
              <div className="flex min-h-full flex-col justify-end">
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
                  const previous = messages[messageIndex - 1];
                  const next = messages[messageIndex + 1];
                  const createdAt = message.createdAt?.toMillis?.() ?? 0;
                  const sameAsPrevious = previous?.authorId === message.authorId
                    && createdAt - (previous.createdAt?.toMillis?.() ?? 0) < 5 * 60 * 1000;
                  const sameAsNext = next?.authorId === message.authorId
                    && (next.createdAt?.toMillis?.() ?? 0) - createdAt < 5 * 60 * 1000;
                  const replyPreview: GroupMessageReplyPreview = {
                    id: message.id,
                    authorId: message.authorId,
                    authorUsername: message.authorUsername,
                    authorDisplayName: message.authorDisplayName,
                    body: message.body,
                  };
                  const messageProfile = chatProfiles.get(message.authorId);
                  const messageTime = message.createdAt?.toDate?.();
                  const shortTime = messageTime?.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  }) ?? 'Sending...';
                  const swipeOffset = replySwipe?.id === message.id ? replySwipe.offset : 0;
                  return (
                    <div
                      key={message.id}
                      className={`group/message animate-comment-enter flex ${mine ? 'justify-end' : 'justify-start'} ${sameAsPrevious ? 'mt-0.5' : 'mt-3'}`}
                      style={{ animationDelay: `${Math.min(messageIndex, 10) * 25}ms` }}
                      onTouchStart={(event) => {
                        const touch = event.touches[0];
                        replySwipeStartRef.current = {
                          id: message.id,
                          x: touch.clientX,
                          y: touch.clientY,
                          horizontal: false,
                        };
                        replySwipeOffsetRef.current = 0;
                        setReplySwipe({ id: message.id, offset: 0, dragging: true });
                      }}
                      onTouchMove={(event) => {
                        const start = replySwipeStartRef.current;
                        if (!start || start.id !== message.id) return;
                        const touch = event.touches[0];
                        const dx = touch.clientX - start.x;
                        const dy = touch.clientY - start.y;
                        if (!start.horizontal && Math.abs(dx) > 8) {
                          if (Math.abs(dx) <= Math.abs(dy)) return;
                          start.horizontal = true;
                        }
                        if (!start.horizontal) return;
                        const offset = Math.max(0, Math.min(76, dx));
                        replySwipeOffsetRef.current = offset;
                        setReplySwipe({ id: message.id, offset, dragging: true });
                      }}
                      onTouchEnd={() => {
                        const start = replySwipeStartRef.current;
                        const offset = replySwipeOffsetRef.current;
                        replySwipeStartRef.current = null;
                        replySwipeOffsetRef.current = 0;
                        setReplySwipe({ id: message.id, offset: 0, dragging: false });
                        if (start?.id === message.id && start.horizontal && offset > 52) {
                          setReplyingTo(replyPreview);
                        }
                      }}
                      onTouchCancel={() => {
                        replySwipeStartRef.current = null;
                        replySwipeOffsetRef.current = 0;
                        setReplySwipe({ id: message.id, offset: 0, dragging: false });
                      }}
                    >
                      <div
                        className="flex max-w-full items-end"
                        style={{
                          transform: `translateX(${swipeOffset}px)`,
                          transition: replySwipe?.id === message.id && replySwipe.dragging
                            ? 'none'
                            : 'transform 180ms cubic-bezier(.2,.8,.2,1)',
                        }}
                      >
                        {mine ? (
                          <time
                            title={messageTime?.toLocaleString() ?? 'Sending...'}
                            className="mr-2 hidden whitespace-nowrap text-[10px] font-semibold text-ink/35 opacity-0 transition sm:block sm:group-hover/message:opacity-100"
                          >
                            {shortTime}
                          </time>
                        ) : null}
                        {!mine ? (
                          <div className="mr-2 h-8 w-8 shrink-0">
                            {!sameAsNext ? (
                              <Avatar
                                name={messageProfile?.displayName || message.authorDisplayName || message.authorUsername}
                                src={messageProfile?.photoURL || undefined}
                                size="chat"
                                round
                              />
                            ) : null}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setReplyingTo(replyPreview)}
                          className={`mr-1 hidden h-8 w-8 shrink-0 place-items-center rounded-full text-ink/35 transition hover:bg-white hover:text-ink sm:group-hover/message:grid ${mine ? '' : 'order-last ml-1 mr-0'}`}
                          aria-label="Reply to message"
                        >
                          <Reply size={14} />
                        </button>
                        <div
                          className={`max-w-[72vw] rounded-2xl px-3 py-2 sm:max-w-[62vw] ${mine ? 'bg-ink text-white' : 'bg-white text-ink shadow-[0_2px_8px_rgba(18,20,23,0.055)]'} ${sameAsNext ? '' : mine ? 'rounded-br-md' : 'rounded-bl-md'}`}
                        >
                          {!mine && !sameAsPrevious ? <p className="mb-0.5 text-xs font-black opacity-55">{messageProfile?.displayName || message.authorDisplayName || message.authorUsername}</p> : null}
                          {message.replyTo ? (
                            <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${mine ? 'border-white/45 bg-white/10 text-white/70' : 'border-mint bg-field text-ink/60'}`}>
                              <p className="font-black">{message.replyTo.authorDisplayName || message.replyTo.authorUsername}</p>
                              <p className="truncate">{message.replyTo.body}</p>
                            </div>
                          ) : null}
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p>
                        </div>
                        {!mine ? (
                          <time
                            title={messageTime?.toLocaleString() ?? 'Sending...'}
                            className="ml-2 hidden whitespace-nowrap text-[10px] font-semibold text-ink/35 opacity-0 transition sm:block sm:group-hover/message:opacity-100"
                          >
                            {shortTime}
                          </time>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <form onSubmit={submitMessage} className="shrink-0 border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {replyingTo ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-field px-3 py-2 text-xs">
                  <Reply size={13} className="shrink-0 text-mint" />
                  <div className="min-w-0 flex-1">
                    <p className="font-black">Replying to {replyingTo.authorDisplayName || replyingTo.authorUsername}</p>
                    <p className="truncate text-ink/50">{replyingTo.body}</p>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white" aria-label="Cancel reply">
                    <X size={14} />
                  </button>
                </div>
              ) : null}
              <div className="flex gap-2">
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
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
