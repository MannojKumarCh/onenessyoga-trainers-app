import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PushNotificationsPrompt from './PushNotificationsPrompt';
import NotificationBell from './NotificationBell';
import { buildNav } from '../config/nav';
import { formatRole } from '../utils/formatRole';
import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = buildNav(user.roles);
  const roleLabel = user.roles.map(formatRole).join(' + ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="app-header">
        <div className="app-header-title">
          <span>🧘</span>
          <span>Oneness Yoga</span>
          <span style={{ fontWeight: 400, opacity: 0.8, fontSize: 13 }}>{roleLabel}</span>
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
      {nav.length > 0 && (
        <nav className="bottom-nav">
          {nav.map(({ to, label, Icon, exact }) => (
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
      )}
    </div>
  );
}
