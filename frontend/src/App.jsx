import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/LoginPage';
import AppLayout from './components/AppLayout';
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
import CreatorSequences from './pages/sequence-creator/Sequences';
import Notifications from './pages/Notifications';

// Precedence when a user has multiple roles: later roles' pages win on a
// path collision (e.g. both Admin and Trainer have a 'sequences' page).
const ROLE_PRECEDENCE = ['trainer', 'sequence_creator', 'super_admin'];

const ROUTES_BY_ROLE = {
  trainer: [
    { path: '', element: <Dashboard /> },
    { path: 'sessions', element: <MySessions /> },
    { path: 'sessions/:id', element: <SessionDetail /> },
    { path: 'completed', element: <CompletedSessions /> },
    { path: 'leaves', element: <Leaves /> },
    { path: 'sequences', element: <Sequences /> },
    { path: 'sequences/:id', element: <SequenceDetail /> },
    { path: 'resources', element: <Resources /> }
  ],
  // No '' entry: a pure Sequence Creator's home falls back to their
  // 'sequences' page (see buildRoutes below), matching the prior behavior
  // where CreatorSequences was both the index and the /sequences page.
  sequence_creator: [
    { path: 'sequences', element: <CreatorSequences /> },
    { path: 'sequences/:id', element: <SequenceDetail /> }
  ],
  super_admin: [
    { path: '', element: <AdminDashboard /> },
    { path: 'trainers', element: <AdminTrainers /> },
    { path: 'sessions', element: <AdminSessions /> },
    { path: 'leaves', element: <AdminLeaves /> },
    { path: 'sequences', element: <AdminSequences /> },
    { path: 'sequences/:id', element: <SequenceDetail /> },
    { path: 'resources', element: <AdminResources /> }
  ]
};

// Merges each active role's pages, in precedence order, so a user with
// multiple roles gets the union of every page they're entitled to (with the
// higher-privilege version winning any path collision).
function buildRoutes(roles) {
  const merged = new Map();
  for (const role of ROLE_PRECEDENCE) {
    if (!roles.includes(role)) continue;
    for (const route of ROUTES_BY_ROLE[role]) {
      merged.set(route.path, route.element);
    }
  }
  const indexElement = merged.get('') ?? merged.get('sequences');
  return { merged, indexElement };
}

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

  const { merged, indexElement } = buildRoutes(user.roles);

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={indexElement} />
        {[...merged.entries()].filter(([path]) => path !== '').map(([path, element]) => (
          <Route key={path} path={path} element={element} />
        ))}
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
