import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { format, startOfWeek } from 'date-fns';
import { ExclamationTriangleIcon, QueueListIcon, PlusIcon, SparklesIcon } from '@heroicons/react/24/outline';
import TopicSelect from '../../components/TopicSelect';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import SequenceFilters from '../../components/SequenceFilters';
import SessionThumb from '../../components/SessionThumb';
import { getApiErrorMessage } from '../../utils/apiError';
import usePolling from '../../hooks/usePolling';
import { useToast } from '../../context/ToastContext';

export default function CreatorSequences() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [sequences, setSequences] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [trainers, setTrainers] = useState([]);
  const [filters, setFilters] = useState({ search: '', trainerId: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ scheduled_date: '', topic: '', assigned_trainer_id: '', instructions: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notifying, setNotifying] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showAiSchedule, setShowAiSchedule] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);
  const [planItems, setPlanItems] = useState([]);
  const [defaultTrainerId, setDefaultTrainerId] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState('');

  const filtersActive = Boolean(filters.search || filters.trainerId || filters.from || filters.to);

  const minScheduledDate = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  function getWeekStart(dateStr) {
    return format(startOfWeek(new Date(dateStr), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams();
    if (filtersActive) {
      if (filters.search) params.set('topic', filters.search);
      if (filters.trainerId) params.set('trainer_id', filters.trainerId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
    } else if (selectedWeek) {
      params.set('week', selectedWeek);
    }
    client.get(`/sequences?${params.toString()}`).then(r => setSequences(r.data)).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, [selectedWeek, filters, filtersActive]);

  useEffect(() => {
    Promise.all([client.get('/sequences/weeks'), client.get('/users/trainers')]).then(([w, t]) => {
      setWeeks(w.data);
      setTrainers(t.data);
      if (w.data.length > 0) setSelectedWeek(w.data[0]);
      else setLoading(false);
    }).catch(() => { setLoadError(true); setLoading(false); });

    client.get('/sequences/ai-schedule/usage').then(r => setAiUsage(r.data)).catch(() => {});
  }, []);

  useEffect(() => { if (!filtersActive && !selectedWeek) return; load(); }, [selectedWeek, filtersActive, load]);

  usePolling(() => load(true), 30000);

  function openAdd() {
    setEditingId(null);
    setForm({ scheduled_date: '', topic: '', assigned_trainer_id: '', instructions: '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(seq) {
    setEditingId(seq.id);
    setForm({
      scheduled_date: seq.scheduled_date,
      topic: seq.topic,
      assigned_trainer_id: seq.assigned_trainer_id || '',
      instructions: seq.instructions || ''
    });
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

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

      if (editingId) {
        await client.put(`/sequences/${editingId}`, {
          topic: form.topic,
          assigned_trainer_id: assignedTrainerId,
          instructions: form.instructions
        });
        showToast('Sequence Updated');
      } else {
        const week_start_date = getWeekStart(form.scheduled_date);
        await client.post('/sequences', { ...form, assigned_trainer_id: assignedTrainerId, week_start_date });
        if (!weeks.includes(week_start_date)) setWeeks([week_start_date, ...weeks]);
        setSelectedWeek(week_start_date);
        showToast('Sequence Assigned Successfully');
      }
      closeForm();
      setForm({ scheduled_date: '', topic: '', assigned_trainer_id: '', instructions: '' });
      load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save sequence'));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteSeq(id) {
    setDeleting(true);
    try {
      await client.delete(`/sequences/${id}`);
      setDeleteId(null);
      showToast('Sequence Deleted');
      load();
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'Failed to delete sequence') });
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  }

  async function notifyWeek() {
    setNotifying(true);
    setNotice({ type: '', text: '' });
    try {
      await client.post('/sequences/notify-week', { week_start_date: selectedWeek });
      setNotice({ type: 'success', text: 'Assigned Trainers Notified!' });
      showToast('Trainers Notified');
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'Failed to notify trainers') });
    } finally {
      setNotifying(false);
    }
  }

  async function notifySingle(id) {
    try {
      await client.post(`/sequences/${id}/notify-trainer`);
      setNotice({ type: 'success', text: 'Trainer Notified!' });
      setTimeout(() => setNotice({ type: '', text: '' }), 3000);
      showToast('Trainer Notified');
    } catch (err) {
      setNotice({ type: 'error', text: getApiErrorMessage(err, 'Failed to notify trainer') });
    }
  }

  async function generateAiSchedule() {
    setShowAiSchedule(true);
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    setBulkError('');
    setDefaultTrainerId('');
    try {
      const r = await client.post('/sequences/ai-schedule');
      setAiResult(r.data);
      setAiUsage({ used: r.data.used, remaining: r.data.remaining, limit: r.data.limit });
      setPlanItems(r.data.days.map(d => ({ scheduled_date: d.date, day: d.day, topic: d.session_type, assigned_trainer_id: '' })));
    } catch (err) {
      if (err.response?.data?.remaining !== undefined) setAiUsage(err.response.data);
      setAiError(err.response?.status === 503
        ? "AI scheduling isn't set up yet."
        : err.response?.status === 429
        ? err.response.data.error
        : getApiErrorMessage(err, 'Failed to generate a schedule'));
    } finally {
      setAiLoading(false);
    }
  }

  function applyDefaultTrainer(trainerId) {
    setDefaultTrainerId(trainerId);
    setPlanItems(items => items.map(item => ({ ...item, assigned_trainer_id: trainerId })));
  }

  function updatePlanItem(index, field, value) {
    setPlanItems(items => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  const planReadyToSubmit = planItems.length > 0 && planItems.every(item => item.topic.trim() && item.assigned_trainer_id);

  async function submitBulkSequences() {
    if (!planReadyToSubmit) return;
    setBulkSubmitting(true);
    setBulkError('');
    try {
      await client.post('/sequences/bulk', {
        week_start_date: aiResult.week_start_date,
        sequences: planItems.map(item => ({
          scheduled_date: item.scheduled_date,
          topic: item.topic,
          assigned_trainer_id: Number(item.assigned_trainer_id)
        }))
      });
      setShowAiSchedule(false);
      showToast('Week Created From AI Schedule');
      const w = aiResult.week_start_date;
      if (!weeks.includes(w)) setWeeks([w, ...weeks]);
      setSelectedWeek(w);
    } catch (err) {
      setBulkError(getApiErrorMessage(err, 'Failed to create the sequences for this week'));
    } finally {
      setBulkSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 className="page-title">Sequences</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-outline"
            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={generateAiSchedule}
            disabled={aiUsage && aiUsage.remaining <= 0}
          >
            <SparklesIcon style={{ width: 16, height: 16 }} />
            {aiUsage && aiUsage.remaining <= 0
              ? 'Daily AI Limit Reached'
              : `Generate AI Schedule${aiUsage ? ` (${aiUsage.remaining} left today)` : ''}`}
          </button>
          <button className="btn btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={openAdd}>
            <PlusIcon style={{ width: 16, height: 16 }} /> Assign Sequence
          </button>
        </div>
      </div>

      <SequenceFilters
        trainers={trainers}
        values={filters}
        onChange={patch => setFilters(f => ({ ...f, ...patch }))}
        onClear={() => setFilters({ search: '', trainerId: '', from: '', to: '' })}
      />

      {!filtersActive && (
        <>
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
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Week Of {format(new Date(selectedWeek), 'd MMM yyyy')}</span>
              <button className="btn btn-primary" style={{ fontSize: 13, padding: '6px 14px' }} onClick={notifyWeek} disabled={notifying}>
                {notifying ? 'Notifying…' : 'Notify All Trainers'}
              </button>
            </div>
          )}
        </>
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
        <div className="empty-state">
          <div className="empty-state-icon" style={{ display: 'flex', justifyContent: 'center' }}>
            <ExclamationTriangleIcon style={{ width: 20, height: 20 }} />
          </div>
          <p>Couldn't Load Sequences. Please Try Again.</p>
        </div>
      ) : sequences.length === 0 ? (
        <div className="empty-state">
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <QueueListIcon style={{ width: 48, height: 48, color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
          </div>
          <p>{filtersActive ? 'No Sequences Match Your Filters' : 'No Sequences Assigned Yet'}</p>
        </div>
      ) : sequences.map(seq => (
        <div key={seq.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/sequences/${seq.id}`)}>
          <SessionThumb topic={seq.topic} />
          <div className="list-item-left">
            <span style={{ fontSize: 11, fontWeight: 700, color: seq.status === 'uploaded' ? 'var(--success)' : 'var(--primary)' }}>
              {seq.status ? seq.status.charAt(0).toUpperCase() + seq.status.slice(1) : ''}
            </span>
            <div className="list-item-title">{seq.topic}</div>
            <div className="list-item-sub">{format(new Date(seq.scheduled_date), 'EEE, d MMM')} · {seq.trainer_name}</div>
            {seq.google_sheet_link && (
              <a href={seq.google_sheet_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: 'var(--primary)', marginTop: 4, display: 'block' }}>View Sheet</a>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            {!seq.notified_trainer_at && (
              <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 10px' }} onClick={e => { e.stopPropagation(); notifySingle(seq.id); }}>Notify</button>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={e => { e.stopPropagation(); openEdit(seq); }} style={{ color: 'var(--primary)', fontSize: 12, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
              <button onClick={e => { e.stopPropagation(); setDeleteId(seq.id); }} style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      ))}

      {showForm && (
        <Modal title={editingId ? 'Edit Sequence' : 'Assign Sequence'} onClose={closeForm}>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="label" htmlFor="creator-seq-date">Date</label>
                <input
                  id="creator-seq-date"
                  className="input"
                  type="date"
                  min={minScheduledDate}
                  value={form.scheduled_date}
                  onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                  disabled={Boolean(editingId)}
                  required
                />
                {editingId && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Date can't be changed here — delete and re-assign to move it to a different day.
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="label" htmlFor="creator-seq-topic">Topic</label>
                <TopicSelect id="creator-seq-topic" value={form.topic} onChange={val => setForm(f => ({ ...f, topic: val }))} required />
              </div>
              <div className="form-group">
                <label className="label" htmlFor="creator-seq-trainer">Assign To</label>
                <select id="creator-seq-trainer" className="input" value={form.assigned_trainer_id} onChange={e => setForm(f => ({ ...f, assigned_trainer_id: e.target.value }))} required>
                  <option value="">Select Trainer…</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="creator-seq-instructions">Instructions (Optional)</label>
                <textarea id="creator-seq-instructions" className="input" rows={3} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Any notes for the trainer…" />
              </div>
              {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Assign'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {deleteId != null && (
        <ConfirmDialog
          title="Delete Sequence"
          message="Delete this sequence? This cannot be undone."
          confirmLabel={deleting ? 'Deleting…' : 'Delete'}
          danger
          onCancel={() => setDeleteId(null)}
          onConfirm={() => deleteSeq(deleteId)}
        />
      )}

      {showAiSchedule && (
        <Modal title="AI Schedule Suggestion" onClose={() => setShowAiSchedule(false)} size="lg">
          {aiLoading ? (
            <div className="loading">Generating…</div>
          ) : aiError ? (
            <p className="error-text">{aiError}</p>
          ) : aiResult ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Week of {format(new Date(aiResult.week_start_date), 'd MMM yyyy')} — review and adjust below, then create all 6 sequences at once. Nothing is saved until you confirm.
              </p>

              <div className="form-group">
                <label className="label" htmlFor="ai-plan-default-trainer">Default Trainer For The Week</label>
                <select
                  id="ai-plan-default-trainer"
                  className="input"
                  value={defaultTrainerId}
                  onChange={e => applyDefaultTrainer(e.target.value)}
                >
                  <option value="">Select trainer…</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {planItems.map((item, i) => (
                  <div
                    key={item.scheduled_date}
                    style={{
                      padding: '10px 12px',
                      borderBottom: i < planItems.length - 1 ? '1px solid var(--border)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{item.day}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{format(new Date(item.scheduled_date), 'd MMM')}</span>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <TopicSelect
                        id={`ai-plan-topic-${i}`}
                        value={item.topic}
                        onChange={val => updatePlanItem(i, 'topic', val)}
                        required
                      />
                    </div>
                    <select
                      aria-label={`Trainer for ${item.day}`}
                      className="input"
                      value={item.assigned_trainer_id}
                      onChange={e => updatePlanItem(i, 'assigned_trainer_id', e.target.value)}
                    >
                      <option value="">Select trainer…</option>
                      {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {bulkError && <p className="error-text" style={{ marginTop: 12 }}>{bulkError}</p>}

              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10 }}>
                {aiResult.remaining} of {aiResult.limit} generations left today.
              </p>
            </>
          ) : null}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowAiSchedule(false)}>Cancel</button>
            {aiResult && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={submitBulkSequences}
                disabled={!planReadyToSubmit || bulkSubmitting}
              >
                {bulkSubmitting ? 'Creating…' : 'Create All Sequences'}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
