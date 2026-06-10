import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createProfile } from '../services/userService';

function suggestedUsername(value?: string | null) {
  return (value || 'user')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
}

export function CompleteProfilePage() {
  const { authUser, profile, loading } = useAuth();
  const [username, setUsername] = useState(() => suggestedUsername(authUser?.email || authUser?.displayName));
  const [displayName, setDisplayName] = useState(authUser?.displayName ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="p-6 text-sm text-ink/70">Loading...</div>;
  if (!authUser) return <Navigate to="/auth" replace />;
  if (profile) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!authUser) return;
    setBusy(true);
    setError('');
    try {
      await createProfile({
        authUser,
        username,
        displayName: displayName || username,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#edf0e8] px-4 text-ink">
      <section className="w-full max-w-sm rounded-2xl border border-line bg-white p-5 shadow-soft">
        <h1 className="text-2xl font-black">Choose your username</h1>
        <p className="mt-1 text-sm text-ink/55">This is how friends invite and find you.</p>
        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium">
            Username
            <input
              className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              pattern="[a-zA-Z0-9_]{3,20}"
              autoComplete="username"
              required
            />
            <span className="mt-1 block text-xs text-ink/45">Letters, numbers, underscore. 3-20 characters.</span>
          </label>
          <label className="block text-sm font-medium">
            Display name
            <input
              className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2.5 outline-none focus:border-mint"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>
          {error ? <p className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">{error}</p> : null}
          <button disabled={busy} className="btn-special w-full rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-60">
            {busy ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </section>
    </main>
  );
}
