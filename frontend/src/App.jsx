import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/LoginPage';
import TrainerLayout from './components/TrainerLayout';
import AdminLayout from './components/AdminLayout';
import Dashboard from './pages/trainer/Dashboard';
import MySessions from './pages/trainer/MySessions';
import SessionDetail from './pages/trainer/SessionDetail';
import CompletedSessions from './pages/trainer/CompletedSessions';
import Leaves from './pages/trainer/Leaves';
import Sequences from './pages/trainer/Sequences';
import SequenceDetail from './pages/trainer/SequenceDetail';
import Resources from './pages/trainer/Resources';
import AdminDashboard from './pages/admin/Dashboard';
import AdminTrainers from './pages/admin/Trainers';
import AdminSessions from './pages/admin/Sessions';
import AdminLeaves from './pages/admin/Leaves';
import AdminSequences from './pages/admin/Sequences';
import AdminResources from './pages/admin/Resources';
import SequenceCreatorLayout from './components/SequenceCreatorLayout';
import CreatorSequences from './pages/sequence-creator/Sequences';
import Notifications from './pages/Notifications';

function usePageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const segment = pathname.split('/').filter(Boolean).pop();
    const label = segment ? segment[0].toUpperCase() + segment.slice(1) : 'Dashboard';
    document.title = `Oneness Yoga — ${label}`;
  }, [pathname]);
}

// Sends an already-logged-in user back to their home dashboard on a genuine
// fresh app boot (new tab, freshly (re)launched PWA) if they land on some
// other page - e.g. a mobile OS resuming/relaunching the PWA into a stale
// route from before. Runs exactly once per real JS load (empty dep array),
// so it can never fire again on later in-app navigation, and it never
// touches a session that's merely resuming in the background (that's the
// same live JS context - this effect already ran once at its original
// boot). Skips the redirect when the URL carries the notification
// deep-link marker (see sw.js's notificationclick handler), so tapping a
// push notification still takes you straight to the relevant page.
function useRedirectHomeOnFreshBoot(user) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (sessionStorage.getItem('appBooted')) return;
    sessionStorage.setItem('appBooted', '1');

    const isNotificationDeepLink = new URLSearchParams(location.search).get('entry') === 'notification';
    if (user && location.pathname !== '/' && !isNotificationDeepLink) {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function AppRoutes() {
  const { user } = useAuth();
  usePageTitle();
  useRedirectHomeOnFreshBoot(user);

  if (!user) return <Routes><Route path="*" element={<LoginPage />} /></Routes>;

  if (user.role === 'super_admin') {
    return (
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="trainers" element={<AdminTrainers />} />
          <Route path="sessions" element={<AdminSessions />} />
          <Route path="leaves" element={<AdminLeaves />} />
          <Route path="sequences" element={<AdminSequences />} />
          <Route path="sequences/:id" element={<SequenceDetail />} />
          <Route path="resources" element={<AdminResources />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (user.role === 'sequence_creator') {
    return (
      <Routes>
        <Route path="/" element={<SequenceCreatorLayout />}>
          <Route index element={<CreatorSequences />} />
          <Route path="sequences" element={<CreatorSequences />} />
          <Route path="sequences/:id" element={<SequenceDetail />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<TrainerLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="sessions" element={<MySessions />} />
        <Route path="sessions/:id" element={<SessionDetail />} />
        <Route path="completed" element={<CompletedSessions />} />
        <Route path="leaves" element={<Leaves />} />
        <Route path="sequences" element={<Sequences />} />
        <Route path="sequences/:id" element={<SequenceDetail />} />
        <Route path="resources" element={<Resources />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
