import { useState, useEffect } from 'react';
import client from '../../api/client';

export default function Leaves() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ from_date: '', to_date: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function load() {
    client.get('/leaves/my').then(r => setLeaves(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await client.post('/leaves', form);
      setShowForm(false);
      setForm({ from_date: '', to_date: '', reason: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id) {
    await client.delete(`/leaves/${id}`);
    load();
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Leaves</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={() => setShowForm(true)}>+ Apply</button>
      </div>

      {leaves.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <p>No leave applications yet</p>
        </div>
      ) : leaves.map(l => (
        <div key={l.id} className="list-item">
          <div className="list-item-left">
            <div className="list-item-title">{l.reason}</div>
            <div className="list-item-sub">{l.from_date} → {l.to_date}</div>
            {l.admin_note && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Note: {l.admin_note}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span className={`badge badge-${l.status}`}>{l.status}</span>
            {l.status === 'pending' && (
              <button onClick={() => cancel(l.id)} style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ))}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Apply for Leave</h3>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label">From Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input" type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label">To Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input className="input" type="date" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label">Reason <span style={{ color: 'var(--danger)' }}>*</span></label>
                <textarea className="input" rows={3} placeholder="Reason for leave…" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
