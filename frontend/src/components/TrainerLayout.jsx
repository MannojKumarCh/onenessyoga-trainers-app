import { Outlet, NavLink } from 'react-router-dom';
import PushNotificationsPrompt from './PushNotificationsPrompt';
import NotificationBell from './NotificationBell';
import { useAuth } from '../context/AuthContext';
import {
  HomeIcon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  DocumentTextIcon,
  QueueListIcon,
  BookOpenIcon,
  ArrowRightStartOnRectangleIcon
} from '@heroicons/react/24/outline';

const NAV = [
  { to: '/', label: 'Home', Icon: HomeIcon, exact: true },
  { to: '/sessions', label: 'Sessions', Icon: CalendarDaysIcon },
  { to: '/completed', label: 'Completed', Icon: CheckBadgeIcon },
  { to: '/leaves', label: 'Leaves', Icon: DocumentTextIcon },
  { to: '/sequences', label: 'Sequences', Icon: QueueListIcon },
  { to: '/resources', label: 'Resources', Icon: BookOpenIcon },
];

export default function TrainerLayout() {
  const { logout } = useAuth();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="app-header">
        <div className="app-header-title">
          <span>🧘</span>
          <span>Oneness Yoga</span>
          <span style={{ fontWeight: 400, opacity: 0.8, fontSize: 13 }}>Trainer</span>
        </div>
        <div className="app-header-actions">
          <NotificationBell />
          <button onClick={logout} className="header-icon-btn" aria-label="Logout" title="Logout">
            <ArrowRightStartOnRectangleIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </div>
      <PushNotificationsPrompt />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Outlet />
      </div>
      <nav className="bottom-nav">
        {NAV.map(({ to, label, Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Icon className="nav-link-icon" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
