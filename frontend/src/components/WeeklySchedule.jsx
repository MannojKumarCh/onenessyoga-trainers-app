import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';
import TopicSelect from './TopicSelect';
import ConfirmDialog from './ConfirmDialog';
import { getApiErrorMessage } from '../utils/apiError';
import { useToast } from '../context/ToastContext';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function WeekdayPicker({ value, onChange }) {
  function toggle(day) {
    onChange(value.includes(day) ? value.filter(d => d !== day) : [...value, day].sort());
  }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {DAY_LABELS.map((label, day) => (
        <button
          key={day}
          type="button"
          onClick={() => toggle(day)}
          className={`btn ${value.includes(day) ? 'btn-primary' : 'btn-ghost'}`}
          style={{ padding: '5px 9px', fontSize: 12, minWidth: 40 }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TemplateRow({ template, trainers, onSaved }) {
  const [form, setForm] = useState({
    scheduled_time: template.scheduled_time,
    weekdays: template.weekdays,
    session_type: template.session_type || '',
    dedicated_trainer_id: template.dedicated_trainer_id || '',
    is_active: template.is_active,
    zoom_link: template.zoom_link || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();

  const dirty = form.scheduled_time !== template.scheduled_time
    || JSON.stringify([...form.weekdays].sort()) !== JSON.stringify([...template.weekdays].sort())
    || form.session_type !== (template.session_type || '')
    || String(form.dedicated_trainer_id || '') !== String(template.dedicated_trainer_id || '')
    || form.is_active !== template.is_active
    || form.zoom_link !== (template.zoom_link || '');

  async function save() {
    const nextTrainerId = form.dedicated_trainer_id ? Number(form.dedicated_trainer_id) : null;
    if (nextTrainerId && template.dedicated_trainer_id && nextTrainerId !== template.dedicated_trainer_id) {
      const nextName = trainers.find(t => t.id === nextTrainerId)?.name || 'this trainer';
      const confirmed = window.confirm(
        `${template.label} is currently defaulted to ${template.dedicated_trainer_name}. Reassign the default to ${nextName}? This updates today's and every future ${template.label} session, except any session where the trainer was set individually on the Sessions tab.`
      );
      if (!confirmed) return;
    }
    if (form.weekdays.length === 0) {
      setError('Select at least one day.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await client.put(`/session-templates/${template.id}`, {
        scheduled_time: form.scheduled_time,
        weekdays: form.weekdays,
        session_type: form.session_type,
        dedicated_trainer_id: form.dedicated_trainer_id ? Number(form.dedicated_trainer_id) : null,
        is_active: form.is_active,
        zoom_link: form.zoom_link || null
      });
      showToast('Schedule Slot Updated');
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save slot'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await client.delete(`/session-templates/${template.id}`);
      setConfirmDelete(false);
      showToast('Schedule Slot Removed');
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to remove slot'));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="list-item" style={{ flexWrap: 'wrap', opacity: form.is_active ? 1 : 0.55 }}>
      <div className="list-item-left" style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, minWidth: 70 }}>{template.label}</span>
          <input
            type="time"
            className="input"
            style={{ width: 110 }}
            value={form.scheduled_time}
            onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={{ color: 'var(--danger)', fontSize: 12, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}
          >
            Delete
          </button>
        </div>
        <WeekdayPicker value={form.weekdays} onChange={weekdays => setForm(f => ({ ...f, weekdays }))} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <TopicSelect value={form.session_type} onChange={v => setForm(f => ({ ...f, session_type: v }))} />
          </div>
          <select
            className="input"
            style={{ minWidth: 180, flex: 1 }}
            value={form.dedicated_trainer_id}
            onChange={e => setForm(f => ({ ...f, dedicated_trainer_id: e.target.value }))}
          >
            <option value="">Unassigned</option>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="url"
            className="input"
            style={{ minWidth: 240, flex: 1 }}
            placeholder="Default Zoom Link for this slot — https://…"
            value={form.zoom_link}
            onChange={e => setForm(f => ({ ...f, zoom_link: e.target.value }))}
          />
          <button
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: 13 }}
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Remove Schedule Slot"
          message={`Remove "${template.label}"? No more sessions will be auto-generated for it going forward. Sessions already created from it (past or future) will stay as they are — delete those individually from the Sessions tab if needed.`}
          confirmLabel={deleting ? 'Removing…' : 'Remove'}
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

const EMPTY_NEW_SLOT = { scheduled_time: '06:00', weekdays: [1, 2, 3, 4, 5], session_type: 'BKP', dedicated_trainer_id: '', zoom_link: '' };

function AddSlotForm({ trainers, onAdded }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW_SLOT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  async function submit(e) {
    e.preventDefault();
    if (form.weekdays.length === 0) {
      setError('Select at least one day.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await client.post('/session-templates', {
        scheduled_time: form.scheduled_time,
        weekdays: form.weekdays,
        session_type: form.session_type,
        dedicated_trainer_id: form.dedicated_trainer_id ? Number(form.dedicated_trainer_id) : null,
        zoom_link: form.zoom_link || null
      });
      showToast('Schedule Slot Added');
      setForm(EMPTY_NEW_SLOT);
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to add slot'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-outline" style={{ padding: '8px 16px', fontSize: 13, marginBottom: 16 }} onClick={() => setOpen(true)}>
        + Add Slot
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>New Schedule Slot</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="time"
          className="input"
          style={{ width: 110 }}
          value={form.scheduled_time}
          onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))}
          required
        />
        <WeekdayPicker value={form.weekdays} onChange={weekdays => setForm(f => ({ ...f, weekdays }))} />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <TopicSelect value={form.session_type} onChange={v => setForm(f => ({ ...f, session_type: v }))} />
        </div>
        <select
          className="input"
          style={{ minWidth: 180, flex: 1 }}
          value={form.dedicated_trainer_id}
          onChange={e => setForm(f => ({ ...f, dedicated_trainer_id: e.target.value }))}
        >
          <option value="">Unassigned</option>
          {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <input
        type="url"
        className="input"
        placeholder="Default Zoom Link for this slot — https://…"
        value={form.zoom_link}
        onChange={e => setForm(f => ({ ...f, zoom_link: e.target.value }))}
      />
      {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setOpen(false); setForm(EMPTY_NEW_SLOT); setError(''); }}>Cancel</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
          {submitting ? 'Adding…' : 'Add Slot'}
        </button>
      </div>
    </form>
  );
}

export default function WeeklySchedule({ trainers }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    client.get('/session-templates').then(r => setTemplates(r.data)).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading…</div>;
  if (loadError) return <p className="error-text">Couldn't load the weekly schedule. Please try again.</p>;

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        These slots repeat automatically every week — the app keeps the next 14 days of sessions filled in from them. Changing a slot's default trainer or Zoom Link here updates today's and every future session for that slot, except any session where the trainer or link was set individually on the Sessions tab.
      </p>

      <AddSlotForm trainers={trainers} onAdded={load} />

      {templates.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No schedule slots yet — add one above.</p>
      ) : templates.map(t => (
        <TemplateRow key={t.id} template={t} trainers={trainers} onSaved={load} />
      ))}
    </div>
  );
}
