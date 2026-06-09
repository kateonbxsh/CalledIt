import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Layout } from './components/Layout';
import { useAuth } from './contexts/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { BetDetailPage } from './pages/BetDetailPage';
import { ChallengesPage } from './pages/ChallengesPage';
import { CompleteProfilePage } from './pages/CompleteProfilePage';
import { CreateBetPage } from './pages/CreateBetPage';
import { FeedPage } from './pages/FeedPage';
import { FriendGroupsPage } from './pages/FriendGroupsPage';
import { HowToPlayPage } from './pages/HowToPlayPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { MinigamesPage } from './pages/MinigamesPage';
import { MyBetsPage } from './pages/MyBetsPage';
import { PredictionHistoryPage } from './pages/PredictionHistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { listenForForegroundNotifications, registerAppServiceWorker } from './services/notificationService';

function PrivateRoute({ children }: { children: ReactNode }) {
  const { authUser, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-6 text-sm text-ink/70">Loading...</div>;
  if (!authUser) return <Navigate to="/auth" replace />;
  if (!profile && location.pathname !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace />;
  }
  return children;
}

export function App() {
  const { profile } = useAuth();
  const [notificationToast, setNotificationToast] = useState<{ title: string; body: string; url: string } | null>(null);

  useEffect(() => {
    registerAppServiceWorker().catch(() => {});
  }, []);

  useEffect(() => {
    if (!profile) return undefined;
    let unsubscribe: (() => void) | undefined;
    listenForForegroundNotifications((payload) => {
      setNotificationToast(payload);
      window.setTimeout(() => setNotificationToast(null), 6000);
    }).then((nextUnsubscribe) => {
      unsubscribe = nextUnsubscribe;
    });
    return () => unsubscribe?.();
  }, [profile]);

  return (
    <>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/complete-profile"
          element={
            <PrivateRoute>
              <CompleteProfilePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<FeedPage />} />
          <Route path="mine" element={<MyBetsPage />} />
          <Route path="history" element={<PredictionHistoryPage />} />
          <Route path="groups" element={<FriendGroupsPage />} />
          <Route path="challenges" element={<ChallengesPage />} />
          <Route path="minigames" element={<MinigamesPage />} />
          <Route path="create" element={<CreateBetPage />} />
          <Route path="bets/:betId" element={<BetDetailPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="how-to-play" element={<HowToPlayPage />} />
          <Route path="profile/:uid" element={<ProfilePage />} />
          <Route path="me" element={<SettingsPage />} />
          <Route path="settings" element={<Navigate to="/me" replace />} />
        </Route>
      </Routes>
      {notificationToast ? (
        <a
          href={notificationToast.url}
          className="fixed bottom-4 right-4 z-50 block max-w-sm rounded-md border border-line bg-white p-4 text-sm shadow-lift"
        >
          <span className="block font-black">{notificationToast.title}</span>
          <span className="mt-1 block text-ink/65">{notificationToast.body}</span>
        </a>
      ) : null}
    </>
  );
}
