import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { format } from 'date-fns';

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    client.get(`/sessions/${id}`).then(r => {
      setSession(r.data);
      setNotes(r.data.notes || '');
    });
  }, [id]);

  async function saveNotes() {
    setSaving(true);
    await client.patch(`/sessions/${id}/notes`, { notes }).catch(() => {});
    setSaving(false);
  }

  async function markComplete() {
    setCompleting(true);
    await client.patch(`/sessions/${id}/complete`, { notes });
    navigate(-1);
  }

  if (!session) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <button onClick={() => navigate(-1)} style={{ color: 'var(--primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 15 }}>
        ← Back
      </button>

      <div style={{ marginBottom: 24 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {format(new Date(session.scheduled_date), 'EEEE, d MMMM yyyy')} · {session.scheduled_time}
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{session.title}</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Assigned Trainer</span>
          <span style={{ fontWeight: 600 }}>{session.trainer_name}</span>
        </div>
        {session.zoom_link && (
          <div style={{ padding: '10px 0' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 14, display: 'block', marginBottom: 4 }}>Zoom Link</span>
            <a href={session.zoom_link} target="_blank" rel="noreferrer" style={{ fontSize: 14, wordBreak: 'break-all', color: 'var(--primary)' }}>
              {session.zoom_link}
            </a>
          </div>
        )}
      </div>

      <div className="form-group">
        <label className="label">Session Notes</label>
        <textarea
          className="input"
          rows={4}
          placeholder="Write a note…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={session.is_completed}
          style={{ resize: 'vertical' }}
        />
      </div>

      {!session.is_completed && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" onClick={saveNotes} disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Saving…' : 'Save Notes'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowConfirm(true)} style={{ flex: 1 }}>
            Mark Complete
          </button>
        </div>
      )}

      {session.is_completed && (
        <div style={{ background: '#d1fae5', borderRadius: 'var(--radius-sm)', padding: '12px 16px', textAlign: 'center', color: '#065f46', fontWeight: 600 }}>
          ✓ Session completed
        </div>
      )}

      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Confirm Completion</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Mark this session as completed? This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={markComplete} disabled={completing}>
                {completing ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
