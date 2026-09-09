import { Outlet, NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PushNotificationsPrompt from './PushNotificationsPrompt';
import NotificationBell from './NotificationBell';
import InstallAppButton from './InstallAppButton';
import { buildNav } from '../config/nav';
import { formatRole } from '../utils/formatRole';
import { ArrowRightStartOnRectangleIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import { usePullToRefreshGesture, PULL_THRESHOLD } from '../hooks/usePullToRefresh';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = buildNav(user.roles);
  const roleLabel = user.roles.map(formatRole).join(' + ');
  const { containerRef, pullDistance, refreshing } = usePullToRefreshGesture();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="app-header">
        <Link to="/" className="app-header-title" style={{ color: 'inherit', textDecoration: 'none' }}>
          <img src="/oneness-yoga-logo.png" alt="Oneness Yoga" style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover' }} />
          <span>Oneness Yoga</span>
          <span style={{ fontWeight: 400, opacity: 0.8, fontSize: 13 }}>{roleLabel}</span>
        </Link>
        <div className="app-header-actions">
          <InstallAppButton variant="icon" />
          <NotificationBell />
          <Link to="/profile" className="header-icon-btn" aria-label="My Profile" title="My Profile">
            <UserCircleIcon style={{ width: 21, height: 21 }} />
          </Link>
          <button onClick={logout} className="header-icon-btn" aria-label="Logout" title="Logout">
            <ArrowRightStartOnRectangleIcon style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </div>
      <PushNotificationsPrompt />
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {(pullDistance > 0 || refreshing) && (
          <div
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 50, zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
              transform: `translateY(${refreshing ? 6 : pullDistance - 40}px)`,
              opacity: refreshing ? 1 : Math.min(pullDistance / PULL_THRESHOLD, 1),
              transition: refreshing ? 'transform 0.15s ease-out' : 'none'
            }}
          >
            <span
              className="spinner"
              style={!refreshing ? { animation: 'none', transform: `rotate(${pullDistance * 3}deg)` } : undefined}
            />
          </div>
        )}
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
