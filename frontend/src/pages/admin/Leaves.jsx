import { useState, useEffect } from 'react';
import client from '../../api/client';
import Modal from '../../components/Modal';

export default function AdminLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [adminNote, setAdminNote] = useState('');

  function load() {
    setLoading(true);
    setError(false);
    const q = filter ? `?status=${filter}` : '';
    client.get(`/leaves${q}`).then(r => setLeaves(r.data)).catch(() => setError(true)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filter]);

  async function review(status) {
    await client.patch(`/leaves/${reviewing.id}/review`, { status, admin_note: adminNote });
    setReviewing(null);
    setAdminNote('');
    load();
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
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? <div className="loading">Loading…</div> : error ? (
        <div className="empty-state"><div className="empty-state-icon">⚠️</div><p>Couldn't load leaves. Please try again.</p></div>
      ) : leaves.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📝</div><p>No leaves found</p></div>
      ) : leaves.map(l => (
        <div key={l.id} className="list-item">
          <div className="list-item-left">
            <div className="list-item-title">{l.trainer_name}</div>
            <div className="list-item-sub">{l.from_date} → {l.to_date} · {l.reason}</div>
            {l.admin_note && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Note: {l.admin_note}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span className={`badge badge-${l.status}`}>{l.status}</span>
            {l.status === 'pending' && (
              <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setReviewing(l); setAdminNote(''); }}>
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
              <label className="label">Note (optional)</label>
              <textarea className="input" rows={2} value={adminNote} onChange={e => setAdminNote(e.target.value)} placeholder="Reason for decision…" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setReviewing(null)}>Cancel</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => review('rejected')}>Reject</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => review('approved')}>Approve</button>
            </div>
        </Modal>
      )}
    </div>
  );
}
