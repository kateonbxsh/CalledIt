import {
  ArrowLeft,
  BarChart3,
  CirclePlus,
  Download,
  Gamepad2,
  HelpCircle,
  History,
  Home,
  LogOut,
  Medal,
  Menu,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar';
import { CoinAmount } from './CoinAmount';
import { useAuth } from '../contexts/AuthContext';
import { isMobileBrowser, isStandaloneApp } from '../utils/device';

const navItems = [
  { to: '/', label: 'Feed', icon: Home },
  { to: '/create', label: 'Create', icon: CirclePlus },
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

function MobileNavItem({
  to,
  label,
  icon: Icon,
  expanded,
  onNavigate,
}: (typeof navItems)[number] & { expanded: boolean; onNavigate: () => void }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-all duration-150 ${
          isActive
            ? 'bg-ink text-white shadow-sm'
            : 'text-ink/60 hover:bg-white hover:text-ink hover:shadow-sm'
        }`
      }
      title={label}
    >
      {({ isActive }) => (
        <>
          <Icon size={18} className={`shrink-0 ${isActive ? 'text-white' : 'text-ink/50 group-hover:text-ink'}`} />
          <span className={`truncate transition-opacity ${expanded ? 'opacity-100' : 'w-0 opacity-0'}`}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function Layout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showInstallNav, setShowInstallNav] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; valid: boolean } | null>(null);
  const mobileNavItems = [
    ...(showInstallNav ? [{ to: '/install', label: 'Install App', icon: Download }] : []),
    ...navItems,
    { to: '/me', label: 'Profile', icon: User },
  ];
  const canGoBack = /^\/bets\/[^/]+/.test(location.pathname) || /^\/profile\/[^/]+/.test(location.pathname);

  useEffect(() => {
    setShowInstallNav(isMobileBrowser() && !isStandaloneApp());
  }, [location.pathname]);

  useEffect(() => {
    const interactiveSelector = 'a, button, input, textarea, select, label, summary, [role="button"], [data-swipe-ignore="true"]';
    const onTouchStart = (event: TouchEvent) => {
      if (window.matchMedia('(min-width: 1024px)').matches || mobileNavOpen) return;
      const target = event.target instanceof Element ? event.target : null;
      const touch = event.touches[0];
      if (!touch || target?.closest(interactiveSelector)) {
        touchStartRef.current = null;
        return;
      }
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, valid: true };
    };
    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start?.valid) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = Math.abs(touch.clientY - start.y);
      if (dx > 70 && dx > dy * 1.4) setMobileNavOpen(true);
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [mobileNavOpen]);

  return (
    <div className="min-h-screen bg-[#edf0e8] text-ink">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 flex-col border-r border-line/70 bg-[#f8faf4] p-4 lg:flex">
        {/* Brand */}
        <div className="mb-7 flex items-baseline justify-between gap-3 px-1 [&>p:last-child]:hidden">
          <div className="flex items-baseline gap-2">
            <span className="h-2 w-2 rounded-full bg-mint mb-0.5 shrink-0" />
            <p className="text-xl font-black tracking-tight">Called it</p>
          </div>
          <p className="font-arabic text-sm font-black text-ink/40" dir="rtl">كنت عارف</p>
          <p className="font-arabic text-sm font-black text-ink/40" dir="rtl">كنت عارف</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* User card */}
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

      {/* Main content */}
      <main className="pb-6 lg:ml-64">
        <div className="mx-auto max-w-5xl px-4 pb-6 pt-16 sm:px-6 lg:px-8 lg:pt-6">
          <Outlet />
        </div>
      </main>

      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-ink/10 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}

      {/* Mobile app controls */}
      <div className={`fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between bg-[#edf0e8]/92 px-3 backdrop-blur-md transition lg:hidden ${
        mobileNavOpen ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}>
        {canGoBack ? (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink/70 shadow-soft transition active:scale-95"
            aria-label="Go back"
            title="Back"
          >
            <ArrowLeft size={20} />
          </button>
        ) : <span className="h-10 w-10" />}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink/70 shadow-soft transition active:scale-95"
          aria-label="Open navigation"
          title="Menu"
        >
          <Menu size={19} />
        </button>
      </div>

      <aside
        className={`fixed bottom-0 left-0 top-0 z-30 flex w-64 flex-col border-r border-line/70 bg-[#f8faf4]/95 p-2 shadow-soft backdrop-blur-md transition-transform duration-200 lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-ink/70 transition hover:bg-field hover:text-ink"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>

        <div className="mb-3 min-h-8 overflow-hidden px-1">
          <div className="flex items-baseline gap-2 whitespace-nowrap [&>p:last-child]:hidden">
            <span className="mb-0.5 h-2 w-2 shrink-0 rounded-full bg-mint" />
            <p className="text-lg font-black tracking-tight">Called it</p>
            <p className="ml-auto shrink-0 font-arabic text-xs font-black leading-none text-ink/40" dir="rtl">كنت عارف</p>
            <p className="ml-auto font-arabic text-xs font-black text-ink/40" dir="rtl">ÙƒÙ†Øª Ø¹Ø§Ø±Ù</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
          {mobileNavItems.map((item) => (
            <MobileNavItem
              key={item.to}
              {...item}
              expanded
              onNavigate={() => setMobileNavOpen(false)}
            />
          ))}
        </nav>

        <div className="mt-3 overflow-hidden">
          <div className="rounded-2xl border border-line/70 bg-white p-3 shadow-soft">
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
            <button
              onClick={logout}
              className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm font-semibold text-ink/55 transition hover:bg-field hover:text-ink"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
