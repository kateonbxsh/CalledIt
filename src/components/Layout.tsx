import {
  BarChart3,
  CirclePlus,
  HelpCircle,
  History,
  Home,
  Lock,
  LogOut,
  Medal,
  User,
  Users,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { Avatar } from './Avatar';
import { CoinAmount } from './CoinAmount';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/', label: 'Feed', icon: Home },
  { to: '/private', label: 'Private', icon: Lock },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/create', label: 'Create', icon: CirclePlus },
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

export function Layout() {
  const { profile, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#edf0e8] text-ink">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 flex-col border-r border-line/70 bg-[#f8faf4] p-4 lg:flex">
        {/* Brand */}
        <div className="mb-7 flex items-baseline justify-between gap-3 px-1">
          <div className="flex items-baseline gap-2">
            <span className="h-2 w-2 rounded-full bg-mint mb-0.5 shrink-0" />
            <p className="text-xl font-black tracking-tight">Called it</p>
          </div>
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
      <main className="pb-24 lg:ml-64 lg:pb-6">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-line/70 bg-[#f8faf4]/95 px-2 py-2 backdrop-blur-md lg:hidden">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {[...navItems, { to: '/me', label: 'Profile', icon: User }].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex shrink-0 flex-col items-center justify-center gap-0.5 h-13 w-14 rounded-xl transition ${
                  isActive ? 'bg-ink text-white' : 'text-ink/50 hover:bg-white hover:text-ink'
                }`
              }
              title={item.label}
            >
              <item.icon size={18} />
              <span className="text-[9px] font-semibold leading-none">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
