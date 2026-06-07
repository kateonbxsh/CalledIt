import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Layout } from './components/Layout';
import { useAuth } from './contexts/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { BetDetailPage } from './pages/BetDetailPage';
import { CreateBetPage } from './pages/CreateBetPage';
import { FeedPage } from './pages/FeedPage';
import { FriendGroupsPage } from './pages/FriendGroupsPage';
import { HowToPlayPage } from './pages/HowToPlayPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { MyBetsPage } from './pages/MyBetsPage';
import { PredictionHistoryPage } from './pages/PredictionHistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

function PrivateRoute({ children }: { children: ReactNode }) {
  const { authUser, loading } = useAuth();
  if (loading) return <div className="p-6 text-sm text-ink/70">Loading...</div>;
  if (!authUser) return <Navigate to="/auth" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<FeedPage scope="public" />} />
        <Route path="private" element={<FeedPage scope="private" />} />
        <Route path="mine" element={<MyBetsPage />} />
        <Route path="history" element={<PredictionHistoryPage />} />
        <Route path="groups" element={<FriendGroupsPage />} />
        <Route path="create" element={<CreateBetPage />} />
        <Route path="bets/:betId" element={<BetDetailPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="how-to-play" element={<HowToPlayPage />} />
        <Route path="profile/:uid" element={<ProfilePage />} />
        <Route path="me" element={<SettingsPage />} />
        <Route path="settings" element={<Navigate to="/me" replace />} />
      </Route>
    </Routes>
  );
}
