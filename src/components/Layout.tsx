import {
  BarChart3,
  CirclePlus,
  Download,
  Gamepad2,
  HelpCircle,
  History,
  Home,
  LogOut,
  Medal,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { CoinAmount } from './CoinAmount';
import { useAuth } from '../contexts/AuthContext';
import { isMobileBrowser, isStandaloneApp } from '../utils/device';

const navItems = [
  { to: '/', label: 'Feed', icon: Home },
  { to: '/challenges', label: 'Challenges', icon: Trophy },
  { to: '/minigames', label: 'Minigames', icon: Gamepad2 },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/mine', label: 'My Bets', icon: BarChart3 },
  { to: '/history', label: 'History', icon: History },
  { to: '/leaderboard', label: 'Leaderboard', icon: Medal },
  { to: '/how-to-play', label: 'How to Play', icon: HelpCircle },
];

function NavItem({ to, label, icon: Icon }: (typeof navItems)[number]) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 ${
          isActive
            ? 'bg-ink text-white shadow-sm'
            : 'text-ink/60 hover:bg-white hover:text-ink hover:shadow-sm'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={17} className={isActive ? 'text-white' : 'text-ink/50 group-hover:text-ink'} />
          <span className="hidden lg:inline">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function BottomNavLink({ to, label, icon: Icon }: (typeof navItems)[number]) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center justify-center rounded-2xl py-2 px-1 transition-colors ${
          isActive ? 'bg-ink text-white shadow-soft' : 'text-ink/50 active:bg-field'
        }`
      }
      aria-label={label}
      title={label}
      style={{ backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' } as React.CSSProperties}
    >
      {() => (
        <Icon size={21} strokeWidth={2.4} style={{ WebkitFontSmoothing: 'antialiased', transform: 'translateZ(0)' } as React.CSSProperties} />
      )}
    </NavLink>
  );
}

export function Layout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showInstallNav, setShowInstallNav] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const scrollIntentRef = useRef(0);

  useEffect(() => {
    setShowInstallNav(isMobileBrowser() && !isStandaloneApp());
  }, [location.pathname]);

  useEffect(() => {
    setActionMenuOpen(false);
    setProfileMenuOpen(false);
    setBottomNavVisible(true);
    scrollIntentRef.current = 0;
    lastScrollYRef.current = window.scrollY;
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) return;
      if (actionMenuOpen || profileMenuOpen) return;
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable
      );
      if (editing) return;
      const nextY = window.scrollY;
      const delta = nextY - lastScrollYRef.current;
      if (Math.abs(delta) <= 3) return;
      scrollIntentRef.current = Math.sign(delta) === Math.sign(scrollIntentRef.current)
        ? scrollIntentRef.current + delta
        : delta;
      const nearTop = nextY < 32;
      const nearBottom = window.innerHeight + nextY >= document.documentElement.scrollHeight - 48;
      if (nearTop || nearBottom) {
        setBottomNavVisible(true);
      } else if (scrollIntentRef.current > 36 && nextY > 96) {
        setBottomNavVisible(false);
      } else if (scrollIntentRef.current < -18) {
        setBottomNavVisible(true);
      }
      lastScrollYRef.current = nextY;
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )) {
        setBottomNavVisible(false);
      }
    };
    const onFocusOut = () => {
      window.setTimeout(() => setBottomNavVisible(true), 120);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
    };
  }, [actionMenuOpen, profileMenuOpen]);

  function handleCreateWager() {
    setActionMenuOpen(false);
    navigate('/create-wager');
  }

  function handleCreateBet() {
    setActionMenuOpen(false);
    navigate('/create');
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#edf0e8] text-ink">
      <aside className="fixed left-0 top-0 hidden h-full w-64 flex-col border-r border-line/70 bg-[#f8faf4] p-4 lg:flex">
        <div className="mb-7 flex items-baseline justify-between gap-3 px-1">
          <div className="flex items-baseline gap-2">
            <span className="mb-0.5 h-2 w-2 shrink-0 rounded-full bg-mint" />
            <p className="text-xl font-black tracking-tight">Called it</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
          <div className="relative pt-2 hidden lg:block">
            <button
              onClick={() => setActionMenuOpen((open) => !open)}
              className="btn-special group w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold"
            >
              <CirclePlus size={17} />
              <span>Create</span>
            </button>
            {actionMenuOpen && window.matchMedia('(min-width: 1024px)').matches && (
              <>
                <button
                  className="fixed inset-0 z-20"
                  onClick={() => setActionMenuOpen(false)}
                  aria-label="Close menu"
                />
                <div className="absolute top-full left-0 right-0 mt-2 animate-soft-enter rounded-xl border border-line bg-white shadow-lift overflow-hidden z-30">
                  <Link
                    to="/create"
                    onClick={() => setActionMenuOpen(false)}
                    className="block w-full px-3 py-2.5 text-sm font-bold text-ink hover:bg-field transition"
                  >
                    Create bet
                  </Link>
                  <Link
                    to="/create-wager"
                    onClick={() => setActionMenuOpen(false)}
                    className="block w-full px-3 py-2.5 text-sm font-bold text-ink hover:bg-field transition border-t border-line"
                  >
                    Create wager
                  </Link>
                </div>
              </>
            )}
          </div>
        </nav>

        <div className="mt-4 rounded-2xl border border-line/70 bg-white p-3 shadow-soft">
          <div className="flex items-center gap-3">
            <Avatar name={profile?.displayName ?? 'FF'} src={profile?.photoURL} round />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{profile?.displayName}</p>
              <p className="truncate text-xs text-ink/45">@{profile?.username}</p>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-field px-3 py-2">
            <CoinAmount amount={profile?.coinBalance ?? 0} className="text-xs" />
            <span className="ml-auto text-xs font-semibold text-ink/45">{profile?.rating ?? 1000} ELO</span>
          </div>
          <div className="mt-2 flex gap-2">
            <NavLink
              to="/me"
              className="grid h-9 flex-1 place-items-center rounded-xl border border-line bg-white text-ink/55 transition hover:bg-field hover:text-ink"
              title="Profile"
            >
              <User size={16} />
            </NavLink>
            <button
              onClick={logout}
              className="grid h-9 flex-1 place-items-center rounded-xl border border-line bg-white text-ink/55 transition hover:bg-field hover:text-ink"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="max-w-full overflow-x-hidden pb-24 lg:ml-64 lg:pb-6">
        <div className="mx-auto max-w-5xl overflow-x-hidden px-4 pb-6 pt-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {(actionMenuOpen || profileMenuOpen) && !window.matchMedia('(min-width: 1024px)').matches ? (
        <button
          type="button"
          className="fixed inset-0 z-30 animate-fade-in bg-ink/35 transition"
          onClick={() => {
            setActionMenuOpen(false);
            setProfileMenuOpen(false);
          }}
          aria-label="Close menu"
        />
      ) : null}

      {actionMenuOpen && !window.matchMedia('(min-width: 1024px)').matches ? (
        <div className="fixed bottom-24 left-4 right-4 z-40 grid animate-soft-enter gap-2 rounded-2xl border border-line bg-white p-3 shadow-lift">
          <Link
            to="/create"
            onClick={() => setActionMenuOpen(false)}
            className="rounded-xl bg-ink px-4 py-3 text-center text-sm font-black text-white transition hover:shadow-soft active:scale-95"
          >
            Create bet
          </Link>
          <Link
            to="/create-wager"
            onClick={() => setActionMenuOpen(false)}
            className="rounded-xl border border-line bg-field px-4 py-3 text-center text-sm font-black text-ink transition hover:shadow-soft active:scale-95"
          >
            Create wager
          </Link>
        </div>
      ) : null}

      {profileMenuOpen ? (
        <div className="fixed bottom-24 right-4 z-40 w-56 animate-soft-enter rounded-2xl border border-line bg-white p-2 shadow-lift lg:hidden">
          <Link to="/me" className="block rounded-xl px-3 py-2.5 text-sm font-bold text-ink" onClick={() => setProfileMenuOpen(false)}>
            Profile
          </Link>
          <Link to="/history" className="block rounded-xl px-3 py-2.5 text-sm font-bold text-ink" onClick={() => setProfileMenuOpen(false)}>
            History
          </Link>
          <Link to="/mine" className="block rounded-xl px-3 py-2.5 text-sm font-bold text-ink" onClick={() => setProfileMenuOpen(false)}>
            My bets
          </Link>
          <Link to="/how-to-play" className="block rounded-xl px-3 py-2.5 text-sm font-bold text-ink" onClick={() => setProfileMenuOpen(false)}>
            How to Play
          </Link>
          {showInstallNav ? (
            <Link to="/install" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-ink" onClick={() => setProfileMenuOpen(false)}>
              <Download size={15} /> Install App
            </Link>
          ) : null}
          <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-coral">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      ) : null}

      <nav
        className={`fixed bottom-0 left-0 right-0 z-50 grid grid-cols-[repeat(3,minmax(0,1fr))_64px_repeat(3,minmax(0,1fr))] items-center border-t border-line bg-[#f8faf4] px-2 pt-2 shadow-lift transition-transform duration-200 lg:hidden ${
          bottomNavVisible || actionMenuOpen || profileMenuOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: `max(0.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))` }}
      >
        <BottomNavLink to="/" label="Bets" icon={Home} />
        <BottomNavLink to="/challenges" label="Challenges" icon={Trophy} />
        <BottomNavLink to="/groups" label="Groups" icon={Users} />
        <button
          type="button"
          onClick={() => {
            setProfileMenuOpen(false);
            setActionMenuOpen((open) => !open);
            setBottomNavVisible(true);
          }}
          className={`btn-special mx-auto -mt-8 h-16 w-16 rounded-full border-[6px] border-[#edf0e8] grid place-items-center ${
            actionMenuOpen ? '' : ''
          }`}
          aria-label="Create"
        >
          <CirclePlus size={30} />
        </button>
        <BottomNavLink to="/minigames" label="Games" icon={Gamepad2} />
        <BottomNavLink to="/leaderboard" label="Ranks" icon={Medal} />
        <button
          type="button"
          onClick={() => {
            setActionMenuOpen(false);
            setProfileMenuOpen((open) => !open);
            setBottomNavVisible(true);
          }}
          className="rounded-2xl transition-colors active:bg-field lg:hidden grid h-12 place-items-center"
          aria-label="Profile menu"
          style={{ backfaceVisibility: 'hidden' } as React.CSSProperties}
        >
          <span className={`rounded-full transition-all ${
            location.pathname === '/me' || location.pathname.startsWith('/profile/')
              ? 'bg-ink shadow-soft ring-2 ring-ink'
              : 'bg-transparent'
          } grid h-10 w-10 place-items-center shrink-0`}
            style={{ backfaceVisibility: 'hidden', WebkitFontSmoothing: 'antialiased' } as React.CSSProperties}
          >
            <Avatar name={profile?.displayName ?? 'Me'} src={profile?.photoURL} round />
          </span>
        </button>
      </nav>
    </div>
  );
}
