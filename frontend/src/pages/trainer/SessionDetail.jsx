import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { format } from 'date-fns';
import Modal from '../../components/Modal';
import { getApiErrorMessage } from '../../utils/apiError';
import { ExclamationTriangleIcon, ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';
import { getSessionImageUrl } from '../../config/sessionImages';

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    client.get(`/sessions/${id}`).then(r => {
      setSession(r.data);
      setNotes(r.data.notes || '');
    }).catch(() => setLoadError(true));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  usePolling(load, 30000);

  async function saveNotes() {
    setSaving(true);
    setError('');
    try {
      await client.patch(`/sessions/${id}/notes`, { notes });
      showToast('Notes Saved');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save notes'));
    } finally {
      setSaving(false);
    }
  }

  async function markComplete() {
    setCompleting(true);
    setError('');
    try {
      await client.patch(`/sessions/${id}/complete`, { notes });
      showToast('Session Marked Complete');
      navigate(-1);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to mark session complete'));
    } finally {
      setCompleting(false);
    }
  }

  if (loadError) return <div className="empty-state"><div style={{ display: 'flex', justifyContent: 'center' }}><ExclamationTriangleIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)' }} /></div><p>Couldn't load this session. Please try again.</p></div>;
  if (!session) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <button onClick={() => navigate(-1)} style={{ color: 'var(--primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, fontSize: 15 }}>
        <ArrowLeftIcon style={{ width: 18, height: 18 }} /> Back
      </button>

      <div style={{ marginBottom: 24 }}>
        {getSessionImageUrl(session.session_type) && (
          <img
            src={getSessionImageUrl(session.session_type)}
            alt=""
            style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}
          />
        )}
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
        <label className="label" htmlFor="session-notes">Session Notes</label>
        <textarea
          id="session-notes"
          className="input"
          rows={4}
          placeholder="Write a note…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={session.is_completed}
          style={{ resize: 'vertical' }}
        />
      </div>

      {error && !showConfirm && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}

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
        <div style={{ background: 'var(--success-light)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', textAlign: 'center', color: '#0D6B2C', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <CheckCircleIcon style={{ width: 18, height: 18 }} /> Session Completed
        </div>
      )}

      {showConfirm && (
        <Modal title="Confirm Completion" onClose={() => setShowConfirm(false)}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>Mark this session as completed? This cannot be undone.</p>
            {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={markComplete} disabled={completing}>
                {completing ? 'Saving…' : 'Confirm'}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
