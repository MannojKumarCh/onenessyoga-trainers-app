import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import InstallAppButton from '../components/InstallAppButton';

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleMessage, setGoogleMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setGoogleMessage(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    setError('');
    setGoogleMessage(null);
    const result = await loginWithGoogle(credentialResponse.credential);
    if (result.pending) {
      setGoogleMessage({ type: 'info', text: result.message });
    } else if (result.error) {
      setGoogleMessage({ type: 'error', text: result.error });
    }
  }

  return (
    <div style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
      background: 'linear-gradient(180deg, var(--bg) 0%, #FFFFFF 100%)'
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        animation: 'pageEnter 0.4s ease-out'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(232, 97, 77, 0.3)'
          }}>
            <img src="/oneness-yoga-logo.png" alt="Oneness Yoga" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>Oneness Yoga</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 15 }}>Sign In To Continue</p>
        </div>

        {/* Login Card */}
        <div style={{
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
          padding: '28px 24px', boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--border-light)'
        }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="login-password">Password</label>
              <PasswordInput
                id="login-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

            <div style={{ textAlign: 'right', marginBottom: 16 }}>
              <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>Forgot password?</Link>
            </div>

            <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Signing In…' : 'Sign In'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setGoogleMessage({ type: 'error', text: 'Google Sign-In Failed' })}
            />
          </div>

          {googleMessage && (
            <p
              className={googleMessage.type === 'error' ? 'error-text' : 'hint-text'}
              style={{ marginTop: 14, textAlign: 'center' }}
            >
              {googleMessage.text}
            </p>
          )}

          <InstallAppButton variant="text" />
        </div>
      </div>
    </div>
  );
}
