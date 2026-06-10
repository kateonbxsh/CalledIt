import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, X } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { CoinAmount } from '../components/CoinAmount';
import { PageHeader } from '../components/PageHeader';
import { RankBadge } from '../components/RankBadge';
import { useAuth } from '../contexts/AuthContext';
import { updateProfile, updateUsername } from '../services/userService';
import {
  createTestPushNotification,
  disableCurrentPushToken,
  enablePushNotifications,
  supportsPushNotifications,
} from '../services/notificationService';
import { downscaleProfileImage } from '../utils/image';
import { rankForRating, rankProgress } from '../utils/ranks';

export function SettingsPage() {
  const { profile, logout } = useAuth();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL ?? '');
  const [message, setMessage] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const progress = useMemo(() => rankProgress(profile?.rating ?? 1000), [profile?.rating]);

  useEffect(() => {
    setUsername(profile?.username ?? '');
    setDisplayName(profile?.displayName ?? '');
    setBio(profile?.bio ?? '');
    setPhotoURL(profile?.photoURL ?? '');
    setEditingUsername(false);
  }, [profile]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (editingUsername && username.trim().toLowerCase() !== profile.username) {
      await updateUsername(profile, username);
      setEditingUsername(false);
    }
    await updateProfile(profile.uid, { displayName, bio, photoURL });
    setMessage('Profile saved.');
  }

  async function onImageChange(file?: File) {
    if (!file) return;
    setImageBusy(true);
    setMessage('');
    try {
      const dataUrl = await downscaleProfileImage(file);
      setPhotoURL(dataUrl);
      setMessage('Profile picture ready. Save your profile to keep it.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not process image.');
    } finally {
      setImageBusy(false);
    }
  }

  async function enablePush() {
    if (!profile) return;
    setPushBusy(true);
    setPushMessage('');
    try {
      await enablePushNotifications(profile);
      setPushMessage('Push notifications are enabled on this device.');
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : 'Could not enable push notifications.');
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    if (!profile) return;
    setPushBusy(true);
    setPushMessage('');
    try {
      await disableCurrentPushToken(profile);
      setPushMessage('Push notifications are disabled for this device.');
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : 'Could not disable push notifications.');
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    if (!profile) return;
    setPushBusy(true);
    setPushMessage('');
    try {
      await createTestPushNotification(profile);
      setPushMessage('Test push queued. It should arrive in a few seconds if this device is enabled.');
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : 'Could not queue a test push.');
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <form onSubmit={save} className="space-y-4 rounded-md border border-line bg-white p-4">
          <div className="rounded-2xl bg-field p-3">
            <div className="flex items-center gap-3">
              <Avatar name={displayName || profile?.username || 'FF'} src={photoURL} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-xl font-black">{displayName || profile?.username}</p>
                <p className="truncate text-sm font-semibold text-ink/45">@{profile?.username}</p>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium">
                Profile picture
                <input
                  className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2"
                  type="file"
                  accept="image/*"
                  onChange={(event) => onImageChange(event.target.files?.[0])}
                />
              </label>
              <p className="mt-1 text-xs text-ink/55">Cropped and compressed into your profile</p>
              {photoURL ? (
                <button
                  type="button"
                  onClick={() => setPhotoURL('')}
                  className="mt-2 rounded-md border border-line px-3 py-1.5 text-xs font-semibold"
                >
                  Remove picture
                </button>
              ) : null}
              {imageBusy ? <p className="mt-2 text-xs text-ink/55">Resizing image...</p> : null}
            </div>
          </div>
          <div className="block text-sm font-medium">
            Username
            <div className="mt-1 flex gap-2">
              <input
                className={`w-full rounded-md border border-line px-3 py-2 ${
                  editingUsername ? 'bg-field outline-none focus:border-mint' : 'bg-white text-ink/55'
                }`}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                pattern="[a-zA-Z0-9_]{3,20}"
                autoComplete="username"
                readOnly={!editingUsername}
              />
              <button
                type="button"
                onClick={() => {
                  if (editingUsername) setUsername(profile?.username ?? '');
                  setEditingUsername((value) => !value);
                }}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-white text-ink/60"
                aria-label={editingUsername ? 'Cancel username edit' : 'Edit username'}
              >
                {editingUsername ? <X size={16} /> : <Pencil size={16} />}
              </button>
            </div>
            <span className="mt-1 block text-xs text-ink/50">
              {editingUsername ? 'Letters, numbers, underscore. 3-20 characters.' : 'Tap the pencil to change your username.'}
            </span>
          </div>
          <label className="block text-sm font-medium">
            Display name
            <input className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            Bio/status
            <textarea className="mt-1 min-h-28 w-full rounded-md border border-line bg-field px-3 py-2" value={bio} onChange={(event) => setBio(event.target.value)} />
          </label>
          {message ? <p className="rounded-md bg-mint/10 p-3 text-sm text-mint">{message}</p> : null}
          <button className="rounded-md bg-ink px-4 py-3 font-semibold text-white">Save profile</button>
        </form>
        <aside className="space-y-4">
          <section className="rounded-md border border-line bg-white p-4">
            <p className="text-sm text-ink/55">Username</p>
            <p className="font-bold">@{username || profile?.username}</p>
          </section>
          <section className="rounded-md border border-line bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black">Rating/ELO</p>
              <RankBadge rank={rankForRating(profile?.rating ?? 1000)} />
            </div>
            <p className="mt-2 text-2xl font-black">{profile?.rating ?? 1000} ELO</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-field">
              <div className="h-full rounded-full bg-mint" style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="mt-2 text-xs font-semibold text-ink/55">
              {progress.currentRange}
              {progress.nextRank ? ` · next ${progress.nextRank}` : ''}
            </p>
          </section>
          <section className="rounded-md border border-line bg-white p-4">
            <p className="text-sm text-ink/55">Coins</p>
            <CoinAmount amount={profile?.coinBalance ?? 0} className="mt-1 text-2xl" />
          </section>
          <section className="rounded-md border border-line bg-white p-4">
            <p className="text-sm font-black">Push notifications</p>
            <p className="mt-1 text-xs leading-5 text-ink/55">
              Get bet, challenge, wager, and reward updates on this device.
            </p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={enablePush}
                disabled={pushBusy || !supportsPushNotifications()}
                className="rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45"
              >
                {pushBusy ? 'Working...' : 'Enable on this device'}
              </button>
              <button
                type="button"
                onClick={disablePush}
                disabled={pushBusy}
                className="rounded-md border border-line px-4 py-2.5 text-sm font-bold text-ink/65 disabled:opacity-45"
              >
                Disable this device
              </button>
              <button
                type="button"
                onClick={sendTestPush}
                disabled={pushBusy || !supportsPushNotifications()}
                className="rounded-md border border-mint/30 bg-mint/10 px-4 py-2.5 text-sm font-bold text-mint disabled:opacity-45"
              >
                Send test push
              </button>
            </div>
            {!supportsPushNotifications() ? (
              <p className="mt-2 text-xs text-coral">This browser does not support web push.</p>
            ) : null}
            {pushMessage ? <p className="mt-2 text-xs font-semibold text-ink/55">{pushMessage}</p> : null}
          </section>
          <Link
            to="/how-to-play"
            className="block rounded-md border border-line bg-white p-4 text-sm font-bold transition hover:bg-field"
          >
            How to Play
          </Link>
          <button onClick={logout} className="w-full rounded-md bg-coral px-4 py-3 font-semibold text-white">
            Sign out
          </button>
        </aside>
      </div>
    </>
  );
}
