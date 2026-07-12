import { useState, useEffect } from 'react';
import client from '../../api/client';
import { format, startOfWeek } from 'date-fns';
import Modal from '../../components/Modal';
import { getApiErrorMessage } from '../../utils/apiError';

export default function CreatorSequences() {
  const [sequences, setSequences] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ scheduled_date: '', topic: '', assigned_trainer_id: '', instructions: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  function getWeekStart(dateStr) {
    return format(startOfWeek(new Date(dateStr), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }

  function load() {
    setLoading(true);
    setLoadError(false);
    const q = selectedWeek ? `?week=${selectedWeek}` : '';
    client.get(`/sequences${q}`).then(r => setSequences(r.data)).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.all([client.get('/sequences/weeks'), client.get('/users/trainers')]).then(([w, t]) => {
      setWeeks(w.data);
      setTrainers(t.data);
      if (w.data.length > 0) setSelectedWeek(w.data[0]);
      else setLoading(false);
    }).catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => { if (!selectedWeek) return; load(); }, [selectedWeek]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const assignedTrainerId = Number(form.assigned_trainer_id);
      if (!Number.isInteger(assignedTrainerId) || assignedTrainerId <= 0) {
        setError('Please select a valid trainer.');
        return;
      }

      const week_start_date = getWeekStart(form.scheduled_date);
      await client.post('/sequences', { ...form, assigned_trainer_id: assignedTrainerId, week_start_date });
      setShowForm(false);
      setForm({ scheduled_date: '', topic: '', assigned_trainer_id: '', instructions: '' });
      const w = week_start_date;
      if (!weeks.includes(w)) setWeeks([w, ...weeks]);
      setSelectedWeek(w);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save sequence'));
    } finally {
      setSubmitting(false);
    }
  }

  async function notifyWeek() {
    setNotifying(true);
    setNotice({ type: '', text: '' });
    try {
      await client.post('/sequences/notify-week', { week_start_date: selectedWeek });
      setNotice({ type: 'success', text: 'Assigned trainers notified!' });
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'Failed to notify trainers') });
    } finally {
      setNotifying(false);
    }
  }

  async function notifySingle(id) {
    try {
      await client.post(`/sequences/${id}/notify-trainer`);
      setNotice({ type: 'success', text: 'Trainer notified!' });
      setTimeout(() => setNotice({ type: '', text: '' }), 3000);
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'Failed to notify trainer') });
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Sequences</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={() => setShowForm(true)}>+ Assign</button>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
        {weeks.map(w => (
          <button key={w} onClick={() => setSelectedWeek(w)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            background: selectedWeek === w ? 'var(--primary)' : 'var(--white)',
            color: selectedWeek === w ? '#fff' : 'var(--text)',
            border: '1.5px solid ' + (selectedWeek === w ? 'var(--primary)' : 'var(--border)'),
            cursor: 'pointer'
          }}>
            {format(new Date(w), 'd MMM')}
          </button>
        ))}
      </div>

      {selectedWeek && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Week of {format(new Date(selectedWeek), 'd MMM yyyy')}</span>
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }} onClick={notifyWeek} disabled={notifying}>
            {notifying ? 'Notifying…' : 'Notify All Trainers'}
          </button>
        </div>
      )}

      {notice.text && (
        <p
          style={{
            color: notice.type === 'error' ? 'var(--danger)' : 'var(--success)',
            fontWeight: 600,
            marginBottom: 12,
            textAlign: 'center'
          }}
        >
          {notice.text}
        </p>
      )}

      {loading ? <div className="loading">Loading…</div> : loadError ? (
        <div className="empty-state"><div className="empty-state-icon">⚠️</div><p>Couldn't load sequences. Please try again.</p></div>
      ) : sequences.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">⊡</div><p>No sequences assigned yet</p></div>
      ) : sequences.map(seq => (
        <div key={seq.id} className="list-item">
          <div className="list-item-left">
            <span style={{ fontSize: 11, fontWeight: 700, color: seq.status === 'uploaded' ? 'var(--success)' : 'var(--primary)', textTransform: 'uppercase' }}>{seq.status}</span>
            <div className="list-item-title">{seq.topic}</div>
            <div className="list-item-sub">{format(new Date(seq.scheduled_date), 'EEE, d MMM')} · {seq.trainer_name}</div>
            {seq.google_sheet_link && (
              <a href={seq.google_sheet_link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)', marginTop: 4, display: 'block' }}>View Sheet</a>
            )}
          </div>
          {!seq.notified_trainer_at && (
            <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => notifySingle(seq.id)}>Notify</button>
          )}
        </div>
      ))}

      {showForm && (
        <Modal title="Assign Sequence" onClose={() => setShowForm(false)}>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label">Date</label>
                <input className="input" type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label">Topic</label>
                <input className="input" value={form.topic} placeholder="e.g. Surya Namaskar + Yoga" onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="label">Assign To</label>
                <select className="input" value={form.assigned_trainer_id} onChange={e => setForm(f => ({ ...f, assigned_trainer_id: e.target.value }))} required>
                  <option value="">Select trainer…</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Instructions (optional)</label>
                <textarea className="input" rows={3} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Any notes for the trainer…" />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Assign'}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
}
