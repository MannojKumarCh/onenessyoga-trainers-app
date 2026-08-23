import { useState } from 'react';
import client from '../api/client';
import PasswordInput from '../components/PasswordInput';
import { getApiErrorMessage } from '../utils/apiError';
import { useAuth } from '../context/AuthContext';

export default function ChangePasswordPage() {
  const { updateUser, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await client.put('/auth/me/password', { current_password: currentPassword, new_password: newPassword });
      updateUser({ must_change_password: false });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to change password'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
      background: 'linear-gradient(180deg, var(--bg) 0%, #FFFFFF 100%)'
    }}>
      <div style={{ width: '100%', maxWidth: 380, animation: 'pageEnter 0.4s ease-out' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(232, 97, 77, 0.3)'
          }}>
            <img src="/oneness-yoga-logo.png" alt="Oneness Yoga" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>Set a New Password</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 15 }}>
            For security, you need to set your own password before continuing
          </p>
        </div>

        <div style={{
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
          padding: '28px 24px', boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--border-light)'
        }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label" htmlFor="change-current-password">Current (Temporary) Password</label>
              <PasswordInput
                id="change-current-password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="change-new-password">New Password</label>
              <PasswordInput
                id="change-new-password"
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="change-confirm-password">Confirm New Password</label>
              <PasswordInput
                id="change-confirm-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

            <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Saving…' : 'Set New Password'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button
              type="button"
              onClick={logout}
              style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
