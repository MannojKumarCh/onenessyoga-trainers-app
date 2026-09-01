import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import PasswordInput from '../../components/PasswordInput';
import { useAuth } from '../../context/AuthContext';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatRole } from '../../utils/formatRole';
import { ExclamationTriangleIcon, PlusIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

const ROLE_OPTIONS = ['trainer', 'kids_yoga_trainer', 'sequence_creator', 'super_admin'];
const EMPTY = { name: '', email: '', password: '', roles: ['trainer'], zoom_link: '', whatsapp_number: '' };

export default function AdminTrainers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [defaultSlotIds, setDefaultSlotIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resetPw, setResetPw] = useState({ show: false, id: null, password: '' });
  const [resetPwError, setResetPwError] = useState('');
  const [resetPwSubmitting, setResetPwSubmitting] = useState(false);
  const [deactivating, setDeactivating] = useState(null);
  const [actionError, setActionError] = useState('');
  const [googleActionError, setGoogleActionError] = useState('');
  const [googleActionSubmittingId, setGoogleActionSubmittingId] = useState(null);

  const { showToast } = useToast();

  const load = useCallback(() => {
    Promise.all([client.get('/users'), client.get('/session-templates')])
      .then(([u, t]) => { setUsers(u.data); setTemplates(t.data); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  
  usePolling(load, 30000);

  function openAdd() { setEditing(null); setForm(EMPTY); setDefaultSlotIds([]); setError(''); setShowForm(true); }
  function openEdit(u) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', roles: u.roles, zoom_link: u.zoom_link || '', whatsapp_number: u.whatsapp_number || '' });
    setDefaultSlotIds(templates.filter(t => t.dedicated_trainer_id === u.id).map(t => t.id));
    setError('');
    setShowForm(true);
  }

  async function applyDefaultSlots(userId, previousIds) {
    const toAssign = defaultSlotIds.filter(id => !previousIds.includes(id));
    const toClear = previousIds.filter(id => !defaultSlotIds.includes(id));
    await Promise.all([
      ...toAssign.map(id => client.put(`/session-templates/${id}`, { dedicated_trainer_id: userId })),
      ...toClear.map(id => client.put(`/session-templates/${id}`, { dedicated_trainer_id: null }))
    ]);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (editing) {
        await client.put(`/users/${editing.id}`, { name: form.name, email: form.email, roles: form.roles, zoom_link: form.zoom_link, whatsapp_number: form.whatsapp_number });
        const previousIds = templates.filter(t => t.dedicated_trainer_id === editing.id).map(t => t.id);
        await applyDefaultSlots(editing.id, previousIds);
      } else {
        const { data } = await client.post('/users', form);
        if ((form.roles.includes('trainer') || form.roles.includes('kids_yoga_trainer')) && defaultSlotIds.length > 0) {
          await applyDefaultSlots(data.id, []);
        }
      }
      setShowForm(false);
      showToast('Trainer Saved Successfully');
      load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u) {
    if (u.id === currentUser?.id) return;
    if (u.is_active) { setDeactivating(u); return; }
    setActionError('');
    try {
      await client.put(`/users/${u.id}`, { is_active: 1 });
      load();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Failed to activate trainer'));
    }
  }

  async function confirmDeactivate() {
    const u = deactivating;
    setDeactivating(null);
    setActionError('');
    try {
      await client.put(`/users/${u.id}`, { is_active: 0 });
      load();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Failed to deactivate trainer'));
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setResetPwError('');
    setResetPwSubmitting(true);
    try {
      await client.put(`/users/${resetPw.id}/reset-password`, { password: resetPw.password });
      setResetPw({ show: false, id: null, password: '' });
      showToast('Password Reset Successfully');
    } catch (err) {
      setResetPwError(getApiErrorMessage(err, 'Failed to reset password'));
    } finally {
      setResetPwSubmitting(false);
    }
  }

  async function actOnGoogleLink(u, status) {
    setGoogleActionError('');
    setGoogleActionSubmittingId(u.id);
    try {
      await client.put(`/users/${u.id}/google-link`, { status });
      showToast('Google Link Status Updated');
      load();
    } catch (err) {
      setGoogleActionError(getApiErrorMessage(err, 'Failed to update Google link request'));
    } finally {
      setGoogleActionSubmittingId(null);
    }
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (loadError) return <div className="empty-state"><div className="empty-state-icon"><ExclamationTriangleIcon style={{ width: 20, height: 20 }} /></div><p>Couldn't load trainers. Please try again.</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Trainers</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={openAdd}><PlusIcon style={{ width: 16, height: 16 }} /> Add Trainer</button>
      </div>

      {actionError && <p className="error-text" style={{ marginBottom: 12 }}>{actionError}</p>}
      {googleActionError && <p className="error-text" style={{ marginBottom: 12 }}>{googleActionError}</p>}

      {users.map(u => (
        <div key={u.id} className="list-item" style={{ flexWrap: 'wrap' }}>
          <div className="list-item-left">
            <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {u.name}
              {!u.is_active && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>(Inactive)</span>}
              {u.google_link_status === 'pending' && <span className="badge badge-pending">Google: Pending</span>}
              {u.google_link_status === 'approved' && <span className="badge badge-approved">Google: Linked</span>}
              {u.google_link_status === 'rejected' && <span className="badge badge-rejected">Google: Rejected</span>}
            </div>
            <div className="list-item-sub">{u.email} · {u.roles.map(formatRole).join(', ')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {u.google_link_status === 'pending' && (
              <>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '6px 10px', color: 'var(--success)' }}
                  disabled={googleActionSubmittingId === u.id}
                  onClick={() => actOnGoogleLink(u, 'approved')}
                >
                  Approve Google
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '6px 10px', color: 'var(--danger)' }}
                  disabled={googleActionSubmittingId === u.id}
                  onClick={() => actOnGoogleLink(u, 'rejected')}
                >
                  Reject Google
                </button>
              </>
            )}
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => openEdit(u)}>Edit</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setResetPw({ show: true, id: u.id, password: '' })}>Reset PW</button>
            {u.id !== currentUser?.id && (
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px', color: u.is_active ? 'var(--danger)' : 'var(--success)' }} onClick={() => toggleActive(u)}>
                {u.is_active ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
        </div>
      ))}

      {showForm && (
        <Modal title={editing ? 'Edit Trainer' : 'Add Trainer'} onClose={() => setShowForm(false)}>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label" htmlFor="trainer-name">Name</label>
                <input id="trainer-name" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="trainer-email">Email</label>
                <input id="trainer-email" className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              {!editing && (
                <div className="form-group">
                  <label className="label" htmlFor="trainer-password">Password</label>
                  <PasswordInput id="trainer-password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
                </div>
              )}
              <div className="form-group">
                <label className="label">Roles</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ROLE_OPTIONS.map(r => (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={form.roles.includes(r)}
                        onChange={e => setForm(f => ({
                          ...f,
                          roles: e.target.checked ? [...f.roles, r] : f.roles.filter(x => x !== r)
                        }))}
                      />
                      {formatRole(r)}
                    </label>
                  ))}
                </div>
              </div>
              {(form.roles.includes('trainer') || form.roles.includes('kids_yoga_trainer')) && (
                <div className="form-group">
                  <label className="label">Default Sessions</label>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                    This trainer is automatically assigned to these slots as new sessions are generated. Checking a slot already held by someone else reassigns it.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {templates.map(t => (
                      <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                        <input
                          type="checkbox"
                          checked={defaultSlotIds.includes(t.id)}
                          onChange={e => {
                            if (e.target.checked && t.dedicated_trainer_id && t.dedicated_trainer_id !== editing?.id) {
                              const confirmed = window.confirm(
                                `${t.label} is currently defaulted to ${t.dedicated_trainer_name}. Reassign the default to ${form.name || 'this trainer'}? This won't change sessions already generated for ${t.dedicated_trainer_name}.`
                              );
                              if (!confirmed) return;
                            }
                            setDefaultSlotIds(ids => e.target.checked ? [...ids, t.id] : ids.filter(id => id !== t.id));
                          }}
                        />
                        {t.label}
                        {t.dedicated_trainer_id && t.dedicated_trainer_id !== editing?.id && (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>(currently: {t.dedicated_trainer_name})</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="form-group">
                <label className="label" htmlFor="trainer-zoom">Zoom Link</label>
                <input id="trainer-zoom" className="input" type="url" value={form.zoom_link} placeholder="https://us06web.zoom.us/j/…" onChange={e => setForm(f => ({ ...f, zoom_link: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="trainer-whatsapp">WhatsApp Number</label>
                <input id="trainer-whatsapp" className="input" type="tel" value={form.whatsapp_number} placeholder="+919876543210" onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))} />
                <p className="hint-text">Include the country code (e.g. +91 for India)</p>
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting || form.roles.length === 0}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {resetPw.show && (
        <Modal title="Reset Password" onClose={() => setResetPw({ show: false, id: null, password: '' })}>
            <form onSubmit={resetPassword}>
              <div className="form-group">
                <label className="label" htmlFor="reset-password">New Password</label>
                <PasswordInput id="reset-password" value={resetPw.password} onChange={e => setResetPw(p => ({ ...p, password: e.target.value }))} required minLength={8} />
              </div>
              {resetPwError && <p className="error-text" style={{ marginBottom: 12 }}>{resetPwError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setResetPw({ show: false, id: null, password: '' })}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={resetPwSubmitting}>
                  {resetPwSubmitting ? 'Resetting…' : 'Reset'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {deactivating && (
        <ConfirmDialog
          title="Deactivate Trainer"
          message={`Deactivate ${deactivating.name}? They will no longer be able to log in.`}
          confirmLabel="Deactivate"
          danger
          onCancel={() => setDeactivating(null)}
          onConfirm={confirmDeactivate}
        />
      )}
    </div>
  );
}
