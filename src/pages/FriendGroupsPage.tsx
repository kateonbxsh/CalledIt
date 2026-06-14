import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageCircle, Pencil, Plus, Send, Trash2, Users, X } from 'lucide-react';
import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
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
  updateFriendGroup,
} from '../services/friendGroupService';
import type { FriendGroup, GroupMessage, GroupReadState } from '../types';
import { relativeTime } from '../utils/format';

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
                className="btn-special rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60"
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
            const unread = profile ? groupHasUnread(group, readStates, profile.uid) : false;
            return (
              <div key={group.id} className={`relative rounded-md border bg-white p-4 ${unread ? 'border-coral/40 shadow-soft' : 'border-line'}`}>
                {unread ? (
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#edf0e8] bg-coral px-1 text-[10px] font-black text-white">!</span>
                ) : null}
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
                <button
                  type="button"
                  onClick={() => void openChat(group)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-line bg-field px-3 py-2.5 text-sm font-bold text-ink/70 transition hover:bg-white"
                >
                  <MessageCircle size={16} />
                  Open chat
                  {group.lastMessagePreview ? <span className="max-w-40 truncate font-normal text-ink/40">· {group.lastMessagePreview}</span> : null}
                </button>
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
          <div className="flex h-[min(92dvh,760px)] w-full animate-soft-enter flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-lift sm:h-[min(82dvh,760px)] sm:max-w-4xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate font-black">{chatGroup.name}</h2>
                <p className="text-xs font-semibold text-ink/40">{chatGroup.memberUsernames.length + 1} members</p>
              </div>
              <button type="button" onClick={() => setChatGroup(null)} className="grid h-9 w-9 place-items-center rounded-full bg-field transition hover:bg-line active:scale-95" aria-label="Close chat">
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
                placeholder="Message the group"
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
