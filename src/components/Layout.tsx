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
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${
          isActive ? 'bg-ink text-white' : 'text-ink/70 hover:bg-white hover:text-ink'
        }`
      }
    >
      <Icon size={18} />
      <span className="hidden lg:inline">{label}</span>
    </NavLink>
  );
}

export function Layout() {
  const { profile, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#f1f3ec] text-ink">
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r border-line bg-[#fbfcf6] p-4 lg:block">
        <div className="mb-8 flex items-baseline justify-between gap-3">
          <p className="text-xl font-black tracking-normal">Called it</p>
          <p className="font-arabic text-sm font-black text-ink/55" dir="rtl">
            كنت عارف
          </p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4 rounded-md border border-line bg-white p-3">
          <div className="flex items-center gap-3">
            <Avatar name={profile?.displayName ?? 'FF'} src={profile?.photoURL} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile?.displayName}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-ink/60">
                <CoinAmount amount={profile?.coinBalance ?? 0} className="text-xs" />
                <span>{profile?.rating ?? 1000} ELO</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <NavLink
              to="/me"
              className="grid h-9 flex-1 place-items-center rounded-md border border-line text-ink/70 transition hover:bg-field"
              title="Profile"
            >
              <User size={17} />
            </NavLink>
            <button
              onClick={logout}
              className="grid h-9 flex-1 place-items-center rounded-md border border-line text-ink/70 transition hover:bg-field"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="pb-20 lg:ml-64 lg:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-[#fbfcf6]/95 px-2 py-2 backdrop-blur lg:hidden">
        <div className="grid grid-cols-6 gap-1">
          {navItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `grid h-12 place-items-center rounded-md transition ${
                  isActive ? 'bg-ink text-white' : 'text-ink/65'
                }`
              }
              title={item.label}
            >
              <item.icon size={20} />
            </NavLink>
          ))}
          <NavLink
            to="/me"
            className={({ isActive }) =>
              `grid h-12 place-items-center rounded-md transition ${
                isActive ? 'bg-ink text-white' : 'text-ink/65'
              }`
            }
            title="Profile"
          >
            <User size={20} />
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
