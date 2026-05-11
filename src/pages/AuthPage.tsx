import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function AuthPage() {
  const { authUser, login, loginWithGoogle, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (authUser) return <Navigate to="/" replace />;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, password, username, displayName });
      }
    });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(135deg,#f8fbf4_0%,#f2f8f7_42%,#fbf5f1_72%,#f6f3fa_100%)] px-4 py-8 text-ink">
      <section className="animate-soft-enter w-full max-w-md overflow-hidden rounded-md border border-white/70 bg-white/90 shadow-soft backdrop-blur">
        <div className="p-5">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <p className="text-3xl font-black tracking-normal">Called it</p>
            <p className="font-arabic text-right text-xl font-black text-ink/60" dir="rtl">
              كنت عارف
            </p>
          </div>

          <button
            type="button"
            onClick={() => run(loginWithGoogle)}
            disabled={busy}
            className="mb-3 flex w-full items-center justify-center gap-3 rounded-md border border-line bg-white px-4 py-3 text-sm font-bold transition hover:bg-field disabled:opacity-60"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-black text-white">
              G
            </span>
            Continue with Google
          </button>

          <div className="mb-4 grid grid-cols-2 rounded-md bg-field p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-sm py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-white shadow-sm' : ''}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`rounded-sm py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-white shadow-sm' : ''}`}
            >
              Register
            </button>
          </div>

          <form className="space-y-3" onSubmit={onSubmit}>
            <label className="block text-sm font-semibold">
              Email
              <input
                className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2 outline-none transition focus:border-mint"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Password
              <input
                className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2 outline-none transition focus:border-mint"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {mode === 'register' ? (
              <>
                <label className="block text-sm font-semibold">
                  Username
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2 lowercase outline-none transition focus:border-mint"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    pattern="[a-zA-Z0-9_]{3,20}"
                    required
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Display name
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2 outline-none transition focus:border-mint"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    required
                  />
                </label>
              </>
            ) : null}
            {error ? <p className="rounded-md bg-coral/10 p-3 text-sm text-coral">{error}</p> : null}
            <button
              disabled={busy}
              className="w-full rounded-md bg-ink px-4 py-3 font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
            >
              {busy ? 'Working...' : mode === 'login' ? 'Login' : 'Create account'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
