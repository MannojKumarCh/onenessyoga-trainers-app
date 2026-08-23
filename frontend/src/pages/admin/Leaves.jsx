import { useState, useEffect, useCallback } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import { ExclamationTriangleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../utils/apiError';

export default function AdminLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const { showToast } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    const q = filter ? `?status=${filter}` : '';
    client.get(`/leaves${q}`).then(r => setLeaves(r.data)).catch(() => setError(true)).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 30000);

  async function review(status) {
    setReviewError('');
    setReviewSubmitting(true);
    try {
      await client.patch(`/leaves/${reviewing.id}/review`, { status, admin_note: adminNote });
      showToast(`Leave ${status.charAt(0).toUpperCase() + status.slice(1)} Successfully`);
      setReviewing(null);
      setAdminNote('');
      load();
    } catch (err) {
      setReviewError(getApiErrorMessage(err, 'Failed to review leave'));
    } finally {
      setReviewSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Leaves</h1>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['pending', 'approved', 'rejected', ''].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
            background: filter === s ? 'var(--primary)' : 'var(--white)',
            color: filter === s ? '#fff' : 'var(--text)',
            border: '1.5px solid ' + (filter === s ? 'var(--primary)' : 'var(--border)'),
            cursor: 'pointer'
          }}>
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {loading ? <div className="loading">Loading…</div> : error ? (
        <div className="empty-state"><div className="empty-state-icon"><ExclamationTriangleIcon style={{ width: 20, height: 20 }} /></div><p>Couldn't load leaves. Please try again.</p></div>
      ) : leaves.length === 0 ? (
        <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center', margin: '0 auto 12px' }}><DocumentTextIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>No leaves found</p></div>
      ) : leaves.map(l => (
        <div key={l.id} className="list-item">
          <div className="list-item-left">
            <div className="list-item-title">{l.trainer_name}</div>
            <div className="list-item-sub">{l.from_date} → {l.to_date} · {l.reason}</div>
            {l.admin_note && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Note: {l.admin_note}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span className={`badge badge-${l.status}`}>{l.status.charAt(0).toUpperCase() + l.status.slice(1)}</span>
            {l.status === 'pending' && (
              <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setReviewing(l); setAdminNote(''); setReviewError(''); }}>
                Review
              </button>
            )}
          </div>
        </div>
      ))}

      {reviewing && (
        <Modal title="Review Leave" onClose={() => setReviewing(null)}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}><strong>{reviewing.trainer_name}</strong></p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>{reviewing.from_date} → {reviewing.to_date} · {reviewing.reason}</p>
            <div className="form-group">
              <label className="label" htmlFor="admin-leave-note">Note (Optional)</label>
              <textarea id="admin-leave-note" className="input" rows={2} value={adminNote} onChange={e => setAdminNote(e.target.value)} placeholder="Reason for decision…" />
            </div>
            {reviewError && <p className="error-text" style={{ marginBottom: 12 }}>{reviewError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} disabled={reviewSubmitting} onClick={() => setReviewing(null)}>Cancel</button>
              <button className="btn btn-danger" style={{ flex: 1 }} disabled={reviewSubmitting} onClick={() => review('rejected')}>Reject</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={reviewSubmitting} onClick={() => review('approved')}>{reviewSubmitting ? 'Saving…' : 'Approve'}</button>
            </div>
        </Modal>
      )}
    </div>
  );
}
