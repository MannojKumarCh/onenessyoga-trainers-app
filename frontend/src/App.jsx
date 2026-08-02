import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

function AppRoutes() {
  const { user } = useAuth();
  usePageTitle();

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
