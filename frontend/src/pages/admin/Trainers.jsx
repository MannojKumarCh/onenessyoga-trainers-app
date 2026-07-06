import { useState, useEffect } from 'react';
import client from '../../api/client';

const EMPTY = { name: '', email: '', password: '', role: 'trainer', zoom_link: '' };

export default function AdminTrainers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resetPw, setResetPw] = useState({ show: false, id: null, password: '' });

  function load() {
    client.get('/users').then(r => setUsers(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setShowForm(true); }
  function openEdit(u) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, zoom_link: u.zoom_link || '' });
    setError('');
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (editing) {
        await client.put(`/users/${editing.id}`, { name: form.name, email: form.email, role: form.role, zoom_link: form.zoom_link });
      } else {
        await client.post('/users', form);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u) {
    await client.put(`/users/${u.id}`, { is_active: u.is_active ? 0 : 1 });
    load();
  }

  async function resetPassword(e) {
    e.preventDefault();
    await client.put(`/users/${resetPw.id}/reset-password`, { password: resetPw.password });
    setResetPw({ show: false, id: null, password: '' });
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Trainers</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={openAdd}>+ Add</button>
      </div>

      {users.map(u => (
        <div key={u.id} className="list-item">
          <div className="list-item-left">
            <div className="list-item-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {u.name}
              {!u.is_active && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>(inactive)</span>}
            </div>
            <div className="list-item-sub">{u.email} · {u.role.replace('_', ' ')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => openEdit(u)}>Edit</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setResetPw({ show: true, id: u.id, password: '' })}>Reset PW</button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px', color: u.is_active ? 'var(--danger)' : 'var(--success)' }} onClick={() => toggleActive(u)}>
              {u.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </div>
      ))}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{editing ? 'Edit User' : 'Add User'}</h3>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label">Name</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              {!editing && (
                <div className="form-group">
                  <label className="label">Password</label>
                  <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
                </div>
              )}
              <div className="form-group">
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="trainer">Trainer</option>
                  <option value="sequence_creator">Sequence Creator</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Zoom Link</label>
                <input className="input" type="url" value={form.zoom_link} placeholder="https://us06web.zoom.us/j/…" onChange={e => setForm(f => ({ ...f, zoom_link: e.target.value }))} />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetPw.show && (
        <div className="modal-overlay" onClick={() => setResetPw({ show: false, id: null, password: '' })}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Reset Password</h3>
            <form onSubmit={resetPassword}>
              <div className="form-group">
                <label className="label">New Password</label>
                <input className="input" type="password" value={resetPw.password} onChange={e => setResetPw(p => ({ ...p, password: e.target.value }))} required minLength={8} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setResetPw({ show: false, id: null, password: '' })}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Reset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
