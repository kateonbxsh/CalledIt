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
    <main className="relative flex min-h-screen overflow-hidden bg-[#edf0e8] text-ink">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-mint/15 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-coral/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[#d49a25]/8 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mb-2 flex items-baseline justify-center gap-3">
            <h1 className="text-4xl font-black tracking-tight">Called it</h1>
            <span className="font-arabic text-xl font-black text-ink/45" dir="rtl">كنت عارف</span>
          </div>
          <p className="text-sm text-ink/50">Bet on anything with friends. No real money.</p>
        </div>

        <section className="w-full max-w-sm">
          {/* Google */}
          <button
            type="button"
            onClick={() => run(loginWithGoogle)}
            disabled={busy}
            className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold shadow-soft transition hover:shadow-md disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="text-xs font-semibold text-ink/40">or</span>
            <div className="h-px flex-1 bg-line" />
          </div>

          {/* Mode toggle */}
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white p-1 shadow-soft">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'login' ? 'bg-ink text-white shadow-sm' : 'text-ink/60 hover:text-ink'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'register' ? 'bg-ink text-white shadow-sm' : 'text-ink/60 hover:text-ink'
              }`}
            >
              Create account
            </button>
          </div>

          <form className="space-y-3" onSubmit={onSubmit}>
            {mode === 'register' ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-ink/70">
                  Username
                  <input
                    className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/20"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="yourname"
                    pattern="[a-zA-Z0-9_]{3,20}"
                    autoComplete="username"
                    required
                  />
                </label>
                <label className="block text-xs font-semibold text-ink/70">
                  Display name
                  <input
                    className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/20"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your Name"
                    autoComplete="name"
                    required
                  />
                </label>
              </div>
            ) : null}

            <label className="block text-xs font-semibold text-ink/70">
              Email
              <input
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/20"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="block text-xs font-semibold text-ink/70">
              Password
              <input
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/20"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Min. 6 characters' : '••••••••'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </label>

            {error ? (
              <p className="rounded-lg bg-coral/10 px-3 py-2.5 text-xs font-medium text-coral">
                {error}
              </p>
            ) : null}

            <button
              disabled={busy}
              className="mt-1 w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-60"
            >
              {busy
                ? 'Working…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          {mode === 'register' ? (
            <p className="mt-4 text-center text-xs text-ink/40">
              Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError(''); }} className="font-semibold text-ink/70 underline-offset-2 hover:underline">
                Sign in
              </button>
            </p>
          ) : (
            <p className="mt-4 text-center text-xs text-ink/40">
              No account yet?{' '}
              <button onClick={() => { setMode('register'); setError(''); }} className="font-semibold text-ink/70 underline-offset-2 hover:underline">
                Create one
              </button>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
