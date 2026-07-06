import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import { format } from 'date-fns';

export default function SequenceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [seq, setSeq] = useState(null);
  const [link, setLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [msg, setMsg] = useState('');

  function load() {
    client.get(`/sequences/${id}`).then(r => {
      setSeq(r.data);
      setLink(r.data.google_sheet_link || '');
    });
  }

  useEffect(() => { load(); }, [id]);

  async function upload(e) {
    e.preventDefault();
    if (!link.trim()) return;
    setUploading(true);
    try {
      await client.patch(`/sequences/${id}/upload`, { google_sheet_link: link.trim() });
      setShowUpload(false);
      setMsg('');
      load();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function notifyTeam() {
    setNotifying(true);
    try {
      await client.post(`/sequences/${id}/notify-team`);
      setMsg('Team notified!');
      load();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to notify');
    } finally {
      setNotifying(false);
    }
  }

  const isAssigned = seq?.assigned_trainer_id === user?.id;

  if (!seq) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <button onClick={() => navigate(-1)} style={{ color: 'var(--primary)', marginBottom: 16, fontSize: 15 }}>← Back</button>

      <h1 style={{ fontSize: 22, fontWeight: 700 }}>{seq.topic}</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>{format(new Date(seq.scheduled_date), 'EEEE, d MMMM yyyy')}</p>

      <div className="card" style={{ marginTop: 20, marginBottom: 16 }}>
        {[
          ['Assigned Trainer', seq.trainer_name],
          ['Status', <span className={`badge badge-${seq.status}`}>{seq.status}</span>],
          seq.google_sheet_link && ['Sheet Link', <a href={seq.google_sheet_link} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: 'break-all' }}>Open Google Sheet</a>],
        ].filter(Boolean).map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 14, minWidth: 120 }}>{label}</span>
            <span style={{ fontWeight: 500, textAlign: 'right' }}>{val}</span>
          </div>
        ))}
      </div>

      {seq.instructions && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Instructions</p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{seq.instructions}</p>
        </div>
      )}

      {msg && <p style={{ textAlign: 'center', color: 'var(--success)', marginBottom: 12, fontWeight: 600 }}>{msg}</p>}

      {isAssigned && seq.status === 'pending' && (
        <button className="btn btn-primary btn-full" onClick={() => setShowUpload(true)}>Upload Google Sheet Link</button>
      )}

      {isAssigned && seq.status === 'uploaded' && !seq.notified_team_at && (
        <button className="btn btn-primary btn-full" onClick={notifyTeam} disabled={notifying}>
          {notifying ? 'Notifying…' : 'Notify Team'}
        </button>
      )}

      {seq.notified_team_at && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
          Team notified on {format(new Date(seq.notified_team_at), 'd MMM, h:mm a')}
        </div>
      )}

      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Upload Sequence</h3>
            <form onSubmit={upload}>
              <div className="form-group">
                <label className="label">Google Sheet Link</label>
                <input className="input" type="url" placeholder="https://docs.google.com/…" value={link} onChange={e => setLink(e.target.value)} required />
              </div>
              {msg && <p className="error-text" style={{ marginBottom: 12 }}>{msg}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowUpload(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Confirm Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
