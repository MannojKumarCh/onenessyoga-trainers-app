import { useState } from 'react';
import client from '../api/client';
import PasswordInput from '../components/PasswordInput';
import { getApiErrorMessage } from '../utils/apiError';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatRole } from '../utils/formatRole';

function SectionHeader({ title, editing, onEdit }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <p className="list-item-title" style={{ margin: 0 }}>{title}</p>
      {!editing && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 13, padding: '4px 10px' }} onClick={onEdit}>
          Edit
        </button>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="form-group">
      <label className="label">{label}</label>
      <p style={{ margin: 0 }}>{value}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();

  const [editingProfile, setEditingProfile] = useState(false);
  const [name, setName] = useState(user.name);
  const [zoomLink, setZoomLink] = useState(user.zoom_link || '');
  const [whatsappNumber, setWhatsappNumber] = useState(user.whatsapp_number || '');
  const [profileError, setProfileError] = useState('');
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  function openEditProfile() {
    setName(user.name);
    setZoomLink(user.zoom_link || '');
    setWhatsappNumber(user.whatsapp_number || '');
    setProfileError('');
    setEditingProfile(true);
  }

  function openEditEmail() {
    setNewEmail('');
    setEmailPassword('');
    setEmailError('');
    setEditingEmail(true);
  }

  function openEditPassword() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setEditingPassword(true);
  }

  async function saveProfile(e) {
    e.preventDefault();
    setProfileError('');
    if (whatsappNumber && !/^\+[1-9]\d{6,14}$/.test(whatsappNumber)) {
      setProfileError('WhatsApp number must include the country code, e.g. +919876543210');
      return;
    }
    setProfileSubmitting(true);
    try {
      await client.put('/auth/me', { name, zoom_link: zoomLink || null, whatsapp_number: whatsappNumber || null });
      updateUser({ name, zoom_link: zoomLink || null, whatsapp_number: whatsappNumber || null });
      showToast('Profile Updated');
      setEditingProfile(false);
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
      showToast('Email Updated');
      setEditingEmail(false);
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
      showToast('Password Updated');
      setEditingPassword(false);
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
        <SectionHeader title="Profile" editing={editingProfile} onEdit={openEditProfile} />

        {editingProfile ? (
          <form onSubmit={saveProfile}>
            <div className="form-group">
              <label className="label" htmlFor="profile-name">Name</label>
              <input id="profile-name" className="input" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="profile-zoom">Zoom Link</label>
              <input id="profile-zoom" className="input" type="url" placeholder="https://us06web.zoom.us/j/…" value={zoomLink} onChange={e => setZoomLink(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="profile-whatsapp">WhatsApp Number</label>
              <input id="profile-whatsapp" className="input" type="tel" placeholder="+919876543210" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} />
              <p className="hint-text">Include the country code (e.g. +91 for India)</p>
            </div>
            {profileError && <p className="error-text" style={{ marginBottom: 12 }}>{profileError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={profileSubmitting} onClick={() => setEditingProfile(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} type="submit" disabled={profileSubmitting}>
                {profileSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <DetailRow label="Name" value={user.name} />
            <DetailRow label="Roles" value={user.roles.map(formatRole).join(', ')} />
            <DetailRow label="Zoom Link" value={user.zoom_link || '—'} />
            <DetailRow label="WhatsApp Number" value={user.whatsapp_number || '—'} />
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <SectionHeader title="Email" editing={editingEmail} onEdit={openEditEmail} />

        {editingEmail ? (
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={emailSubmitting} onClick={() => setEditingEmail(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} type="submit" disabled={emailSubmitting}>
                {emailSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <DetailRow label="Email" value={user.email} />
        )}
      </div>

      <div className="card">
        <SectionHeader title="Password" editing={editingPassword} onEdit={openEditPassword} />

        {editingPassword ? (
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={passwordSubmitting} onClick={() => setEditingPassword(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} type="submit" disabled={passwordSubmitting}>
                {passwordSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <DetailRow label="Password" value="••••••••" />
        )}
      </div>
    </div>
  );
}
