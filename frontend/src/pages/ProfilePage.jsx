import { useState } from 'react';
import client from '../api/client';
import PasswordInput from '../components/PasswordInput';
import { getApiErrorMessage } from '../utils/apiError';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatRole } from '../utils/formatRole';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState(user.name);
  const [zoomLink, setZoomLink] = useState(user.zoom_link || '');
  const [profileError, setProfileError] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    setProfileError('');
    setProfileSubmitting(true);
    try {
      await client.put('/auth/me', { name, zoom_link: zoomLink || null });
      updateUser({ name, zoom_link: zoomLink || null });
      showToast('Profile Updated');
    } catch (err) {
      setProfileError(getApiErrorMessage(err, 'Failed to update profile'));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function changeEmail(e) {
    e.preventDefault();
    setEmailError('');
    setEmailSubmitting(true);
    try {
      const { data } = await client.put('/auth/me/email', { current_password: emailPassword, new_email: newEmail });
      updateUser({ email: data.email });
      setNewEmail('');
      setEmailPassword('');
      showToast('Email Updated');
    } catch (err) {
      setEmailError(getApiErrorMessage(err, 'Failed to update email'));
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordSubmitting(true);
    try {
      await client.put('/auth/me/password', { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password Updated');
    } catch (err) {
      setPasswordError(getApiErrorMessage(err, 'Failed to update password'));
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My Profile</h1>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <p className="list-item-sub" style={{ marginBottom: 16 }}>
          {user.email} · {user.roles.map(formatRole).join(', ')}
        </p>

        <form onSubmit={saveProfile}>
          <div className="form-group">
            <label className="label" htmlFor="profile-name">Name</label>
            <input id="profile-name" className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="profile-zoom">Zoom Link</label>
            <input id="profile-zoom" className="input" type="url" placeholder="https://us06web.zoom.us/j/…" value={zoomLink} onChange={e => setZoomLink(e.target.value)} />
          </div>
          {profileError && <p className="error-text" style={{ marginBottom: 12 }}>{profileError}</p>}
          <button className="btn btn-primary" type="submit" disabled={profileSubmitting}>
            {profileSubmitting ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <p className="list-item-title" style={{ marginBottom: 4 }}>Change Email</p>
        <p className="hint-text" style={{ marginBottom: 16 }}>Current email: {user.email}</p>

        <form onSubmit={changeEmail}>
          <div className="form-group">
            <label className="label" htmlFor="new-email">New Email</label>
            <input id="new-email" className="input" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="email-current-password">Current Password</label>
            <PasswordInput id="email-current-password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {emailError && <p className="error-text" style={{ marginBottom: 12 }}>{emailError}</p>}
          <button className="btn btn-primary" type="submit" disabled={emailSubmitting}>
            {emailSubmitting ? 'Saving…' : 'Update Email'}
          </button>
        </form>
      </div>

      <div className="card">
        <p className="list-item-title" style={{ marginBottom: 16 }}>Change Password</p>

        <form onSubmit={changePassword}>
          <div className="form-group">
            <label className="label" htmlFor="profile-current-password">Current Password</label>
            <PasswordInput id="profile-current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="profile-new-password">New Password</label>
            <PasswordInput id="profile-new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="profile-confirm-password">Confirm New Password</label>
            <PasswordInput id="profile-confirm-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </div>
          {passwordError && <p className="error-text" style={{ marginBottom: 12 }}>{passwordError}</p>}
          <button className="btn btn-primary" type="submit" disabled={passwordSubmitting}>
            {passwordSubmitting ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
