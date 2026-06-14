import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Layout } from './components/Layout';
import { Lightbox } from './components/Lightbox';
import { useAuth } from './contexts/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { BetDetailPage } from './pages/BetDetailPage';
import { ChallengesPage } from './pages/ChallengesPage';
import { CompleteProfilePage } from './pages/CompleteProfilePage';
import { CreateBetPage } from './pages/CreateBetPage';
import { CreateWagerPage } from './pages/CreateWagerPage';
import { FeedPage } from './pages/FeedPage';
import { FriendGroupsPage } from './pages/FriendGroupsPage';
import { HowToPlayPage } from './pages/HowToPlayPage';
import { InstallAppPage } from './pages/InstallAppPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { MinigamesPage } from './pages/MinigamesPage';
import { MyBetsPage } from './pages/MyBetsPage';
import { PredictionHistoryPage } from './pages/PredictionHistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { listenForForegroundNotifications, refreshPushTokenIfEnabled, registerAppServiceWorker } from './services/notificationService';

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#edf0e8] text-ink">
      <div className="grid place-items-center gap-3">
        <img src="./pwa-icon.svg" alt="" className="h-28 w-28 animate-soft-enter rounded-[28px] shadow-lift" />
        <p className="text-sm font-black">Called it</p>
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full w-1/2 animate-fill-bar rounded-full bg-mint" />
        </div>
      </div>
    </div>
  );
}

function PrivateRoute({ children }: { children: ReactNode }) {
  const { authUser, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
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
    // Keep this device's FCM token fresh (tokens rotate); no-op unless already opted in.
    refreshPushTokenIfEnabled(profile).catch(() => {});
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
          <Route path="create-wager" element={<CreateWagerPage />} />
          <Route path="bets/:betId" element={<BetDetailPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="how-to-play" element={<HowToPlayPage />} />
          <Route path="install" element={<InstallAppPage />} />
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
      <Lightbox />
    </>
  );
}
