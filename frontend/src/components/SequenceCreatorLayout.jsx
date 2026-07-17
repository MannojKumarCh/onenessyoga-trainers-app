import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PushNotificationsPrompt from './PushNotificationsPrompt';

export default function SequenceCreatorLayout() {
  const { logout } = useAuth();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        background: 'var(--primary)', color: '#fff', padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <span style={{ fontWeight: 700 }}>🧘 Oneness Yoga</span>
        <button onClick={logout} style={{ color: '#fff', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
          Logout
        </button>
      </div>
      <PushNotificationsPrompt />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Outlet />
      </div>
    </div>
  );
}
