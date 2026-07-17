import { Outlet, NavLink } from 'react-router-dom';
import PushNotificationsPrompt from './PushNotificationsPrompt';

const NAV = [
  { to: '/', label: 'Home', icon: '⊞', exact: true },
  { to: '/sessions', label: 'Sessions', icon: '📅' },
  { to: '/completed', label: 'Done', icon: '✓' },
  { to: '/leaves', label: 'Leaves', icon: '📝' },
  { to: '/sequences', label: 'Sequence', icon: '⊡' },
  { to: '/resources', label: 'Resources', icon: '📚' },
];

export default function TrainerLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PushNotificationsPrompt />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Outlet />
      </div>
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--white)', borderTop: '1px solid var(--border)',
        display: 'flex', paddingBottom: 'var(--safe-bottom)',
        zIndex: 50
      }}>
        {NAV.map(({ to, label, icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            style={({ isActive }) => ({
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '8px 4px', fontSize: '10px', fontWeight: 600, gap: 2,
              color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
              textDecoration: 'none', minHeight: 'var(--nav-height)'
            })}
          >
            <span style={{ fontSize: '20px' }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
