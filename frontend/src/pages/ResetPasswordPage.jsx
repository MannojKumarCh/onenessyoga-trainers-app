import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '../api/client';
import PasswordInput from '../components/PasswordInput';
import { getApiErrorMessage } from '../utils/apiError';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await client.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to reset password'));
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
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>Reset Password</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 15 }}>
            {done ? 'Your password has been reset' : 'Choose a new password'}
          </p>
        </div>

        <div style={{
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
          padding: '28px 24px', boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--border-light)'
        }}>
          {!token ? (
            <p className="error-text" style={{ textAlign: 'center', margin: 0 }}>
              This reset link is missing its token. Please request a new one.
            </p>
          ) : done ? (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
              You can now sign in with your new password.
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="label" htmlFor="reset-password">New Password</label>
                <PasswordInput
                  id="reset-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label className="label" htmlFor="reset-confirm-password">Confirm New Password</label>
                <PasswordInput
                  id="reset-confirm-password"
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
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link to="/login" style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 600 }}>Back to Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
