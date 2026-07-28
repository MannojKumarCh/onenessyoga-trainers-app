import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PushNotificationsPrompt from './PushNotificationsPrompt';
import NotificationBell from './NotificationBell';
import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';

export default function SequenceCreatorLayout() {
  const { logout } = useAuth();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="app-header">
        <div className="app-header-title">
          <span>🧘</span>
          <span>Oneness Yoga</span>
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
    </div>
  );
}
