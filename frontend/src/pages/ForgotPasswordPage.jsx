import { useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { getApiErrorMessage } from '../utils/apiError';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await client.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Something went wrong. Please try again.'));
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
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>Forgot Password</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 15 }}>
            {sent ? "Check your email for a reset link" : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        <div style={{
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
          padding: '28px 24px', boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--border-light)'
        }}>
          {sent ? (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
              If an account exists for <strong>{email}</strong>, a password reset link has been sent. The link expires in 1 hour.
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="label" htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

              <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                {loading ? 'Sending…' : 'Send Reset Link'}
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
