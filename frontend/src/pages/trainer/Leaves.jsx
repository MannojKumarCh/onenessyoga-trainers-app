import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import { getApiErrorMessage } from '../../utils/apiError';
import { ExclamationTriangleIcon, DocumentTextIcon, PlusIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

export default function Leaves() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ from_date: '', to_date: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { showToast } = useToast();

  const load = useCallback(() => {
    client.get('/leaves/my').then(r => setLeaves(r.data)).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 30000);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await client.post('/leaves', form);
      setShowForm(false);
      setForm({ from_date: '', to_date: '', reason: '' });
      showToast('Leave Application Submitted');
      load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to apply'));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id) {
    setError('');
    try {
      await client.delete(`/leaves/${id}`);
      showToast('Leave Cancelled');
      load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to cancel leave'));
    }
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Leaves</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(true)}>
          <PlusIcon style={{ width: 16, height: 16 }} /> Apply Leave
        </button>
      </div>

      {error && !showForm && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

      {loadError ? (
        <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center' }}><ExclamationTriangleIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>Couldn't load leaves. Please try again.</p></div>
      ) : leaves.length === 0 ? (
        <div className="empty-state">
          <div style={{ display: 'flex', justifyContent: 'center' }}><DocumentTextIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div>
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
            <span className={`badge badge-${l.status}`}>{l.status.charAt(0).toUpperCase() + l.status.slice(1)}</span>
            {l.status === 'pending' && (
              <button
                onClick={() => cancel(l.id)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--danger)',
                  background: 'transparent',
                  border: '1px solid var(--danger)',
                  borderRadius: 14,
                  padding: '4px 12px',
                  cursor: 'pointer',
                  marginTop: 2,
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Cancel Leave
              </button>
            )}
          </div>
        </div>
      ))}

      {showForm && (
        <Modal title="Apply For Leave" onClose={() => setShowForm(false)}>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label" htmlFor="leave-from-date">From Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input id="leave-from-date" className="input" type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="leave-to-date">To Date <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input id="leave-to-date" className="input" type="date" value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="leave-reason">Reason <span style={{ color: 'var(--danger)' }}>*</span></label>
                <textarea id="leave-reason" className="input" rows={3} placeholder="Reason for leave…" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
}
