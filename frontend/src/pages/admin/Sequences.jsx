import { useState, useEffect } from 'react';
import client from '../../api/client';
import { format, startOfWeek, addDays } from 'date-fns';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function AdminSequences() {
  const [sequences, setSequences] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ scheduled_date: '', topic: '', assigned_trainer_id: '', instructions: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [msg, setMsg] = useState('');

  function getWeekStart(dateStr) {
    return format(startOfWeek(new Date(dateStr), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }

  function load() {
    setLoading(true);
    const q = selectedWeek ? `?week=${selectedWeek}` : '';
    client.get(`/sequences${q}`).then(r => setSequences(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.all([client.get('/sequences/weeks'), client.get('/users/trainers')]).then(([w, t]) => {
      setWeeks(w.data);
      setTrainers(t.data);
      if (w.data.length > 0) setSelectedWeek(w.data[0]);
    });
  }, []);

  useEffect(() => { if (selectedWeek !== undefined) load(); }, [selectedWeek]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const week_start_date = getWeekStart(form.scheduled_date);
      await client.post('/sequences', { ...form, week_start_date });
      setShowForm(false);
      setForm({ scheduled_date: '', topic: '', assigned_trainer_id: '', instructions: '' });
      if (!weeks.includes(week_start_date)) setWeeks([week_start_date, ...weeks]);
      setSelectedWeek(week_start_date);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function notifyWeek() {
    setNotifying(true);
    setMsg('');
    try {
      await client.post('/sequences/notify-week', { week_start_date: selectedWeek });
      setMsg('Trainers notified!');
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed');
    } finally {
      setNotifying(false);
    }
  }

  async function deleteSeq(id) {
    if (!confirm('Delete this sequence?')) return;
    await client.delete(`/sequences/${id}`);
    load();
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Sequences</h1>
        <button className="btn btn-primary" style={{ padding: '8px 16px' }} onClick={() => setShowForm(true)}>+ Add</button>
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
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Week of {format(new Date(selectedWeek), 'd MMM yyyy')}
          </span>
          <button className="btn btn-outline" style={{ fontSize: 13, padding: '6px 14px' }} onClick={notifyWeek} disabled={notifying}>
            {notifying ? 'Notifying…' : 'Notify Trainers'}
          </button>
        </div>
      )}

      {msg && <p style={{ color: 'var(--success)', fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>{msg}</p>}

      {loading ? <div className="loading">Loading…</div> : sequences.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">⊡</div><p>No sequences this week</p></div>
      ) : sequences.map(seq => (
        <div key={seq.id} className="list-item">
          <div className="list-item-left">
            <span style={{ fontSize: 11, fontWeight: 700, color: seq.status === 'uploaded' ? 'var(--success)' : 'var(--primary)', textTransform: 'uppercase' }}>{seq.status}</span>
            <div className="list-item-title">{seq.topic}</div>
            <div className="list-item-sub">{format(new Date(seq.scheduled_date), 'EEE, d MMM')} · {seq.trainer_name}</div>
          </div>
          <button onClick={() => deleteSeq(seq.id)} style={{ color: 'var(--danger)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
        </div>
      ))}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Add Sequence</h3>
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
                <label className="label">Assign Trainer</label>
                <select className="input" value={form.assigned_trainer_id} onChange={e => setForm(f => ({ ...f, assigned_trainer_id: e.target.value }))} required>
                  <option value="">Select trainer…</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Instructions (optional)</label>
                <textarea className="input" rows={3} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} />
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
    </div>
  );
}
