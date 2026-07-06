import { Outlet, NavLink } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '⊞', exact: true },
  { to: '/trainers', label: 'Trainers', icon: '👥' },
  { to: '/sessions', label: 'Sessions', icon: '📅' },
  { to: '/leaves', label: 'Leaves', icon: '📝' },
  { to: '/sequences', label: 'Sequences', icon: '⊡' },
  { to: '/resources', label: 'Resources', icon: '📚' },
];

export default function AdminLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        background: 'var(--primary)', color: '#fff', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600
      }}>
        <span>🧘</span> Oneness Yoga — Admin
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Outlet />
      </div>
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--white)', borderTop: '1px solid var(--border)',
        display: 'flex', paddingBottom: 'var(--safe-bottom)', zIndex: 50
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
            <span style={{ fontSize: '18px' }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
